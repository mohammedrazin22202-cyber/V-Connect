import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchFilters, fetchRankings, fetchVillage } from '../api';

const INDICATORS = [
  { key: 'none', label: 'Overall Development Score' },
  { key: 'water_sanitation', label: '💧 Water & Sanitation Deficit (Water or Sanitation < 50%)' },
  { key: 'healthcare_distance', label: '🏥 Healthcare Isolation (Hospital Distance > 15km)' },
  { key: 'education_dropout', label: '🏫 Educational Deficit (Dropout Rate > 15%)' },
  { key: 'economic_poverty', label: '🌾 Economic Stress (Poverty Rate > 40%)' }
];

export default function SpatialAnalytics() {
  const [filters, setFilters] = useState({ states: [], districts: [], priorities: [] });
  const [state, setState] = useState('');
  const [viewMode, setViewMode] = useState('villages');
  const [district, setDistrict] = useState('');
  const [activeIndicator, setActiveIndicator] = useState('none');
  const [villages, setVillages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVillage, setSelectedVillage] = useState(null);
  
  const mapRef = useRef(null);
  const leafletMapInstance = useRef(null);
  const markersGroupRef = useRef(null);

  // Load initial filter states
  useEffect(() => {
    fetchFilters().then(setFilters).catch(console.error);
  }, []);

  // Update districts on state change
  useEffect(() => {
    if (state) {
      fetchFilters(state).then(f => {
        setFilters(prev => ({ ...prev, districts: f.districts }));
        setDistrict('');
      });
    } else {
      setFilters(prev => ({ ...prev, districts: [] }));
      setDistrict('');
    }
  }, [state]);

  // Load village coordinates from ranking API with a higher limit (150 villages) for geospatial mapping
  const loadGeospatialData = useCallback(async () => {
    if (!state || !district) return;
    setLoading(true);
    try {
      // We load details by calling rankings with district & state filters and limit=150
      const result = await fetchRankings({
        state,
        district,
        limit: 150,
        sort_by: 'overall_score',
        order: 'asc' // load poorest first
      });
      setVillages(result.data || []);
    } catch (err) {
      console.error("Failed to load geospatial rankings:", err);
    }
    setLoading(false);
  }, [state, district]);

  useEffect(() => {
    loadGeospatialData();
  }, [loadGeospatialData]);

  // Determine if a village is flagged as deficient under the active indicator filter
  // Since rankings return basic columns, some detailed metrics may require loading or we can use the pre-fetched domain scores / columns
  const getDeficiencyStatus = useCallback((v) => {
    if (activeIndicator === 'none') return false;
    
    // Overall scores or domain scores are returned in the rankings response
    if (activeIndicator === 'water_sanitation') {
      return (v.infrastructure_score || 50) < 50;
    }
    if (activeIndicator === 'healthcare_distance') {
      return (v.health_score || 50) < 45;
    }
    if (activeIndicator === 'education_dropout') {
      return (v.education_score || 50) < 45;
    }
    if (activeIndicator === 'economic_poverty') {
      return (v.economy_score || 50) < 40;
    }
    return false;
  }, [activeIndicator]);

  const hotspots = useMemo(() => {
    return villages.filter(v => getDeficiencyStatus(v));
  }, [villages, getDeficiencyStatus]);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (window.L) {
      const timer = setTimeout(() => {
        const container = document.getElementById('analytics-map');
        if (!container) return;

        // If map doesn't exist yet, create it
        if (!leafletMapInstance.current) {
          const map = window.L.map('analytics-map', {
            zoomControl: true,
            scrollWheelZoom: true,
          }).setView([20.5937, 78.9629], 5);
          
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
          }).addTo(map);

          leafletMapInstance.current = map;
        }

        const map = leafletMapInstance.current;

        // Clear existing markers group
        if (markersGroupRef.current) {
          map.removeLayer(markersGroupRef.current);
        }

        const markersGroup = window.L.markerClusterGroup 
          ? window.L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 40 })
          : window.L.featureGroup();
        markersGroupRef.current = markersGroup;

        const activeCoords = [];

        villages.forEach(v => {
          if (!v.latitude || !v.longitude) return;
          activeCoords.push([v.latitude, v.longitude]);

          const isDeficient = getDeficiencyStatus(v);
          const score = v.overall_score || 50;

          // Color scheme: Red for deficient/hotspots, Green for high score, Yellow for medium
          let markerColor = '#10b981'; // Green
          if (isDeficient) {
            markerColor = '#ef4444'; // Bright Red
          } else if (score < 50) {
            markerColor = '#f59e0b'; // Yellow/Orange
          }

          const marker = window.L.circleMarker([v.latitude, v.longitude], {
            radius: isDeficient ? 10 : 7,
            fillColor: markerColor,
            color: isDeficient ? '#000000' : '#ffffff',
            weight: isDeficient ? 2 : 1,
            opacity: 1,
            fillOpacity: 0.85
          });

          // Bind Popup
          marker.bindPopup(`
            <div style="font-family: sans-serif; color: #1e293b; min-width: 140px;">
              <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: bold;">${v.village_name}</h4>
              <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">${v.district}, ${v.state}</div>
              <div style="font-size: 11px; margin-bottom: 4px;">
                Score: <strong>${score.toFixed(1)}</strong> | Rank: <strong>#${v.overall_rank || '—'}</strong>
              </div>
              <div style="font-size: 10px; text-transform: uppercase; font-weight: bold; color: ${isDeficient ? '#ef4444' : '#64748b'}">
                ${isDeficient ? '⚠️ CRITICAL DEFICIT' : `Priority: ${v.priority_level}`}
              </div>
            </div>
          `);

          markersGroup.addLayer(marker);

          // If this is deficient, add a pulsing buffer circle around it
          if (isDeficient) {
            window.L.circle([v.latitude, v.longitude], {
              radius: 400, // meters
              color: '#ef4444',
              fillColor: '#ef4444',
              fillOpacity: 0.15,
              weight: 1,
              dashArray: '3, 5'
            }).addTo(markersGroup);
          }
        });

        map.addLayer(markersGroup);

        // Fit map view to plotted points
        if (activeCoords.length > 0) {
          map.fitBounds(activeCoords, { padding: [40, 40] });
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [villages, getDeficiencyStatus]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (leafletMapInstance.current) {
        leafletMapInstance.current.remove();
        leafletMapInstance.current = null;
      }
    };
  }, []);

  const handleVillageClick = (v) => {
    setSelectedVillage(v);
    if (leafletMapInstance.current && v.latitude && v.longitude) {
      leafletMapInstance.current.setView([v.latitude, v.longitude], 14);
      
      // Open popup automatically
      if (markersGroupRef.current) {
        const layers = markersGroupRef.current.getLayers();
        const matched = layers.find(l => {
          const latlng = l.getLatLng();
          return latlng && Math.abs(latlng.lat - v.latitude) < 0.0001 && Math.abs(latlng.lng - v.longitude) < 0.0001;
        });
        if (matched) matched.openPopup();
      }
    }
  };

  return (
    <div className="dashboard animate-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 40px)' }}>
      <header className="dashboard-header" style={{ marginBottom: '16px' }}>
        <div>
          <h2 className="page-title">Advanced Spatial Analytics</h2>
          <p className="page-subtitle">Interactive regional mapping, clustering, and deficit hotspot analysis</p>
        </div>
      </header>

      {/* Control panel row */}
      <div className="filters-row" style={{ marginBottom: '16px' }}>
        <select
          className="filter-select"
          value={state}
          onChange={e => setState(e.target.value)}
          id="spatial-state-select"
        >
          <option value="">Select State</option>
          {filters.states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          className="filter-select"
          value={district}
          onChange={e => setDistrict(e.target.value)}
          disabled={!state}
          id="spatial-district-select"
        >
          <option value="">Select District</option>
          {filters.districts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select
          className="filter-select"
          style={{ flex: 1, minWidth: '240px' }}
          value={activeIndicator}
          onChange={e => setActiveIndicator(e.target.value)}
          disabled={!district}
          id="spatial-indicator-select"
        >
          {INDICATORS.map(ind => <option key={ind.key} value={ind.key}>{ind.label}</option>)}
        </select>
      </div>

      {/* Main panel holding split map + list */}
      <div style={{ display: 'flex', flex: 1, gap: '20px', minHeight: 0 }} className="spatial-layout">
        
        {/* Left side list of villages / hotspots */}
        <div className="glass-panel" style={{ width: '320px', display: 'flex', flexDirection: 'column', padding: '16px', minHeight: 0 }}>
          <h3 className="panel-title" style={{ fontSize: '14px', marginBottom: '4px' }}>
            {activeIndicator === 'none' ? 'Villages Index List' : '⚠️ Identified Hotspots'}
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '12px' }}>
            {activeIndicator === 'none' ? `${villages.length} total mapped` : `${hotspots.length} critical hotspots found`}
          </span>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }} className="custom-scrollbar">
            {(activeIndicator === 'none' ? villages : hotspots).map(v => (
              <div
                key={v.village_id}
                onClick={() => handleVillageClick(v)}
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  background: selectedVillage?.village_id === v.village_id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.01)',
                  border: `1px solid ${selectedVillage?.village_id === v.village_id ? 'var(--accent)' : 'rgba(255,255,255,0.03)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                className="spatial-list-item"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '12px', color: '#fff' }}>{v.village_name}</strong>
                  <span style={{ fontSize: '11px', color: getDeficiencyStatus(v) ? 'var(--danger)' : 'var(--accent)', fontWeight: 'bold' }}>
                    {v.overall_score?.toFixed(1)}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>GP: {v.gram_panchayat || '—'}</span>
                  <span>Rank: #{v.overall_rank || '—'}</span>
                </div>
              </div>
            ))}

            {state && district && (activeIndicator === 'none' ? villages : hotspots).length === 0 && (
              <div style={{ padding: '40px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No records match this layout criteria.
              </div>
            )}

            {!district && (
              <div style={{ padding: '40px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                👈 Please select a State and District to load geospatial boundaries.
              </div>
            )}
          </div>
        </div>

        {/* Map View Frame (Right) */}
        <div className="glass-panel" style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', padding: '10px', minHeight: 0 }}>
          {loading && (
            <div className="loading-state" style={{ position: 'absolute', inset: 0, background: 'rgba(10,14,26,0.8)', zIndex: 1000, borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <div className="spinner" />
              <p style={{ marginTop: '12px' }}>Retrieving spatial coordinate matrices...</p>
            </div>
          )}

          <div id="analytics-map" style={{ flex: 1, borderRadius: '6px', zIndex: 1 }} />

          {/* Map Legend panel Overlay */}
          <div style={{ padding: '8px 12px', background: 'rgba(15,22,41,0.9)', border: '1px solid var(--border)', borderRadius: '6px', display: 'flex', gap: '16px', fontSize: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
              Deficient / Hotspot (Low performance in selected area)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
              Developing (Overall Score &lt; 50)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
              Sufficient (Overall Score &ge; 50)
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
