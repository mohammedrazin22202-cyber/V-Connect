import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFilters, fetchAmenitiesStatus } from '../api';

const AMENITY_METRICS = [
  { id: 'water', key: 'has_water', rawKey: 'drinking_water_coverage_pct', label: 'Drinking Water', icon: '🚰', unit: '%', defaultT: 90, min: 0, max: 100, step: 5, color: '#06b6d4' },
  { id: 'sanitation', key: 'has_sanitation', rawKey: 'sanitation_coverage_pct', label: 'Sanitation', icon: '🚽', unit: '%', defaultT: 90, min: 0, max: 100, step: 5, color: '#ec4899' },
  { id: 'electricity', key: 'has_electricity', rawKey: 'electricity_hours_per_day', label: 'Electricity Access', icon: '⚡', unit: ' hrs/day', defaultT: 16, min: 0, max: 24, step: 1, color: '#f59e0b' },
  { id: 'school', key: 'has_school', rawKey: 'school_count', label: 'Schools Presence', icon: '🏫', unit: '', defaultT: 1, min: 0, max: 10, step: 1, color: '#6366f1' },
  { id: 'hospital', key: 'has_hospital', rawKey: 'nearest_hospital_distance_km', label: 'Hospital Proximity', icon: '🏥', unit: ' km', defaultT: 10, min: 1, max: 50, step: 1, color: '#ef4444', inverted: true },
  { id: 'road', key: 'has_road', rawKey: 'road_quality_index', label: 'Road Quality', icon: '🛣️', unit: '', defaultT: 60, min: 0, max: 100, step: 5, color: '#10b981' },
  { id: 'internet', key: 'has_internet', rawKey: 'internet_penetration%', label: 'Internet Access', icon: '📶', unit: '%', defaultT: 45, min: 0, max: 100, step: 5, color: '#8b5cf6' }
];

