import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchRankings, fetchStats, fetchFilters } from '../api';
import ScoreBar from '../components/ScoreBar';
import StatsCards from '../components/StatsCards';

const DOMAINS = [
  { key: 'overall_score', label: 'Overall' },
  { key: 'economy_score', label: 'Economy' },
  { key: 'education_score', label: 'Education' },
  { key: 'health_score', label: 'Health' },
  { key: 'infrastructure_score', label: 'Infra' },
  { key: 'environment_score', label: 'Environ' },
  { key: 'governance_score', label: 'Govern' },
  { key: 'social_score', label: 'Social' },
];

export default function RankingDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ states: [], districts: [], priorities: [] });

  // Filter state
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('overall_rank');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(1);

  // Weight states
  const [wEco, setWEco] = useState(1);
  const [wEdu, setWEdu] = useState(1);
  const [wHea, setWHea] = useState(1);
  const [wInf, setWInf] = useState(1);
  const [wEnv, setWEnv] = useState(1);
  const [wGov, setWGov] = useState(1);
  const [wSoc, setWSoc] = useState(1);
  const [showWeightsDrawer, setShowWeightsDrawer] = useState(false);

  // View state: table | map
  const [view, setView] = useState('table');
  const mapRef = useRef(null);

  const isCustomWeightsActive = useMemo(() => {
    return wEco !== 1 || wEdu !== 1 || wHea !== 1 || wInf !== 1 || wEnv !== 1 || wGov !== 1 || wSoc !== 1;
  }, [wEco, wEdu, wHea, wInf, wEnv, wGov, wSoc]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchRankings({
        page,
        limit: 25,
        sort_by: sortBy,
        order,
        state,
        district,
        priority,
        search,
        w_eco: wEco,
        w_edu: wEdu,
        w_hea: wHea,
        w_inf: wInf,
        w_env: wEnv,
        w_gov: wGov,
        w_soc: wSoc,
      });
      setData(result.data || []);
      setPagination(result.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      console.error('Failed to load rankings:', err);
    }
    setLoading(false);
  }, [page, sortBy, order, state, district, priority, search, wEco, wEdu, wHea, wInf, wEnv, wGov, wSoc]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
    fetchFilters().then(setFilters).catch(console.error);
  }, []);

  // Load districts when state changes
  useEffect(() => {
    if (state) {
      fetchFilters(state).then(f => {
        setFilters(prev => ({ ...prev, districts: f.districts }));
      });
    } else {
      setFilters(prev => ({ ...prev, districts: [] }));
    }
    setDistrict('');
    setPage(1);
  }, [state]);

  const handleSort = (key) => {
    if (sortBy === key) {
      setOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setOrder(key === 'overall_rank' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const getPriorityClass = (level) => {
    if (!level) return '';
    const normalized = level.toLowerCase();
    const map = {
      low: 'priority--low',
      medium: 'priority--medium',
      high: 'priority--high',
      critical: 'priority--critical',
      stable: 'priority--stable',
      moderate: 'priority--moderate',
    };
    return map[normalized] || 'priority--low';
  };

  // Build pagination page numbers
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

  // Leaflet Map Initialization and updates
  useEffect(() => {
    if (view === 'map' && window.L) {
      // Small timeout to ensure container is fully rendered in DOM
      const timer = setTimeout(() => {
        const container = document.getElementById('dashboard-map');
        if (!container) return;

        if (mapRef.current) {
          mapRef.current.remove();
        }

        const map = window.L.map('dashboard-map', {
          zoomControl: true,
        });
        mapRef.current = map;

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const validPoints = data.filter(v => v.latitude && v.longitude);
        if (validPoints.length > 0) {
          validPoints.forEach(v => {
            const score = v.overall_score || 0;
            const color = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
            window.L.circleMarker([v.latitude, v.longitude], {
              radius: 8,
              fillColor: color,
              color: '#ffffff',
              weight: 1.5,
              opacity: 1,
              fillOpacity: 0.85,
            })
            .addTo(map)
            .bindPopup(`
              <div class="map-popup" style="color: #e2e8f0; font-family: sans-serif;">
                <h4 style="margin: 0 0 6px 0; color: #ffffff; font-size: 14px; font-weight: 600;">${v.village_name}</h4>
                <div style="color: #94a3b8; font-size: 11px; margin-bottom: 4px;">${v.district}, ${v.state}</div>
                <div style="font-size: 12px; margin: 6px 0;">
                  Score: <strong style="color: ${color}">${score.toFixed(1)}</strong> | Rank: <strong>#${v.overall_rank || '—'}</strong>
                </div>
                <div style="font-size: 11px; margin-bottom: 8px;">Population: ${v.total_population?.toLocaleString() || '—'}</div>
                <button 
                  onclick="window.location.hash = '#/village/${v.village_id}'; window.location.href = '/village/${v.village_id}';" 
                  style="display: inline-block; font-size: 10px; color: #6366f1; border: 1px solid rgba(99,102,241,0.4); padding: 3px 8px; border-radius: 4px; background: rgba(99,102,241,0.1); cursor: pointer; font-weight: 500;"
                >
                  View Profile &rarr;
                </button>
              </div>
            `);
          });

          const coords = validPoints.map(v => [v.latitude, v.longitude]);
          map.fitBounds(coords, { padding: [40, 40] });
        } else {
          map.setView([20.5937, 78.9629], 5);
        }
      }, 50);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [view, data]);

  // Cleanup map instance on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="dashboard animate-in">
      <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 className="page-title">Village Rankings</h2>
          <p className="page-subtitle">
            Composite ranking across 7 development domains
            {pagination.total > 0 && ` · ${pagination.total.toLocaleString()} villages`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            className={`btn ${showWeightsDrawer ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setShowWeightsDrawer(p => !p)}
            id="weights-toggle-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            ⚖️ Custom Weights 
            {isCustomWeightsActive && (
              <span style={{ fontSize: '10px', background: 'rgba(99, 102, 241, 0.3)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--accent)' }}>
                Active
              </span>
            )}
          </button>
          <div className="view-toggle" style={{ display: 'flex', background: 'var(--bg-secondary)', padding: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <button
              className={`btn ${view === 'table' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setView('table')}
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '4px' }}
              id="view-table"
            >
              📋 Table
            </button>
            <button
              className={`btn ${view === 'map' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setView('map')}
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '4px' }}
              id="view-map"
            >
              🗺️ Map
            </button>
          </div>
        </div>
      </header>

      <StatsCards stats={stats} />

      {/* Weights adjustment drawer panel */}
      {showWeightsDrawer && (
        <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', animation: 'fadeInUp 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 className="panel-title" style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Domain Weights Customizer
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Adjust sliders to change how each domain influences the overall score. Rankings will update in real-time.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  setWEco(1); setWEdu(1); setWHea(1); setWInf(1); setWEnv(1); setWGov(1); setWSoc(1);
                  setPage(1);
                }}
                id="reset-weights-btn"
                style={{ padding: '8px 14px', fontSize: '12px' }}
              >
                Reset Equal
              </button>
              <button
                className="btn btn--primary"
                onClick={() => {
                  setPage(1);
                  loadData();
                }}
                id="apply-weights-btn"
                style={{ padding: '8px 16px', fontSize: '12px' }}
              >
                Apply Custom Weights
              </button>
            </div>
          </div>
          <div className="weights-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            {[
              { key: 'w_eco', label: 'Economy', val: wEco, set: setWEco, color: '#f59e0b' },
              { key: 'w_edu', label: 'Education', val: wEdu, set: setWEdu, color: '#6366f1' },
              { key: 'w_hea', label: 'Health', val: wHea, set: setWHea, color: '#ef4444' },
              { key: 'w_inf', label: 'Infrastructure', val: wInf, set: setWInf, color: '#06b6d4' },
              { key: 'w_env', label: 'Environment', val: wEnv, set: setWEnv, color: '#10b981' },
              { key: 'w_gov', label: 'Governance', val: wGov, set: setWGov, color: '#8b5cf6' },
              { key: 'w_soc', label: 'Social', val: wSoc, set: setWSoc, color: '#ec4899' },
            ].map(w => (
              <div key={w.label} style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: w.color, fontWeight: '600' }}>{w.label}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{w.val.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.5"
                  value={w.val}
                  onChange={e => {
                    w.set(parseFloat(e.target.value));
                  }}
                  style={{ width: '100%', accentColor: w.color, cursor: 'pointer', height: '6px', borderRadius: '3px' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters Row */}
      <div className="filters-row">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            className="search-input"
            placeholder="Search village name..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            id="search-village"
          />
          <button type="submit" className="btn btn--primary" id="search-btn">Search</button>
        </form>

        <select
          className="filter-select"
          value={state}
          onChange={e => setState(e.target.value)}
          id="filter-state"
        >
          <option value="">All States</option>
          {filters.states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          className="filter-select"
          value={district}
          onChange={e => { setDistrict(e.target.value); setPage(1); }}
          disabled={!state}
          id="filter-district"
        >
          <option value="">All Districts</option>
          {filters.districts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select
          className="filter-select"
          value={priority}
          onChange={e => { setPriority(e.target.value); setPage(1); }}
          id="filter-priority"
        >
          <option value="">All Priorities</option>
          {filters.priorities.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {(state || district || priority || search || isCustomWeightsActive) && (
          <button
            className="btn btn--ghost"
            onClick={() => {
              setState(''); setDistrict(''); setPriority('');
              setSearch(''); setSearchInput('');
              setWEco(1); setWEdu(1); setWHea(1); setWInf(1); setWEnv(1); setWGov(1); setWSoc(1);
              setPage(1);
            }}
            id="clear-filters"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Main View Container */}
      {view === 'map' ? (
        <div className="glass-panel" style={{ padding: '16px', position: 'relative', minHeight: '500px' }}>
          {loading && (
            <div className="loading-state" style={{ position: 'absolute', inset: 0, background: 'rgba(10,14,26,0.8)', zIndex: 1000, borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <div className="spinner" />
              <p style={{ marginTop: '12px' }}>Loading map data...</p>
            </div>
          )}
          <div id="dashboard-map" style={{ height: '520px', width: '100%', borderRadius: 'var(--radius-sm)', zIndex: 1 }} />
          <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)', flexWrap: 'wrap', gap: '8px' }}>
            <div>* Plotted circles represent active page villages. Click a marker to view core summary.</div>
            <div style={{ display: 'flex', gap: '14px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /> Developed (≥70)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> Developing (50-69)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> Critical (&lt;50)
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Rankings Table */
        <div className="table-container glass-panel">
          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Loading rankings...</p>
            </div>
          ) : data.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <div className="empty-state-title">No villages found</div>
              <div className="empty-state-text">
                Try adjusting your filters or search query to find matching villages.
              </div>
            </div>
          ) : (
            <table className="ranking-table" id="ranking-table">
              <thead>
                <tr>
                  <th className="th-rank" onClick={() => handleSort('overall_rank')}>
                    Rank {sortBy === 'overall_rank' && (order === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="th-village">Village</th>
                  <th className="th-location">Location</th>
                  <th className="th-pop">Population</th>
                  <th className="th-priority">Priority</th>
                  {DOMAINS.map(d => (
                    <th
                      key={d.key}
                      className={`th-score sortable ${sortBy === d.key ? 'sorted' : ''}`}
                      onClick={() => handleSort(d.key)}
                    >
                      {d.label} {sortBy === d.key && (order === 'desc' ? '▼' : '▲')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr
                    key={row.village_id}
                    className="table-row"
                    onClick={() => navigate(`/village/${row.village_id}`)}
                    id={`village-row-${row.village_id}`}
                  >
                    <td className="td-rank">
                      <span className="rank-badge">
                        {row.overall_rank ? row.overall_rank.toLocaleString() : '—'}
                      </span>
                    </td>
                    <td className="td-village" title={row.village_name}>
                      {row.village_name}
                    </td>
                    <td className="td-location">
                      <span className="location-district">{row.district}</span>
                      <span className="location-state">{row.state}</span>
                    </td>
                    <td className="td-pop">{row.total_population?.toLocaleString()}</td>
                    <td className="td-priority">
                      <span className={`priority-badge ${getPriorityClass(row.priority_level)}`}>
                        {row.priority_level}
                      </span>
                    </td>
                    {DOMAINS.map(d => (
                      <td key={d.key} className="td-score">
                        <ScoreBar score={row[d.key]} size="mini" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            className="page-btn"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            id="prev-page"
          >
            ‹
          </button>
          {pageNumbers.map((p, i) =>
            p === '...' ? (
              <span key={`e${i}`} className="page-btn page-btn--ellipsis">…</span>
            ) : (
              <button
                key={p}
                className={`page-btn ${page === p ? 'page-btn--active' : ''}`}
                onClick={() => setPage(p)}
              >
                {p.toLocaleString()}
              </button>
            )
          )}
          <button
            className="page-btn"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage(p => p + 1)}
            id="next-page"
          >
            ›
          </button>
          <span className="pagination-info">
            of {pagination.totalPages.toLocaleString()} pages
          </span>
        </div>
      )}
    </div>
  );
}
