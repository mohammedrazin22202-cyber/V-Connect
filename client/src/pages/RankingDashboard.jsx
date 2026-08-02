import { useState, useEffect, useCallback, useMemo } from 'react';
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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchRankings({
        page, limit: 25, sort_by: sortBy, order,
        state, district, priority, search,
      });
      setData(result.data || []);
      setPagination(result.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      console.error('Failed to load rankings:', err);
    }
    setLoading(false);
  }, [page, sortBy, order, state, district, priority, search]);

  useEffect(() => { loadData(); }, [loadData]);

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

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h2 className="page-title">Village Rankings</h2>
          <p className="page-subtitle">
            Composite ranking across 7 development domains
            {pagination.total > 0 && ` · ${pagination.total.toLocaleString()} villages`}
          </p>
        </div>
      </header>

      <StatsCards stats={stats} />

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

        {(state || district || priority || search) && (
          <button
            className="btn btn--ghost"
            onClick={() => {
              setState(''); setDistrict(''); setPriority('');
              setSearch(''); setSearchInput(''); setPage(1);
            }}
            id="clear-filters"
          >
            Clear
          </button>
        )}
      </div>

      {/* Rankings Table */}
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
                      {row.overall_rank?.toLocaleString()}
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