export default function AmenitiesTracker() {
  const navigate = useNavigate();

  // Filters State
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [fulfillment, setFulfillment] = useState('any'); // 'any' | 'all' | 'lacking'
  const [selectedMissing, setSelectedMissing] = useState([]); // array of amenity IDs
  
  // Available filter options
  const [filterOpts, setFilterOpts] = useState({ states: [], districts: [] });

  // Thresholds State
  const [thresholds, setThresholds] = useState({
    water_t: 90,
    sanitation_t: 90,
    electricity_t: 16,
    school_t: 1,
    hospital_t: 10,
    road_t: 60,
    internet_t: 45
  });

  // Slider dragging values (to avoid excessive API calls, update locally instantly, and fetch on drag end or debounce)
  const [tempThresholds, setTempThresholds] = useState({ ...thresholds });
  const [showConfig, setShowConfig] = useState(false);

  // Table & Statistics State
  const [data, setData] = useState([]);
  const [aggregates, setAggregates] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  
  // Sort State
  const [sortBy, setSortBy] = useState('overall_rank');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(1);

  // Debounce API calls for search and sliders
  const debounceTimerRef = useRef(null);

  // Load initial states and districts filter options
  useEffect(() => {
    fetchFilters().then(opts => {
      setFilterOpts(prev => ({ ...prev, states: opts.states }));
    }).catch(err => console.error('Failed to load filter options:', err));
  }, []);

  // Update districts when state selection changes
  useEffect(() => {
    if (state) {
      fetchFilters(state).then(opts => {
        setFilterOpts(prev => ({ ...prev, districts: opts.districts }));
      }).catch(err => console.error('Failed to load districts:', err));
    } else {
      setFilterOpts(prev => ({ ...prev, districts: [] }));
    }
    setDistrict('');
    setPage(1);
  }, [state]);

  // Load paginated tracker data & stats
  const loadTrackerData = useCallback(async (thresholdsToUse = thresholds) => {
    setLoading(true);
    try {
      const result = await fetchAmenitiesStatus({
        page,
        limit: 25,
        state,
        district,
        search,
        sort_by: sortBy,
        order,
        fulfillment,
        missing: selectedMissing.join(','),
        ...thresholdsToUse
      });

      setData(result.data || []);
      setPagination(result.pagination || { page: 1, totalPages: 1, total: 0 });
      setAggregates(result.aggregates || null);
    } catch (err) {
      console.error('Failed to load amenities tracker data:', err);
    }
    setLoading(false);
  }, [page, state, district, search, sortBy, order, fulfillment, selectedMissing, thresholds]);

  // Initial and reactive data loads
  useEffect(() => {
    loadTrackerData();
  }, [loadTrackerData]);

  // Handlers
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleSort = (key) => {
    if (sortBy === key) {
      setOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setOrder(key === 'overall_rank' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const toggleMissingPill = (id) => {
    setSelectedMissing(prev => {
      const updated = prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id];
      setPage(1);
      return updated;
    });
  };

  const handleSliderChange = (key, val) => {
    setTempThresholds(prev => ({ ...prev, [key]: val }));
    
    // Debounce the actual state update and database query
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setThresholds(prev => {
        const next = { ...prev, [key]: val };
        loadTrackerData(next);
        return next;
      });
      setPage(1);
    }, 400);
  };

  const resetThresholds = () => {
    const defaults = {
      water_t: 90,
      sanitation_t: 90,
      electricity_t: 16,
      school_t: 1,
      hospital_t: 10,
      road_t: 60,
      internet_t: 45
    };
    setThresholds(defaults);
    setTempThresholds(defaults);
    setPage(1);
  };

  // Build pagination numbers
  const pageNumbers = useMemo(() => {
    const { totalPages } = pagination;
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = [];
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  }, [page, pagination]);

  // Overall calculations
  const totalCount = aggregates?.total_count || 0;
  const allFulfilledCount = aggregates?.all_fulfilled_count || 0;
  const overallFulfillmentRate = totalCount > 0 ? (allFulfilledCount / totalCount * 100).toFixed(1) : '0.0';
  const lackingCount = totalCount - allFulfilledCount;

  return (
    <div className="dashboard animate-in">
      <header className="dashboard-header">
        <div>
          <h1 className="page-title">Amenities & Basic Features Tracker</h1>
          <p className="page-subtitle">Evaluate services, track thresholds, and identify infrastructure gaps across villages.</p>
        </div>
      </header>

      {/* Aggregates Summary Cards Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{overallFulfillmentRate}%</div>
          <div className="stat-label">Overall Fulfillment Rate</div>
          <div className="stat-desc">Villages meeting all {AMENITY_METRICS.length} basic thresholds</div>
          <div className="stat-trend" style={{ color: '#10b981' }}>📈 Region Target: 100%</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{allFulfilledCount.toLocaleString()}</div>
          <div className="stat-label">Fully Equipped Villages</div>
          <div className="stat-desc">Fulfilling all basic necessities</div>
          <div className="stat-trend" style={{ color: '#06b6d4' }}>Total: {totalCount.toLocaleString()}</div>
        </div>

        <div className="stat-card">
          <div className="stat-value" style={{ color: '#ef4444' }}>{lackingCount.toLocaleString()}</div>
          <div className="stat-label">Under-Provisioned Villages</div>
          <div className="stat-desc">Lacking at least 1 basic feature</div>
          <div className="stat-trend" style={{ color: '#ef4444' }}>🚨 Requires immediate intervention</div>
        </div>

        <div className="stat-card">
          <div className="stat-value" style={{ color: '#8b5cf6' }}>{selectedMissing.length ? `${selectedMissing.length} Active` : 'None'}</div>
          <div className="stat-label">Missing Feature Filters</div>
          <div className="stat-desc">Narrowing down specific resource gaps</div>
          <div className="stat-trend" style={{ color: '#8b5cf6' }}>Click pills to toggle filters</div>
        </div>
      </div>

      {/* Individual Amenities Breakdown Progress Bars */}
      <div className="glass-panel" style={{ marginBottom: '24px' }}>
        <h3 className="view-section-title" style={{ marginBottom: '20px' }}>
          <span>📊 Amenities Fulfillment Breakdown</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Percent of villages meeting the set threshold</span>
        </h3>
        
        <div className="amenities-breakdown-grid">
          {AMENITY_METRICS.map(m => {
            const field = `${m.id}_count`;
            const count = aggregates ? aggregates[field] || 0 : 0;
            const rate = totalCount > 0 ? (count / totalCount * 100).toFixed(1) : '0.0';
            const thresholdValue = thresholds[`${m.id}_t`].toString() + m.unit;
            const conditionStr = m.inverted ? `≤ ${thresholdValue}` : `≥ ${thresholdValue}`;

            return (
              <div key={m.id} className="amenity-breakdown-card">
                <div className="amenity-card-header">
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </div>
                <div className="amenity-card-value">{rate}%</div>
                <div className="amenity-card-pct">
                  {count.toLocaleString()} / {totalCount.toLocaleString()} villages
                </div>
                <div className="amenity-progress-container">
                  <div 
                    className="amenity-progress-bar"
                    style={{ width: `${rate}%`, backgroundColor: m.color }}
                  />
                </div>
                <div className="amenity-card-threshold">
                  Threshold: {conditionStr}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Controls & Filters */}
      <div className="glass-panel" style={{ marginBottom: '24px' }}>
        <div className="view-section-title">
          <span>⚙️ Custom Thresholds & Filters</span>
          <button 
            className={`config-toggle-btn ${showConfig ? 'config-toggle-btn--active' : ''}`}
            onClick={() => setShowConfig(!showConfig)}
            type="button"
          >
            {showConfig ? 'Hide Threshold Settings' : 'Adjust Service Thresholds'}
          </button>
        </div>

        {/* Sliding Threshold Adjusters (Collapsible Drawer-like component) */}
        {showConfig && (
          <div className="animate-in" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Set Fulfillment Standards</h4>
              <button className="btn btn--secondary" onClick={resetThresholds} style={{ padding: '4px 10px', fontSize: '11px' }} type="button">
                Reset Defaults
              </button>
            </div>
            
            <div className="threshold-settings-grid">
              {AMENITY_METRICS.map(m => {
                const sliderKey = `${m.id}_t`;
                return (
                  <div key={m.id} className="threshold-slider-group">
                    <div className="threshold-slider-header">
                      <span>{m.icon} {m.label}</span>
                      <span className="slider-val">
                        {m.inverted ? '≤ ' : '≥ '}{tempThresholds[sliderKey]}{m.unit}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={m.min}
                      max={m.max}
                      step={m.step}
                      value={tempThresholds[sliderKey]}
                      onChange={(e) => handleSliderChange(sliderKey, parseFloat(e.target.value))}
                      className="threshold-slider-input"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* General Search, State, District and Status Filters */}
        <form onSubmit={handleSearchSubmit} className="filters-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <label className="filter-label">State</label>
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">All States (National)</option>
              {filterOpts.states.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="filter-label">District</label>
            <select value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!state}>
              <option value="">All Districts</option>
              {filterOpts.districts.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="filter-label">Fulfillment Status</label>
            <select value={fulfillment} onChange={(e) => { setFulfillment(e.target.value); setPage(1); }}>
              <option value="any">All Villages</option>
              <option value="all">Fully Equipped (All basic services)</option>
              <option value="lacking">Under-Provisioned (Lacking 1+ basic services)</option>
            </select>
          </div>

          <div>
            <label className="filter-label">Search Village</label>
            <div className="search-form" style={{ margin: 0, width: '100%' }}>
              <input
                type="text"
                placeholder="Type village name..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ width: '100%', padding: '10px 14px' }}
              />
              <button type="submit" className="search-btn">🔍</button>
            </div>
          </div>
        </form>

        {/* Multi-Select Missing Amenities Filter */}
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <span className="filter-label" style={{ display: 'block', marginBottom: '8px' }}>
            Filter Specifically by Lacking Amenities (Select multiple)
          </span>
          <div className="multi-select-pills">
            {AMENITY_METRICS.map(m => {
              const isActive = selectedMissing.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`pill-btn ${isActive ? 'pill-btn--active' : ''}`}
                  onClick={() => toggleMissingPill(m.id)}
                >
                  <span>{m.icon}</span>
                  <span>Missing {m.label}</span>
                  {isActive && <span>✕</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Results Checklist Table */}
      <div className="glass-panel">
        <h3 className="view-section-title">
          <span>🏘️ Services Coverage Matrix</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Showing {data.length} of {pagination.total.toLocaleString()} villages
          </span>
        </h3>

        <div className="table-container">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px' }}>
              <div className="spinner" style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ marginLeft: '12px', color: 'var(--text-secondary)' }}>Loading amenities matrix...</span>
            </div>
          ) : data.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No villages matched the filter requirements and threshold configs. Try broadening your criteria.
            </div>
          ) : (
            <table className="ranking-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => handleSort('overall_rank')}>
                    Rank {sortBy === 'overall_rank' && (order === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="sortable" onClick={() => handleSort('village_name')}>
                    Village Name {sortBy === 'village_name' && (order === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="sortable" onClick={() => handleSort('district')}>
                    District {sortBy === 'district' && (order === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="sortable" onClick={() => handleSort('state')}>
                    State {sortBy === 'state' && (order === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="sortable" onClick={() => handleSort('total_population')}>
                    Population {sortBy === 'total_population' && (order === 'asc' ? '▲' : '▼')}
                  </th>
                  {AMENITY_METRICS.map(m => (
                    <th key={m.id} style={{ textAlign: 'center' }}>
                      {m.icon} {m.id.substring(0, 5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(v => (
                  <tr 
                    key={v.village_id} 
                    className="table-row animate-in" 
                    onClick={() => navigate(`/village/${v.village_id}`)}
                  >
                    <td>
                      <span className="score-pill" style={{ display: 'inline-block', minWidth: '40px', textAlign: 'center' }}>
                        #{v.overall_rank || '—'}
                      </span>
                    </td>
                    <td style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{v.village_name}</td>
                    <td>{v.district}</td>
                    <td>{v.state}</td>
                    <td>{v.total_population?.toLocaleString() || '—'}</td>
                    {AMENITY_METRICS.map(m => {
                      const isPresent = v[m.key];
                      const val = v[m.rawKey];
                      const formattedVal = val !== undefined && val !== null 
                        ? Number(val).toFixed(m.id === 'school' || m.id === 'electricity' ? 0 : 1) + m.unit 
                        : '—';
                      
                      return (
                        <td key={m.id} style={{ textAlign: 'center' }} title={`${m.label}: ${formattedVal}`}>
                          <span className={isPresent ? 'badge-fulfilled' : 'badge-lacking'}>
                            {isPresent ? '✓' : '✗'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Table Pagination */}
        {pagination.totalPages > 1 && (
          <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
            <button 
              className="btn btn--secondary" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: '6px 12px' }}
              type="button"
            >
              Previous
            </button>
            {pageNumbers.map((num, i) => (
              <button
                key={i}
                className={`btn ${num === page ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => typeof num === 'number' && setPage(num)}
                disabled={num === '...'}
                style={{ padding: '6px 12px', minWidth: '36px' }}
                type="button"
              >
                {num}
              </button>
            ))}
            <button 
              className="btn btn--secondary" 
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              style={{ padding: '6px 12px' }}
              type="button"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
