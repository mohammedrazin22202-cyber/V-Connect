import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip
} from 'recharts';
import { fetchFilters, fetchDistrictRankings, fetchRankings } from '../api';

const DOMAINS = [
  { key: 'overall_score', label: 'Overall', color: '#6366f1' },
  { key: 'economy_score', label: 'Economy', color: '#f59e0b' },
  { key: 'education_score', label: 'Education', color: '#6366f1' },
  { key: 'health_score', label: 'Health', color: '#ef4444' },
  { key: 'infrastructure_score', label: 'Infrastructure', color: '#06b6d4' },
  { key: 'environment_score', label: 'Environment', color: '#10b981' },
  { key: 'governance_score', label: 'Governance', color: '#8b5cf6' },
  { key: 'social_score', label: 'Social', color: '#ec4899' },
];

export default function DistrictProfiler() {
  const navigate = useNavigate();
  const [states, setStates] = useState([]);
  const [selectedState, setSelectedState] = useState('');
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Selection and search
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('overall_score');
  const [order, setOrder] = useState('desc');
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [vulnerableVillages, setVulnerableVillages] = useState([]);
  const [loadingVillages, setLoadingVillages] = useState(false);

  // Fetch state list
  useEffect(() => {
    fetchFilters()
      .then(res => setStates(res.states || []))
      .catch(console.error);
  }, []);

  // Fetch district rankings when state or sort configuration changes
  useEffect(() => {
    setLoading(true);
    fetchDistrictRankings({
      state: selectedState,
      sort_by: sortBy,
      order: order
    })
      .then(res => {
        if (res.success) {
          setDistricts(res.data || []);
          if (res.data && res.data.length > 0) {
            // Auto select top district if none selected
            setSelectedDistrict(res.data[0]);
          } else {
            setSelectedDistrict(null);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedState, sortBy, order]);

  // Fetch bottom 5 villages when selected district changes
  useEffect(() => {
    if (!selectedDistrict) {
      setVulnerableVillages([]);
      return;
    }
    setLoadingVillages(true);
    fetchRankings({
      state: selectedDistrict.state,
      district: selectedDistrict.district,
      limit: 5,
      sort_by: 'overall_score',
      order: 'asc' // lowest scoring first
    })
      .then(res => {
        setVulnerableVillages(res.data || []);
      })
      .catch(console.error)
      .finally(() => setLoadingVillages(false));
  }, [selectedDistrict]);

  // Filter districts by search keyword
  const filteredDistricts = useMemo(() => {
    if (!search.trim()) return districts;
    const q = search.toLowerCase();
    return districts.filter(d => 
      d.district.toLowerCase().includes(q) || 
      d.state.toLowerCase().includes(q)
    );
  }, [districts, search]);

  const handleSelectDistrict = (dist) => {
    setSelectedDistrict(dist);
  };

  // Prepare radar chart data
  const radarData = useMemo(() => {
    if (!selectedDistrict) return [];
    return DOMAINS.slice(1).map(d => ({
      domain: d.label,
      Score: selectedDistrict[d.key],
      average: 50 // baseline average
    }));
  }, [selectedDistrict]);

  // Insights computation
  const insights = useMemo(() => {
    if (!selectedDistrict) return null;
    const scores = DOMAINS.slice(1).map(d => ({
      label: d.label,
      score: selectedDistrict[d.key]
    }));
    scores.sort((a, b) => b.score - a.score);
    return {
      best: scores[0],
      worst: scores[scores.length - 1]
    };
  }, [selectedDistrict]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h2 className="page-title">District Leaderboard & Profiler</h2>
          <p className="page-subtitle">Analyze, rank, and compare district-level development averages across states</p>
        </div>
      </header>

      {/* Filter and controls bar */}
      <div className="filter-bar">
        <div className="filter-group">
          <label htmlFor="state-select">Filter State</label>
          <select
            id="state-select"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="filter-select"
          >
            <option value="">All States</option>
            {states.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="search-input">Search District</label>
          <input
            id="search-input"
            type="text"
            placeholder="Type district name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="sort-select">Sort By</label>
          <select
            id="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="filter-select"
          >
            {DOMAINS.map(d => (
              <option key={d.key} value={d.key}>{d.label} Score</option>
            ))}
            <option value="total_population">Total Population</option>
            <option value="village_count">Village Count</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="order-select">Order</label>
          <select
            id="order-select"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="filter-select"
          >
            <option value="desc">Highest First</option>
            <option value="asc">Lowest First</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading district averages...</p>
        </div>
      ) : (
        <div className="comparison-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', marginTop: '20px' }}>
          
          {/* District Table */}
          <div className="panel" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <h3 className="panel-title">Leaderboard ({filteredDistricts.length})</h3>
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>District</th>
                  <th>State</th>
                  <th>Villages</th>
                  <th>Overall Score</th>
                </tr>
              </thead>
              <tbody>
                {filteredDistricts.map((d, index) => (
                  <tr
                    key={`${d.state}-${d.district}`}
                    onClick={() => handleSelectDistrict(d)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedDistrict?.district === d.district && selectedDistrict?.state === d.state ? 'rgba(99, 102, 241, 0.12)' : ''
                    }}
                  >
                    <td><strong>#{d.rank}</strong></td>
                    <td><strong>{d.district}</strong></td>
                    <td className="text-muted" style={{ fontSize: '13px' }}>{d.state}</td>
                    <td>{d.village_count.toLocaleString()}</td>
                    <td>
                      <span
                        className="score-badge"
                        style={{
                          backgroundColor: d.overall_score >= 70 ? 'rgba(16, 185, 129, 0.15)' : d.overall_score >= 50 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: d.overall_score >= 70 ? '#10b981' : d.overall_score >= 50 ? '#f59e0b' : '#ef4444',
                          fontWeight: 'bold',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          display: 'inline-block'
                        }}
                      >
                        {d.overall_score.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredDistricts.length === 0 && (
                  <tr>
                    <td colSpan="5" className="text-center text-muted">No districts match search criteria.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Details & Insights Panel */}
          {selectedDistrict ? (
            <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <span className="badge" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', fontWeight: '600' }}>
                  District Profile
                </span>
                <h3 className="section-title" style={{ marginTop: '6px', marginBottom: '4px' }}>
                  {selectedDistrict.district}
                </h3>
                <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>
                  State: <strong>{selectedDistrict.state}</strong> | Population: <strong>{selectedDistrict.total_population?.toLocaleString()}</strong>
                </p>
              </div>

              {/* Radar Chart */}
              <div style={{ height: '240px', position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="domain" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'var(--text-muted)' }} />
                    <Radar name="Score" dataKey="Score" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.2} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Highlights & Weaknesses */}
              {insights && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="alert-box" style={{ borderLeft: '4px solid #10b981', padding: '10px', backgroundColor: 'rgba(16, 185, 129, 0.05)' }}>
                    <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>TOP STRENGTH</div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{insights.best.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Score: {insights.best.score.toFixed(1)}</div>
                  </div>
                  <div className="alert-box" style={{ borderLeft: '4px solid #ef4444', padding: '10px', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
                    <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 'bold' }}>TOP BOTTLENECK</div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{insights.worst.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Score: {insights.worst.score.toFixed(1)}</div>
                  </div>
                </div>
              )}

              {/* Vulnerable Villages */}
              <div>
                <h4 style={{ fontSize: '14px', marginBottom: '10px', fontWeight: '600' }}>
                  ⚠️ Critical Villages (Bottom 5 by Score)
                </h4>
                {loadingVillages ? (
                  <div className="text-center text-muted" style={{ padding: '20px 0' }}>
                    <span className="spinner small"></span> Loading village details...
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {vulnerableVillages.map(v => (
                      <div
                        key={v.village_id}
                        className="card"
                        onClick={() => navigate(`/village/${v.village_id}`)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          cursor: 'pointer',
                          backgroundColor: 'var(--card-bg-alt)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          transition: 'transform 0.2s',
                          fontSize: '13px'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(4px)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                      >
                        <div>
                          <strong style={{ color: 'var(--text-main)' }}>{v.village_name}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Pop: {v.total_population?.toLocaleString() ?? 'N/A'} · Rank: #{v.overall_rank}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>
                            {v.overall_score.toFixed(1)}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>➔</span>
                        </div>
                      </div>
                    ))}
                    {vulnerableVillages.length === 0 && (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>
                        No villages loaded.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="panel text-center text-muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Select a district to view profile details.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
