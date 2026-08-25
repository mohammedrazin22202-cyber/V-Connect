import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { fetchStateComparison, fetchFilters } from '../api';

const DOMAIN_KEYS = [
  { key: 'economy_score', label: 'Economy', color: '#f59e0b' },
  { key: 'education_score', label: 'Education', color: '#6366f1' },
  { key: 'health_score', label: 'Health', color: '#ef4444' },
  { key: 'infrastructure_score', label: 'Infrastructure', color: '#06b6d4' },
  { key: 'environment_score', label: 'Environment', color: '#10b981' },
  { key: 'governance_score', label: 'Governance', color: '#8b5cf6' },
  { key: 'social_score', label: 'Social', color: '#ec4899' },
];

const STATE_COLORS = [
  '#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b',
];

export default function StateComparison() {
  const [allStates, setAllStates] = useState([]);
  const [selectedStates, setSelectedStates] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('bar'); // bar | radar
  const [chipSearch, setChipSearch] = useState('');

  useEffect(() => {
    fetchFilters().then(f => setAllStates(f.states || [])).catch(console.error);
  }, []);

  // Load on first render with all states
  useEffect(() => {
    setLoading(true);
    fetchStateComparison([])
      .then(res => setData(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Filter chips by search
  const filteredStates = useMemo(() => {
    if (!chipSearch.trim()) return allStates;
    const q = chipSearch.toLowerCase();
    return allStates.filter(s => s.toLowerCase().includes(q));
  }, [allStates, chipSearch]);

  const handleToggleState = (stateName) => {
    setSelectedStates(prev => {
      const next = prev.includes(stateName)
        ? prev.filter(s => s !== stateName)
        : prev.length < 10
          ? [...prev, stateName]
          : prev;
      return next;
    });
  };

  const handleCompare = (statesList) => {
    const states = statesList || selectedStates;
    setLoading(true);
    fetchStateComparison(states)
      .then(res => setData(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleClear = () => {
    setSelectedStates([]);
    setChipSearch('');
    // Pass empty array directly to avoid stale state
    handleCompare([]);
  };

  // Prepare data for bar chart (top 15 if no selection)
  const chartData = selectedStates.length > 0
    ? data.filter(d => selectedStates.includes(d.state))
    : data.slice(0, 15);

  // Radar data for selected states
  const radarData = DOMAIN_KEYS.map(dk => {
    const entry = { domain: dk.label };
    chartData.forEach((s) => {
      entry[s.state] = s[dk.key];
    });
    return entry;
  });

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h2 className="page-title">State Comparison</h2>
          <p className="page-subtitle">
            Compare states across 7 development domains
            {data.length > 0 && ` · ${data.length} states`}
          </p>
        </div>
        <div className="view-toggle">
          <button
            className={`btn ${view === 'bar' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setView('bar')}
            id="view-bar"
          >
            Bar Chart
          </button>
          <button
            className={`btn ${view === 'radar' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setView('radar')}
            id="view-radar"
          >
            Radar
          </button>
        </div>
      </header>

      {/* State Selection */}
      <div className="glass-panel state-selector">
        <div className="state-selector-header">
          <h3 className="panel-title">
            Select States to Compare (max 10)
            {selectedStates.length > 0 && (
              <span className="selected-count"> — {selectedStates.length} selected</span>
            )}
          </h3>
          <input
            type="text"
            className="state-search-input"
            placeholder="Search states..."
            value={chipSearch}
            onChange={e => setChipSearch(e.target.value)}
            id="state-search"
          />
        </div>
        <div className="state-chips">
          {filteredStates.map(s => (
            <button
              key={s}
              className={`state-chip ${selectedStates.includes(s) ? 'state-chip--active' : ''}`}
              onClick={() => handleToggleState(s)}
            >
              {s}
            </button>
          ))}
          {filteredStates.length === 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No states match "{chipSearch}"
            </span>
          )}
        </div>
        <div className="selector-actions">
          <button className="btn btn--primary" onClick={() => handleCompare()} id="compare-btn">
            Compare {selectedStates.length > 0 ? `(${selectedStates.length})` : 'All'}
          </button>
          {selectedStates.length > 0 && (
            <button className="btn btn--ghost" onClick={handleClear}>
              Clear
            </button>
          )}
        </div>
        {selectedStates.length > 0 && (
          <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
            💡 Tip: Comparing <strong>{selectedStates.length}</strong> states side-by-side using Recharts charts.
          </div>
        )}
      </div>

      {/* Chart */}
      {loading ? (
        <div className="loading-state"><div className="spinner" /><p>Loading comparison...</p></div>
      ) : (
        <div className="glass-panel chart-panel">
          {view === 'bar' ? (
            <>
              <h3 className="panel-title">Overall Score by State</h3>
              <ResponsiveContainer width="100%" height={500}>
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="state"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    angle={-35}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fill: '#94a3b8' }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(99,102,241,0.3)',
                      borderRadius: 8,
                      color: '#e2e8f0',
                    }}
                  />
                  <Legend />
                  {DOMAIN_KEYS.map(dk => (
                    <Bar
                      key={dk.key}
                      dataKey={dk.key}
                      name={dk.label}
                      fill={dk.color}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={30}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <>
              <h3 className="panel-title">Domain Radar Comparison</h3>
              <ResponsiveContainer width="100%" height={500}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="domain" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                  {chartData.map((s, i) => (
                    <Radar
                      key={s.state}
                      name={s.state}
                      dataKey={s.state}
                      stroke={STATE_COLORS[i % STATE_COLORS.length]}
                      fill={STATE_COLORS[i % STATE_COLORS.length]}
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                  ))}
                  <Legend />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(99,102,241,0.3)',
                      borderRadius: 8,
                      color: '#e2e8f0',
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      )}

      {/* State Table */}
      {!loading && chartData.length > 0 && (
        <div className="glass-panel">
          <h3 className="panel-title">Score Breakdown</h3>
          <div className="table-container">
            <table className="ranking-table" id="state-table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Villages</th>
                  {DOMAIN_KEYS.map(dk => <th key={dk.key}>{dk.label}</th>)}
                  <th>Overall</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map(row => (
                  <tr key={row.state} className="table-row">
                    <td className="td-village">{row.state}</td>
                    <td>{row.village_count?.toLocaleString()}</td>
                    {DOMAIN_KEYS.map(dk => (
                      <td key={dk.key}>
                        <span
                          className="score-pill"
                          style={{
                            color: `hsl(${(row[dk.key] / 100) * 120}, 75%, 45%)`,
                            background: `hsl(${(row[dk.key] / 100) * 120}, 30%, 12%)`,
                          }}
                        >
                          {row[dk.key]?.toFixed(1)}
                        </span>
                      </td>
                    ))}
                    <td>
                      <span
                        className="score-pill score-pill--overall"
                        style={{
                          color: `hsl(${(row.overall_score / 100) * 120}, 75%, 45%)`,
                          background: `hsl(${(row.overall_score / 100) * 120}, 30%, 12%)`,
                        }}
                      >
                        {row.overall_score?.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
