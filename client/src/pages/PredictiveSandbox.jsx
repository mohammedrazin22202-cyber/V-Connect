import { useState, useEffect, useMemo } from 'react';
import { fetchFilters, fetchCorrelationData, fetchDistrictAggregates } from '../api';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend
} from 'recharts';

const VARIABLES = [
  { key: 'overall_score', label: 'Overall Score', category: 'Domains' },
  { key: 'economy_score', label: 'Economy Score', category: 'Domains' },
  { key: 'education_score', label: 'Education Score', category: 'Domains' },
  { key: 'health_score', label: 'Health Score', category: 'Domains' },
  { key: 'infrastructure_score', label: 'Infrastructure Score', category: 'Domains' },
  { key: 'environment_score', label: 'Environment Score', category: 'Domains' },
  { key: 'governance_score', label: 'Governance Score', category: 'Domains' },
  { key: 'social_score', label: 'Social Score', category: 'Domains' },
  
  { key: 'poverty_rate', label: 'Poverty Rate (%)', category: 'Economy' },
  { key: 'avg_household_income', label: 'Avg Household Income (INR)', category: 'Economy' },
  { key: 'crop_yield_index%', label: 'Crop Yield Index (%)', category: 'Economy' },
  
  { key: 'literacy_rate', label: 'Literacy Rate (%)', category: 'Education' },
  { key: 'female_literacy_rate', label: 'Female Literacy Rate (%)', category: 'Education' },
  { key: 'dropout_rate', label: 'School Dropout Rate (%)', category: 'Education' },
  
  { key: 'infant_mortality_rate', label: 'Infant Mortality Rate (‰)', category: 'Health' },
  { key: 'malnutrition_rate', label: 'Child Malnutrition (%)', category: 'Health' },
  { key: 'avg_healthcare_access_time_min', label: 'Healthcare Access Time (min)', category: 'Health' },
  
  { key: 'drinking_water_coverage_pct', label: 'Drinking Water Coverage (%)', category: 'Infrastructure' },
  { key: 'sanitation_coverage_pct', label: 'Sanitation Coverage (%)', category: 'Infrastructure' },
  { key: 'electricity_hours_per_day', label: 'Electricity (hrs/day)', category: 'Infrastructure' },
  { key: 'internet_penetration%', label: 'Internet Penetration (%)', category: 'Infrastructure' }
];

