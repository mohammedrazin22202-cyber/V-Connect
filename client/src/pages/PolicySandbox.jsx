import { useState, useEffect, useMemo } from 'react';
import { fetchFilters, fetchRegionalSimulation } from '../api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const STRATEGIES = [
  { key: 'balanced', label: '⚖️ Balanced Development', desc: 'Distributes resources across all sectors based on deficit priority.' },
  { key: 'education', label: '🎓 Education & Skill-building First', desc: 'Focuses funding on digital literacy, dropout rates, and schools (70% lower intervention costs).' },
  { key: 'health', label: '🏥 Medical & Nutrition Push', desc: 'Focuses funding on malnutrition reduction, access time, and vaccinations.' },
  { key: 'infrastructure', label: '🔌 Basic Infra & Digital Connectivity', desc: 'Prioritizes clean drinking water, sanitation facilities, internet, and electricity.' }
];

const DOMAIN_COLORS = {
  economy: '#f59e0b',
  education: '#6366f1',
  health: '#ef4444',
  infrastructure: '#06b6d4',
  environment: '#10b981',
  governance: '#8b5cf6',
  social: '#ec4899',
};

export default function PolicySandbox() {
  const [filters, setFilters] = useState({ states: [], districts: [], priorities: [] });
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [budget, setBudget] = useState('10000000'); // Default 10M INR
  const [strategy, setStrategy] = useState('balanced');
  
  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Strategy comparison mode states
  const [compareMode, setCompareMode] = useState(false);
  const [strategyB, setStrategyB] = useState('education');
  const [simulationB, setSimulationB] = useState(null);

  // Load filter options
  useEffect(() => {
    fetchFilters().then(setFilters).catch(console.error);
  }, []);

  // Update districts when state changes
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

  const handleSimulate = async (e) => {
    if (e) e.preventDefault();
    if (!state || !district) {
      setError("Please select both a State and District to run the simulation.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (compareMode) {
        const [resA, resB] = await Promise.all([
          fetchRegionalSimulation({
            state,
            district,
            budget: parseFloat(budget) || 5000000,
            strategy
          }),
          fetchRegionalSimulation({
            state,
            district,
            budget: parseFloat(budget) || 5000000,
            strategy: strategyB
          })
        ]);
        
        if (resA.success && resB.success) {
          setSimulation(resA);
          setSimulationB(resB);
        } else {
          setError((!resA.success ? resA.error : resB.error) || "Simulation run failed.");
        }
      } else {
        const data = await fetchRegionalSimulation({
          state,
          district,
          budget: parseFloat(budget) || 5000000,
          strategy
        });
        if (data.success) {
          setSimulation(data);
          setSimulationB(null);
        } else {
          setError(data.error || "Simulation run failed.");
        }
      }
    } catch (err) {
      console.error(err);
      setError("An error occurred connecting to the simulation engine.");
    }
    setLoading(false);
  };

  const budgetAllocationData = useMemo(() => {
    if (!simulation || !simulation.domainBudgetSpent) return [];
    return Object.entries(simulation.domainBudgetSpent)
      .map(([key, value]) => ({
        name: key.toUpperCase(),
        value: Math.round(value),
        color: DOMAIN_COLORS[key] || '#94a3b8'
      }))
      .filter(d => d.value > 0);
  }, [simulation]);

  const topImprovedData = useMemo(() => {
    if (!simulation || !simulation.topImproved) return [];
    return simulation.topImproved.map(v => ({
      name: v.village_name,
      Baseline: v.overall_score,
      Simulated: v.simulated_overall_score,
      Gain: v.score_gain
    }));
  }, [simulation]);

  const comparisonBudgetData = useMemo(() => {
    if (!simulation || !simulation.domainBudgetSpent || !simulationB || !simulationB.domainBudgetSpent) return [];
    const domains = Object.keys(DOMAIN_COLORS);
    return domains.map(dom => ({
      name: dom.toUpperCase(),
      [simulation.strategy.toUpperCase()]: Math.round(simulation.domainBudgetSpent[dom] || 0),
      [simulationB.strategy.toUpperCase()]: Math.round(simulationB.domainBudgetSpent[dom] || 0)
    })).filter(d => d[simulation.strategy.toUpperCase()] > 0 || d[simulationB.strategy.toUpperCase()] > 0);
  }, [simulation, simulationB]);

  return (
    <div className="dashboard animate-in">
      <header className="dashboard-header">
        <div>
          <h2 className="page-title">Regional Policy Sandbox</h2>
          <p className="page-subtitle">Simulate multi-village development plans, model resource optimizations, and preview strategic rank shifts</p>
        </div>
      </header>

      {/* Simulator settings panel */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 className="panel-title" style={{ marginBottom: '16px' }}>Configure Policy Simulation Campaign</h3>
        <form onSubmit={handleSimulate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Select State</label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={state}
                onChange={e => setState(e.target.value)}
                id="sandbox-state"
              >
                <option value="">Choose State</option>
                {filters.states.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Select District</label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={district}
                onChange={e => setDistrict(e.target.value)}
                disabled={!state}
                id="sandbox-district"
              >
                <option value="">Choose District</option>
                {filters.districts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Simulation Budget (INR)</label>
              <input
                type="text"
                className="search-input"
                style={{ width: '100%', padding: '10px 14px' }}
                placeholder="e.g. 10000000"
                value={budget}
                onChange={e => setBudget(e.target.value.replace(/\D/g, ''))}
                id="sandbox-budget"
              />
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', color: '#fff', cursor: 'pointer', marginBottom: '16px' }}>
              <input 
                type="checkbox" 
                checked={compareMode} 
                onChange={e => {
                  setCompareMode(e.target.checked);
                  setSimulation(null);
                  setSimulationB(null);
                }} 
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                id="sandbox-compare-toggle"
              />
              Enable Strategy Comparison Mode (Compare two different strategies side-by-side)
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '800', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {compareMode ? 'Strategy A (Focus)' : 'Select Focus Policy Strategy'}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  {STRATEGIES.map(s => (
                    <div
                      key={s.key}
                      onClick={() => setStrategy(s.key)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: `1px solid ${strategy === s.key ? 'var(--accent)' : 'var(--border)'}`,
                        background: strategy === s.key ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.01)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      className="strategy-card"
                      id={`strategy-card-a-${s.key}`}
                    >
                      <strong style={{ fontSize: '12.5px', display: 'block', color: strategy === s.key ? '#fff' : 'var(--text-primary)' }}>{s.label}</strong>
                      <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', display: 'block', marginTop: '4px', lineHeight: '1.3' }}>{s.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {compareMode && (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '800', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Strategy B (Comparison)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    {STRATEGIES.map(s => (
                      <div
                        key={s.key}
                        onClick={() => setStrategyB(s.key)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          border: `1px solid ${strategyB === s.key ? '#06b6d4' : 'var(--border)'}`,
                          background: strategyB === s.key ? 'rgba(6,182,212,0.06)' : 'rgba(255,255,255,0.01)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        className="strategy-card"
                        id={`strategy-card-b-${s.key}`}
                      >
                        <strong style={{ fontSize: '12.5px', display: 'block', color: strategyB === s.key ? '#fff' : 'var(--text-primary)' }}>{s.label}</strong>
                        <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', display: 'block', marginTop: '4px', lineHeight: '1.3' }}>{s.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)', borderRadius: '6px', fontSize: '13px' }}>
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn--primary"
            style={{ alignSelf: 'flex-start', padding: '10px 24px' }}
            disabled={loading}
            id="run-simulation-btn"
          >
            {loading ? 'Running Optimization Engine...' : '⚡ Run Simulation Campaign'}
          </button>
        </form>
      </div>

      {/* Loading state indicator */}
      {loading && (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 20px auto' }} />
          <h4 style={{ fontSize: '16px', fontWeight: 'bold' }}>Executing Multi-Village Score Optimizations</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>
            Sorting records by developmental deficits, weighing priority tags, and running gradient cost allocations...
          </p>
        </div>
      )}

      {/* Simulator results panel */}
      {simulation && !simulationB && !loading && (
        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Main aggregation stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="stat-card glass-panel" style={{ borderLeft: '4px solid var(--accent)' }}>
              <div className="stat-card__label">Baseline Avg Score</div>
              <div className="stat-card__value">{simulation.summary.baselineAvgScore?.toFixed(1)}</div>
              <div className="stat-card__desc">National Rank: #{simulation.summary.baselineRank?.toLocaleString()}</div>
            </div>

            <div className="stat-card glass-panel" style={{ borderLeft: '4px solid #06b6d4' }}>
              <div className="stat-card__label">Simulated Avg Score</div>
              <div className="stat-card__value" style={{ color: '#06b6d4' }}>{simulation.summary.simulatedAvgScore?.toFixed(1)}</div>
              <div className="stat-card__desc">Est. Rank: #{simulation.summary.simulatedRank?.toLocaleString()}</div>
            </div>

            <div className="stat-card glass-panel" style={{ borderLeft: '4px solid var(--success)' }}>
              <div className="stat-card__label">Average Gain / Rank shift</div>
              <div className="stat-card__value" style={{ color: 'var(--success)' }}>
                +{simulation.summary.avgScoreGain?.toFixed(1)}
              </div>
              <div className="stat-card__desc">Rank Up: {simulation.summary.rankImprovement?.toLocaleString()} places</div>
            </div>

            <div className="stat-card glass-panel" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="stat-card__label">Allocated Regional Budget</div>
              <div className="stat-card__value" style={{ color: '#f59e0b' }}>₹{Math.round(simulation.summary.allocatedBudgetSum / 100000) / 10}L</div>
              <div className="stat-card__desc">Across {simulation.summary.totalVillages} villages ({simulation.summary.totalPopulation?.toLocaleString()} pop)</div>
            </div>
          </div>

          {/* Charts panel row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            
            {/* Pie budget allocations chart */}
            <div className="glass-panel" style={{ minHeight: '380px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h3 className="panel-title" style={{ marginBottom: '14px' }}>Sectoral Budget Spending</h3>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Shows how funds are distributed based on your focus strategy ROI profile.
              </p>
              {budgetAllocationData.length > 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={budgetAllocationData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {budgetAllocationData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [`₹${value.toLocaleString()}`, 'Spent Amount']}
                        contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid var(--border)', borderRadius: '8px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', justifyContent: 'center', fontSize: '11px', marginTop: '12px' }}>
                    {budgetAllocationData.map(d => (
                      <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                        {d.name}: ₹{Math.round(d.value / 1000).toLocaleString()}K
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No budget was allocated.
                </div>
              )}
            </div>

            {/* Top 5 improved villages side-by-side comparison */}
            <div className="glass-panel" style={{ minHeight: '380px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h3 className="panel-title" style={{ marginBottom: '14px' }}>Top 5 Outperforming Villages</h3>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Villages getting the highest overall score improvements from targeted campaign allocations.
              </p>
              {topImprovedData.length > 0 ? (
                <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={topImprovedData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid var(--border)', borderRadius: '8px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="Baseline" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="Simulated" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No improvement data available.
                </div>
              )}
            </div>

          </div>

          {/* Villages optimization detail list */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 className="panel-title" style={{ marginBottom: '12px' }}>Simulated Village Interventions</h3>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
              Detailed allocation breakdown for individual villages within {district} district (showing top 100).
            </p>
            <div className="table-container">
              <table className="ranking-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Village Name</th>
                    <th>Priority Level</th>
                    <th>Baseline Score</th>
                    <th>Allocated Budget</th>
                    <th>Simulated Score</th>
                    <th>Expected Gain</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.villages.map(v => (
                    <tr key={v.village_id} className="table-row">
                      <td className="td-village"><strong>{v.village_name}</strong></td>
                      <td>
                        <span className={`priority-badge priority--${v.priority_level?.toLowerCase()}`}>
                          {v.priority_level}
                        </span>
                      </td>
                      <td>{v.overall_score?.toFixed(1)}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                        ₹{v.budget_allocated?.toLocaleString()}
                      </td>
                      <td style={{ color: '#06b6d4', fontWeight: 'bold' }}>
                        {v.simulated_overall_score?.toFixed(1)}
                      </td>
                      <td>
                        {v.score_gain > 0 ? (
                          <span style={{ color: 'var(--success)', fontWeight: '600' }}>
                            +{v.score_gain?.toFixed(1)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* Comparison Results Dashboard */}
      {simulation && simulationB && !loading && (
        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: '12px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Comparing Policies for</span>
              <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', color: '#fff', fontWeight: 'bold' }}>{district}, {state}</h3>
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <span style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
                A: {STRATEGIES.find(s => s.key === strategy)?.label.split(' ')[1]}
              </span>
              <span style={{ background: 'rgba(6, 182, 212, 0.2)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', border: '1px solid rgba(6, 182, 212, 0.4)' }}>
                B: {STRATEGIES.find(s => s.key === strategyB)?.label.split(' ')[1]}
              </span>
            </div>
          </div>

          {/* Aggregated Comparisons stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div className="stat-card glass-panel" style={{ borderLeft: '4px solid var(--text-muted)' }}>
              <div className="stat-card__label">Baseline Avg Score</div>
              <div className="stat-card__value" style={{ color: 'var(--text-secondary)' }}>{simulation.summary.baselineAvgScore?.toFixed(1)}</div>
              <div className="stat-card__desc">District Rank: #{simulation.summary.baselineRank?.toLocaleString()}</div>
            </div>

            <div className="stat-card glass-panel" style={{ borderLeft: '4px solid var(--accent)' }}>
              <div className="stat-card__label">Strategy A: {STRATEGIES.find(s => s.key === strategy)?.label.replace(/[^\w\s&]/gi, '').trim()}</div>
              <div className="stat-card__value" style={{ color: 'var(--accent)' }}>{simulation.summary.simulatedAvgScore?.toFixed(1)}</div>
              <div className="stat-card__desc">Gain: +{simulation.summary.avgScoreGain?.toFixed(1)} | Rank shift: +{simulation.summary.rankImprovement?.toLocaleString()}</div>
            </div>

            <div className="stat-card glass-panel" style={{ borderLeft: '4px solid #06b6d4' }}>
              <div className="stat-card__label">Strategy B: {STRATEGIES.find(s => s.key === strategyB)?.label.replace(/[^\w\s&]/gi, '').trim()}</div>
              <div className="stat-card__value" style={{ color: '#06b6d4' }}>{simulationB.summary.simulatedAvgScore?.toFixed(1)}</div>
              <div className="stat-card__desc">Gain: +{simulationB.summary.avgScoreGain?.toFixed(1)} | Rank shift: +{simulationB.summary.rankImprovement?.toLocaleString()}</div>
            </div>
          </div>

          {/* Multi-strategy charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
            {/* Grouped Budget Allocations */}
            <div className="glass-panel" style={{ minHeight: '380px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h3 className="panel-title" style={{ marginBottom: '14px' }}>Budget Split Comparison (INR)</h3>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Grouped budget allocation compare between strategy A (purple) and strategy B (blue).
              </p>
              <div style={{ flex: 1 }}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={comparisonBudgetData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip
                      formatter={(value) => [`₹${value.toLocaleString()}`, 'Budget']}
                      contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid var(--border)', borderRadius: '8px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey={simulation.strategy.toUpperCase()} fill="var(--accent)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey={simulationB.strategy.toUpperCase()} fill="#06b6d4" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Strategy comparisons summary */}
            <div className="glass-panel" style={{ minHeight: '380px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h3 className="panel-title" style={{ marginBottom: '14px' }}>Strategic Policy Insights</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px', lineHeight: '1.5', marginTop: '10px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <strong>🏆 Direct Outcome Comparison:</strong>
                  <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {simulation.summary.simulatedAvgScore > simulationB.summary.simulatedAvgScore ? (
                      <span><strong>Strategy A ({simulation.strategy.toUpperCase()})</strong> yields a higher average district development score (+{(simulation.summary.simulatedAvgScore - simulationB.summary.simulatedAvgScore).toFixed(2)} points higher than Strategy B).</span>
                    ) : simulation.summary.simulatedAvgScore < simulationB.summary.simulatedAvgScore ? (
                      <span><strong>Strategy B ({simulationB.strategy.toUpperCase()})</strong> yields a higher average district development score (+{(simulationB.summary.simulatedAvgScore - simulation.summary.simulatedAvgScore).toFixed(2)} points higher than Strategy A).</span>
                    ) : (
                      <span>Both strategies yield the exact same average overall score improvement.</span>
                    )}
                  </p>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <strong>💸 Spending Efficiency:</strong>
                  <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Strategy A allocated <strong>₹{simulation.summary.allocatedBudgetSum?.toLocaleString()}</strong> across <strong>{simulation.summary.totalVillages}</strong> villages.
                    Strategy B allocated <strong>₹{simulationB.summary.allocatedBudgetSum?.toLocaleString()}</strong>.
                    Strategy A led to <strong>+{simulation.summary.rankImprovement?.toLocaleString()}</strong> places national rank improvement vs <strong>+{simulationB.summary.rankImprovement?.toLocaleString()}</strong> for Strategy B.
                  </p>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <strong>📈 Recommendation:</strong>
                  <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    If your goal is to maximize general district-wide rank improvements, we recommend deploying <strong>{simulation.summary.simulatedAvgScore >= simulationB.summary.simulatedAvgScore ? `Strategy A (${simulation.strategy.toUpperCase()})` : `Strategy B (${simulationB.strategy.toUpperCase()})`}</strong>. Ensure funding targets critical priority villages first.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Side by side comparison table */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 className="panel-title" style={{ marginBottom: '12px' }}>Comparison of Village Outcomes</h3>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
              Comparison of budget allocations and simulated scores for individual villages (top 100).
            </p>
            <div className="table-container">
              <table className="ranking-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Village Name</th>
                    <th>Priority</th>
                    <th>Baseline</th>
                    <th>Allocated Budget (A)</th>
                    <th>Simulated Score (A)</th>
                    <th>Allocated Budget (B)</th>
                    <th>Simulated Score (B)</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.villages.map((v, idx) => {
                    const vB = simulationB.villages.find(vb => vb.village_id === v.village_id) || {};
                    return (
                      <tr key={v.village_id} className="table-row">
                        <td className="td-village"><strong>{v.village_name}</strong></td>
                        <td>
                          <span className={`priority-badge priority--${v.priority_level?.toLowerCase()}`}>
                            {v.priority_level}
                          </span>
                        </td>
                        <td>{v.overall_score?.toFixed(1)}</td>
                        <td style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                          ₹{v.budget_allocated?.toLocaleString()}
                        </td>
                        <td style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                          {v.simulated_overall_score?.toFixed(1)}
                        </td>
                        <td style={{ color: '#06b6d4', fontWeight: 'bold' }}>
                          ₹{vB.budget_allocated?.toLocaleString() || '0'}
                        </td>
                        <td style={{ color: '#06b6d4', fontWeight: 'bold' }}>
                          {vB.simulated_overall_score?.toFixed(1) || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* Empty panel before running */}
      {!simulation && !loading && (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔬</div>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>Simulation Sandbox Idle</h3>
          <p style={{ maxWidth: '460px', margin: '8px auto 0 auto', fontSize: '13px', lineHeight: '1.5' }}>
            Select a state and district, configure an overall development campaign budget, select a policy priority, and run the simulator to preview impact analytics.
          </p>
        </div>
      )}
    </div>
  );
}