export default function PredictiveSandbox() {
  const [activeTab, setActiveTab] = useState('correlation');
  const [filters, setFilters] = useState({ states: [], districts: [] });
  
  // Forecast States
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [horizon, setHorizon] = useState(5);
  
  const [growthEconomy, setGrowthEconomy] = useState(2.5);
  const [growthEducation, setGrowthEducation] = useState(3.0);
  const [growthHealth, setGrowthHealth] = useState(2.0);
  const [growthInfrastructure, setGrowthInfrastructure] = useState(4.0);
  
  const [forecastResult, setForecastResult] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  // Correlation States
  const [var1, setVar1] = useState('overall_score');
  const [var2, setVar2] = useState('poverty_rate');
  const [correlationData, setCorrelationData] = useState(null);
  const [matrixData, setMatrixData] = useState(null);
  const [loadingScatter, setLoadingScatter] = useState(false);
  const [loadingMatrix, setLoadingMatrix] = useState(false);

  const [districtStats, setDistrictStats] = useState([]);

  // Load basic filter options
  useEffect(() => {
    fetchFilters().then(setFilters).catch(console.error);
    fetchDistrictAggregates().then(setDistrictStats).catch(console.error);
    loadMatrix();
  }, []);

  // Update districts when state changes
  useEffect(() => {
    if (state) {
      fetchFilters(state).then(f => {
        setFilters(prev => ({ ...prev, districts: f.districts }));
      });
    } else {
      setFilters(prev => ({ ...prev, districts: [] }));
    }
  }, [state]);

  // Load scatter correlation whenever variables change
  useEffect(() => {
    if (var1 && var2) {
      setLoadingScatter(true);
      fetchCorrelationData(var1, var2)
        .then(res => {
          if (res.success) {
            setCorrelationData(res);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingScatter(false));
    }
  }, [var1, var2]);

  const loadMatrix = () => {
    setLoadingMatrix(true);
    fetchCorrelationData()
      .then(res => {
        if (res.success) {
          setMatrixData(res.matrix);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingMatrix(false));
  };

  // Run forecast calculation locally based on current aggregated stats
  const handleRunForecast = (e) => {
    e.preventDefault();
    if (!state || !district) {
      alert("Please select both a State and District first.");
      return;
    }
    setForecastLoading(true);

    // Call state-comparison to get aggregate baseline scores for that state
    // (In a real system, we'd query the district. Here, we fetch state aggregates and run simulations)
    setTimeout(() => {
      const match = districtStats.find(d => d.state === state && d.district === district);
      const baseScores = match ? {
        economy: match.economy_score || 50,
        education: match.education_score || 50,
        health: match.health_score || 50,
        infrastructure: match.infrastructure_score || 50,
        environment: match.environment_score || 50,
        governance: match.governance_score || 50,
        social: match.social_score || 50
      } : {
        economy: 50,
        education: 50,
        health: 50,
        infrastructure: 50,
        environment: 50,
        governance: 50,
        social: 50
      };

      const yearsData = [];
      for (let y = 0; y <= horizon; y++) {
        const econ = Math.min(100, baseScores.economy * Math.pow(1 + growthEconomy / 100, y));
        const edu = Math.min(100, baseScores.education * Math.pow(1 + growthEducation / 100, y));
        const hea = Math.min(100, baseScores.health * Math.pow(1 + growthHealth / 100, y));
        const inf = Math.min(100, baseScores.infrastructure * Math.pow(1 + growthInfrastructure / 100, y));
        const env = baseScores.environment; // unchanged
        const gov = baseScores.governance; // unchanged
        const soc = baseScores.social; // unchanged
        const overall = (econ + edu + hea + inf + env + gov + soc) / 7;

        yearsData.push({
          year: `Year ${y}`,
          Overall: Number(overall.toFixed(1)),
          Economy: Number(econ.toFixed(1)),
          Education: Number(edu.toFixed(1)),
          Health: Number(hea.toFixed(1)),
          Infrastructure: Number(inf.toFixed(1))
        });
      }

      const baselineOverall = yearsData[0].Overall;
      const futureOverall = yearsData[horizon].Overall;
      const gainOverall = futureOverall - baselineOverall;

      setForecastResult({
        timeline: yearsData,
        summary: {
          baselineOverall,
          futureOverall,
          gainOverall: Number(gainOverall.toFixed(1)),
          stabilityIndex: futureOverall > 60 ? "Sufficient" : futureOverall > 50 ? "Developing" : "Critical"
        }
      });
      setForecastLoading(false);
    }, 600);
  };

  // Linear regression trendline points for scatter plot
  const regressionLine = useMemo(() => {
    if (!correlationData || !correlationData.data || correlationData.data.length === 0) return [];
    const points = correlationData.data;
    const n = points.length;
    let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    
    let minX = Infinity;
    let maxX = -Infinity;

    points.forEach(p => {
      const valX = p.x;
      const valY = p.y;
      sumX += valX;
      sumY += valY;
      sumXX += valX * valX;
      sumXY += valX * valY;
      if (valX < minX) minX = valX;
      if (valX > maxX) maxX = valX;
    });

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return [];

    const m = (n * sumXY - sumX * sumY) / denominator;
    const c = (sumY - m * sumX) / n;

    return [
      { x: minX, y: m * minX + c },
      { x: maxX, y: m * maxX + c }
    ];
  }, [correlationData]);

  // Heatmap helper cell styling
  const getHeatmapColor = (val) => {
    if (val === undefined || val === null) return 'rgba(255,255,255,0.05)';
    if (val === 1.0) return 'rgba(255,255,255,0.1)';
    const abs = Math.abs(val);
    return val >= 0 ? `rgba(16, 185, 129, ${abs * 0.75})` : `rgba(239, 68, 68, ${abs * 0.75})`;
  };

  const domainLabels = {
    overall_score: 'Overall',
    economy_score: 'Economy',
    education_score: 'Education',
    health_score: 'Health',
    infrastructure_score: 'Infra',
    environment_score: 'Environ',
    governance_score: 'Govern',
    social_score: 'Social'
  };

  return (
    <div className="dashboard animate-in">
      <header className="dashboard-header" style={{ marginBottom: '16px' }}>
        <div>
          <h2 className="page-title">Predictive Sandbox & Correlation Dashboard</h2>
          <p className="page-subtitle">Analyze relationships between indicators and simulate future growth forecasts</p>
        </div>
      </header>

      {/* Navigation tabs */}
      <div className="view-toggle" style={{ display: 'inline-flex', background: 'var(--bg-secondary)', padding: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: '20px' }}>
        <button
          className={`btn ${activeTab === 'correlation' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => setActiveTab('correlation')}
          style={{ padding: '8px 16px', fontSize: '13px' }}
          id="tab-correlation"
        >
          🔍 Indicator Correlations
        </button>
        <button
          className={`btn ${activeTab === 'forecast' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => setActiveTab('forecast')}
          style={{ padding: '8px 16px', fontSize: '13px' }}
          id="tab-forecast"
        >
          🔮 Demographic growth Forecasts
        </button>
      </div>

      {/* Tab 1: Correlation Matrix */}
      {activeTab === 'correlation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Main layout grid splitting Heatmap and Scatter chart */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
            
            {/* Domain correlation Matrix heatmap */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h3 className="panel-title" style={{ marginBottom: '6px' }}>Domain Score Correlation Heatmap</h3>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.4' }}>
                {"Statistical relationships between the 7 core pillars. Green represents positive correlation (r > 0), Red indicates negative (r < 0)."}
              </p>
              
              {loadingMatrix ? (
                <div style={{ padding: '60px 0', textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner" />
                </div>
              ) : matrixData ? (
                <div style={{ overflowX: 'auto', flex: 1 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'center' }}>
                    <thead>
                      <tr>
                        <th style={{ background: 'transparent' }} />
                        {Object.keys(matrixData).map(k => (
                          <th key={k} style={{ padding: '8px 4px', color: '#fff', fontWeight: 'bold' }}>
                            {domainLabels[k]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(matrixData).map(([rowKey, colObj]) => (
                        <tr key={rowKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 'bold', color: '#fff' }}>
                            {domainLabels[rowKey]}
                          </td>
                          {Object.entries(colObj).map(([colKey, val]) => (
                            <td
                              key={colKey}
                              style={{
                                padding: '8px 4px',
                                background: getHeatmapColor(val),
                                color: Math.abs(val) > 0.4 || val === 1.0 ? '#fff' : 'var(--text-secondary)',
                                fontWeight: val === 1.0 ? 'normal' : 'bold',
                                border: '1px solid rgba(10,14,26,0.3)',
                                transition: 'all 0.15s ease',
                                cursor: 'pointer'
                              }}
                              onClick={() => {
                                setVar1(rowKey);
                                setVar2(colKey);
                              }}
                              title={`Correlation between ${domainLabels[rowKey]} and ${domainLabels[colKey]}: ${val}`}
                            >
                              {val.toFixed(2)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Failed to load correlation matrix.
                </div>
              )}
            </div>

            {/* Scatter chart with regression line */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h3 className="panel-title" style={{ marginBottom: '12px' }}>Interactive Bivariate Scatter Plot</h3>
              
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '150px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Variable X</label>
                  <select
                    className="filter-select"
                    style={{ width: '100%', padding: '6px' }}
                    value={var1}
                    onChange={e => setVar1(e.target.value)}
                    id="scatter-x-select"
                  >
                    {VARIABLES.map(v => <option key={v.key} value={v.key}>{v.label} ({v.category})</option>)}
                  </select>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '150px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Variable Y</label>
                  <select
                    className="filter-select"
                    style={{ width: '100%', padding: '6px' }}
                    value={var2}
                    onChange={e => setVar2(e.target.value)}
                    id="scatter-y-select"
                  >
                    {VARIABLES.map(v => <option key={v.key} value={v.key}>{v.label} ({v.category})</option>)}
                  </select>
                </div>
              </div>

              {loadingScatter ? (
                <div style={{ padding: '80px 0', textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner" />
                </div>
              ) : correlationData ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  
                  {/* Correlation Coefficient display */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)', marginBottom: '14px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Pearson Correlation Coefficient (r)</span>
                    <strong style={{
                      fontSize: '18px',
                      color: correlationData.r >= 0 ? 'var(--success)' : 'var(--danger)'
                    }}>
                      {correlationData.r >= 0 ? '+' : ''}{correlationData.r.toFixed(3)}
                    </strong>
                  </div>

                  <div style={{ height: '240px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 10, right: 10, bottom: -10, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                          type="number"
                          dataKey="x"
                          name={var1}
                          tick={{ fill: '#94a3b8', fontSize: 10 }}
                          domain={['auto', 'auto']}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          name={var2}
                          tick={{ fill: '#94a3b8', fontSize: 10 }}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid var(--border)', borderRadius: '8px' }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const item = payload[0].payload;
                              return (
                                <div style={{ color: '#fff', fontSize: '11px', padding: '6px' }}>
                                  <strong style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>{item.name}</strong>
                                  <span style={{ color: 'var(--text-secondary)' }}>{item.district}, {item.state}</span>
                                  <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px' }}>
                                    X Value: <strong>{Number(item.x).toFixed(1)}</strong><br />
                                    Y Value: <strong>{Number(item.y).toFixed(1)}</strong>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Scatter name="Villages" data={correlationData.data} fill="rgba(99, 102, 241, 0.5)" line={false} />
                        {regressionLine.length > 0 && (
                          <Scatter name="Trendline" data={regressionLine} fill="transparent" line={{ stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '4 4' }} />
                        )}
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginTop: '10px', fontStyle: 'italic' }}>
                    * Trendline represents the linear regression line of best fit (Y = mX + C).
                  </div>
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Failed to load scatter data.
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Tab 2: Forecast Sandbox */}
      {activeTab === 'forecast' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            
            {/* Input params panel (Left) */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 className="panel-title" style={{ marginBottom: '16px' }}>Forecast Simulation Parameters</h3>
              <form onSubmit={handleRunForecast} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Select State</label>
                  <select
                    className="filter-select"
                    style={{ width: '100%', padding: '8px' }}
                    value={state}
                    onChange={e => setState(e.target.value)}
                    id="forecast-state"
                  >
                    <option value="">Choose State</option>
                    {filters.states.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Select District</label>
                  <select
                    className="filter-select"
                    style={{ width: '100%', padding: '8px' }}
                    value={district}
                    onChange={e => setDistrict(e.target.value)}
                    disabled={!state}
                    id="forecast-district"
                  >
                    <option value="">Choose District</option>
                    {filters.districts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Forecast Horizon: {horizon} Years</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={horizon}
                    onChange={e => setHorizon(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer', height: '6px', borderRadius: '3px' }}
                  />
                </div>

                <h4 style={{ fontSize: '12px', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '4px', margin: '10px 0 4px 0' }}>Annual Sector Growth Target rates</h4>
                
                {[
                  { label: 'Economy & Agri', val: growthEconomy, set: setGrowthEconomy, color: '#f59e0b' },
                  { label: 'Education', val: growthEducation, set: setGrowthEducation, color: '#6366f1' },
                  { label: 'Health & Nutrition', val: growthHealth, set: setGrowthHealth, color: '#ef4444' },
                  { label: 'Infrastructure', val: growthInfrastructure, set: setGrowthInfrastructure, color: '#06b6d4' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                      <span style={{ color: s.color }}>{s.label}</span>
                      <strong style={{ color: '#fff' }}>{s.val > 0 ? '+' : ''}{s.val.toFixed(1)}%</strong>
                    </div>
                    <input
                      type="range"
                      min="-5"
                      max="10"
                      step="0.5"
                      value={s.val}
                      onChange={e => s.set(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: s.color, cursor: 'pointer', height: '4px', borderRadius: '2px' }}
                    />
                  </div>
                ))}

                <button
                  type="submit"
                  className="btn btn--primary animate-pulse"
                  style={{ width: '100%', padding: '10px 0', marginTop: '10px' }}
                  disabled={forecastLoading}
                  id="run-forecast-btn"
                >
                  {forecastLoading ? 'Calculating Projections...' : '⚡ Project Development Trends'}
                </button>

              </form>
            </div>

            {/* Results graph panel (Right) */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', minHeight: '380px' }}>
              <h3 className="panel-title" style={{ marginBottom: '14px' }}>Simulated Growth Trajectory</h3>
              
              {forecastLoading ? (
                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                  <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>Modeling compound growth profiles...</p>
                </div>
              ) : forecastResult ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  
                  {/* Aggregates row banner */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)', marginBottom: '18px', textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>BASELINE SCORE</div>
                      <strong style={{ fontSize: '16px', color: '#fff' }}>{forecastResult.summary.baselineOverall.toFixed(1)}</strong>
                    </div>
                    <div>
                      <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>PROJECTED SCORE</div>
                      <strong style={{ fontSize: '16px', color: 'var(--success)' }}>{forecastResult.summary.futureOverall.toFixed(1)}</strong>
                    </div>
                    <div>
                      <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>TOTAL NET GAIN</div>
                      <strong style={{ fontSize: '16px', color: 'var(--accent)' }}>+{forecastResult.summary.gainOverall.toFixed(1)}</strong>
                    </div>
                  </div>

                  {/* Multi-line chart */}
                  <div style={{ flex: 1, minHeight: '220px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={forecastResult.timeline} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[30, 100]} />
                        <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Line type="monotone" dataKey="Overall" stroke="#ffffff" strokeWidth={3} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="Economy" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Education" stroke="#6366f1" strokeWidth={1.5} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Health" stroke="#ef4444" strokeWidth={1.5} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Infrastructure" stroke="#06b6d4" strokeWidth={1.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '10px', lineHeight: '1.4' }}>
                    💡 <strong>Analysis Summary</strong>: Under this custom growth agenda, district {district} is estimated to expand its average score to <strong>{forecastResult.summary.futureOverall.toFixed(1)}</strong> in {horizon} years, lifting it into the <strong>{forecastResult.summary.stabilityIndex}</strong> development category.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                  👈 Configure parameters on the left and run simulation to preview forecasts.
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
