import { useState, useEffect, useMemo } from 'react';
import { fetchRankings, fetchVillage } from '../api';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend
} from 'recharts';

const DOMAIN_KEYS = [
  { key: 'economy_score', label: 'Economy', color: '#f59e0b' },
  { key: 'education_score', label: 'Education', color: '#6366f1' },
  { key: 'health_score', label: 'Health', color: '#ef4444' },
  { key: 'infrastructure_score', label: 'Infrastructure', color: '#06b6d4' },
  { key: 'environment_score', label: 'Environment', color: '#10b981' },
  { key: 'governance_score', label: 'Governance', color: '#8b5cf6' },
  { key: 'social_score', label: 'Social', color: '#ec4899' },
];

const COMP_COLORS = ['#6366f1', '#06b6d4', '#ec4899'];

const METRIC_MAP = {
  "Economy": ["employment_rate", "avg_household_income", "poverty_rate", "crop_yield_index%", "farmer_income_avg", "farmer_debt_index", "market_access_score", "bank_access_score"],
  "Education": ["literacy_rate", "female_literacy_rate", "dropout_rate", "school_count", "teacher_student_ratio", "digital_literacy_rate"],
  "Health": ["infant_mortality_rate", "malnutrition_rate", "vaccination_coverage%", "medical_staff_per_1000", "avg_healthcare_access_time_min", "healthcare_effectiveness_score"],
  "Infrastructure": ["drinking_water_coverage_pct", "sanitation_coverage_pct", "road_quality_index", "electricity_hours_per_day", "internet_penetration%", "nearest_hospital_distance_km"],
  "Environment": ["flood_risk_score", "earthquake_risk_score", "air_quality_index", "forest_cover_pct", "disaster_preparedness_score", "climate_vulnerability_index"],
  "Governance": ["panchayat_efficiency_score", "transparency_index", "fund_utilization_pct", "scheme_coverage_pct", "corruption_risk_proxy"],
  "Social": ["total_crime_rate", "crimes_against_women_rate", "social_cohesion_index", "community_participation_score", "youth_engagement_score"],
};

// Negative indicators where LOWER value is better
const NEGATIVE_METRICS = [
  "poverty_rate", "farmer_debt_index", "dropout_rate", "infant_mortality_rate", 
  "malnutrition_rate", "avg_healthcare_access_time_min", "flood_risk_score", 
  "earthquake_risk_score", "climate_vulnerability_index", "corruption_risk_proxy", 
  "total_crime_rate", "crimes_against_women_rate", "nearest_hospital_distance_km",
  "air_quality_index"
];

function formatMetricName(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/%/g, '')
    .replace(/\bpct\b/g, '%')
    .replace(/\bavg\b/gi, 'Avg')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function VillageComparison() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  
  const [compareIds, setCompareIds] = useState([]);
  const [compareData, setCompareData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch search results as user types
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      fetchRankings({ search: searchQuery, limit: 8 })
        .then(res => {
          setSearchResults(res.data || []);
        })
        .catch(console.error)
        .finally(() => setSearchLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load details for selected villages
  useEffect(() => {
    if (compareIds.length === 0) {
      setCompareData([]);
      return;
    }
    setLoading(true);
    Promise.all(compareIds.map(id => fetchVillage(id)))
      .then(results => {
        setCompareData(results.map(r => ({
          village: r.village,
          metrics: r.metrics
        })));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [compareIds]);

  const handleAddVillage = (village) => {
    if (compareIds.includes(village.village_id)) return;
    if (compareIds.length >= 3) {
      alert("You can compare a maximum of 3 villages.");
      return;
    }
    setCompareIds(prev => [...prev, village.village_id]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveVillage = (id) => {
    setCompareIds(prev => prev.filter(vid => vid !== id));
  };

  const exportComparisonCSV = () => {
    if (compareData.length === 0) return;
    
    const headers = ['Category', 'Metric', ...compareData.map(c => c.village.village_name)];
    const rows = [];
    
    // Core Profile rows
    const coreParams = [
      { label: 'National Rank', key: 'overall_rank' },
      { label: 'State', key: 'state' },
      { label: 'District', key: 'district' },
      { label: 'Gram Panchayat', key: 'gram_panchayat' },
      { label: 'Block', key: 'block' },
      { label: 'Population', key: 'total_population' },
      { label: 'Households', key: 'households' },
      { label: 'Area (sq km)', key: 'area_sq_km' },
      { label: 'Density (/sq km)', key: 'population_density' },
      { label: 'Priority Level', key: 'priority_level' },
      { label: 'Recommended Budget (INR)', key: 'recommended_budget_inr' }
    ];
    
    coreParams.forEach(p => {
      rows.push([
        'Profile',
        p.label,
        ...compareData.map(c => c.village[p.key] !== undefined ? c.village[p.key] : '—')
      ]);
    });
    
    // Domain Scores rows
    const domainParams = [
      { label: 'Overall Development Score', key: 'overall_score' },
      { label: 'Economy & Agriculture', key: 'economy_score' },
      { label: 'Education & Human Capital', key: 'education_score' },
      { label: 'Health & Nutrition', key: 'health_score' },
      { label: 'Infrastructure & Connectivity', key: 'infrastructure_score' },
      { label: 'Environment & Disaster', key: 'environment_score' },
      { label: 'Governance & Resource Flow', key: 'governance_score' },
      { label: 'Social Stability & Safety', key: 'social_score' }
    ];
    
    domainParams.forEach(p => {
      rows.push([
        'Domain Score',
        p.label,
        ...compareData.map(c => c.village[p.key] !== undefined ? c.village[p.key].toFixed(1) : '—')
      ]);
    });
    
    // Detailed Metrics rows
    Object.entries(METRIC_MAP).forEach(([category, colList]) => {
      colList.forEach(colName => {
        const values = compareData.map(c => {
          const mGroup = c.metrics[category] || [];
          const metricItem = mGroup.find(m => m.name === colName);
          return metricItem ? metricItem.value : '—';
        });
        rows.push([
          category,
          formatMetricName(colName),
          ...values
        ]);
      });
    });
    
    const csvContent = [headers.join(','), ...rows.map(e => e.map(val => typeof val === 'string' && val.includes(',') ? `"${val}"` : val).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const defaultName = compareData.map(c => c.village.village_name).join('_vs_');
    link.setAttribute("download", `vconnect_comparison_${defaultName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Prepare radar overlay data
  const radarData = useMemo(() => {
    if (compareData.length === 0) return [];
    return DOMAIN_KEYS.map(dk => {
      const entry = { domain: dk.label };
      compareData.forEach((item, i) => {
        entry[`village_${i}`] = item.village[dk.key] || 0;
      });
      return entry;
    });
  }, [compareData]);

  const comparisonStats = useMemo(() => {
    if (compareData.length < 2) return null;
    
    let bestScore = -1;
    let bestName = '';
    compareData.forEach(c => {
      if (c.village.overall_score > bestScore) {
        bestScore = c.village.overall_score;
        bestName = c.village.village_name;
      }
    });
    
    const domains = [
      { key: 'economy_score', label: 'Economy', rec: (lead, lag) => `Implement agricultural credit programs and market access pipelines in ${lag}. Reference ${lead}'s successful models.` },
      { key: 'education_score', label: 'Education', rec: (lead, lag) => `Deploy digital classrooms and student retention campaigns in ${lag}.` },
      { key: 'health_score', label: 'Health', rec: (lead, lag) => `Construct sub-health centers and improve vaccination coverage in ${lag} to mitigate child malnutrition.` },
      { key: 'infrastructure_score', label: 'Infrastructure', rec: (lead, lag) => `Allocate priority funding for drinking water taps and sanitation coverage in ${lag}.` },
      { key: 'environment_score', label: 'Environment', rec: (lead, lag) => `Integrate early disaster warning systems and clean energy initiatives in ${lag}.` },
      { key: 'governance_score', label: 'Governance', rec: (lead, lag) => `Adopt digital governance tools and public scheme awareness programs in ${lag}. Consult ${lead}'s administrative workflow.` },
      { key: 'social_score', label: 'Social', rec: (lead, lag) => `Launch youth engagement networks and safety policing initiatives in ${lag}.` }
    ];
    
    const domainGaps = domains.map(d => {
      let maxScore = -1;
      let minScore = 999;
      let leadVillage = '';
      let lagVillage = '';
      
      compareData.forEach(c => {
        const s = c.village[d.key] || 0;
        if (s > maxScore) {
          maxScore = s;
          leadVillage = c.village.village_name;
        }
        if (s < minScore) {
          minScore = s;
          lagVillage = c.village.village_name;
        }
      });
      
      return {
        label: d.label,
        gap: maxScore - minScore,
        lead: leadVillage,
        lag: lagVillage,
        recommendation: d.rec(leadVillage, lagVillage)
      };
    });
    
    const sortedGaps = [...domainGaps].sort((a, b) => b.gap - a.gap);
    const greatestDisparity = sortedGaps[0];
    
    return {
      bestName,
      bestScore,
      domainGaps,
      greatestDisparity
    };
  }, [compareData]);

  const getBestValueIndex = (metricName, values) => {
    if (values.length < 2) return -1;
    const validValues = values.map(v => typeof v === 'number' ? v : parseFloat(v));
    if (validValues.some(isNaN)) return -1;

    const isNegative = NEGATIVE_METRICS.includes(metricName);
    let bestVal = validValues[0];
    let bestIndex = 0;

    for (let i = 1; i < validValues.length; i++) {
      const val = validValues[i];
      if (isNegative) {
        if (val < bestVal) {
          bestVal = val;
          bestIndex = i;
        }
      } else {
        if (val > bestVal) {
          bestVal = val;
          bestIndex = i;
        }
      }
    }
    return bestIndex;
  };

  return (
    <div className="dashboard animate-in">
      <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 className="page-title">Village Comparison</h2>
          <p className="page-subtitle">Compare up to 3 villages across all development indicators side-by-side</p>
        </div>
        {compareData.length > 0 && (
          <div style={{ display: 'flex', gap: '12px' }} className="no-print">
            <button className="btn btn--ghost" onClick={exportComparisonCSV} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} id="export-comparison-btn">
              📥 Export CSV
            </button>
            <button className="btn btn--primary" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} id="print-comparison-btn">
              🖨️ Print PDF
            </button>
          </div>
        )}
      </header>

      {/* Search and selection bar */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', position: 'relative' }}>
            <input
              type="text"
              className="search-input"
              style={{ width: '100%' }}
              placeholder="Type village name to add for comparison..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              id="search-compare"
            />
            {searchLoading && (
              <div style={{ position: 'absolute', right: '12px', top: '10px' }} className="spinner" />
            )}
            
            {searchResults.length > 0 && (
              <div className="glass-panel" style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                maxHeight: '260px', overflowY: 'auto', zIndex: 1000,
                marginTop: '6px', background: 'rgba(15,22,41,0.98)', border: '1px solid var(--border)'
              }}>
                {searchResults.map(v => {
                  const isAlreadySelected = compareIds.includes(v.village_id);
                  return (
                    <div
                      key={v.village_id}
                      onClick={() => !isAlreadySelected && handleAddVillage(v)}
                      style={{
                        padding: '10px 14px', cursor: isAlreadySelected ? 'not-allowed' : 'pointer',
                        opacity: isAlreadySelected ? 0.4 : 1,
                        borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between',
                        fontSize: '13px'
                      }}
                      className="search-result-item"
                    >
                      <div>
                        <strong>{v.village_name}</strong>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>
                          {v.district}, {v.state}
                        </span>
                      </div>
                      <div style={{ color: 'var(--accent)' }}>Score: {v.overall_score.toFixed(1)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active comparison chips */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: '2 1 400px' }}>
            {compareData.map((item, i) => (
              <div
                key={item.village.village_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: 'rgba(255,255,255,0.03)', border: `1px solid ${COMP_COLORS[i]}`,
                  padding: '6px 12px', borderRadius: '20px', fontSize: '13px'
                }}
              >
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: COMP_COLORS[i] }} />
                <strong>{item.village.village_name}</strong>
                <span style={{ opacity: 0.7, fontSize: '11px' }}>({item.village.state})</span>
                <button
                  onClick={() => handleRemoveVillage(item.village.village_id)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-secondary)',
                    cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: '0 2px'
                  }}
                  title="Remove from comparison"
                >
                  &times;
                </button>
              </div>
            ))}
            {compareIds.length === 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                No villages selected. Search and select above to start comparing.
              </span>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /><p>Loading comparisons...</p></div>
      ) : compareData.length > 0 ? (
        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Radar chart and General Info */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            
            {/* Radar Overlay chart */}
            <div className="glass-panel" style={{ height: '400px', display: 'flex', flexDirection: 'column', padding: '20px' }}>
              <h3 className="panel-title" style={{ marginBottom: '16px' }}>Domain Score Comparison</h3>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="domain" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} />
                  {compareData.map((item, i) => (
                    <Radar
                      key={item.village.village_id}
                      name={item.village.village_name}
                      dataKey={`village_${i}`}
                      stroke={COMP_COLORS[i]}
                      fill={COMP_COLORS[i]}
                      fillOpacity={0.08}
                      strokeWidth={2}
                    />
                  ))}
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(99,102,241,0.3)',
                      borderRadius: 8,
                      color: '#e2e8f0',
                    }}
                  />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Demographics Profile Table */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 className="panel-title" style={{ marginBottom: '16px' }}>Core Profile Info</h3>
              <table className="ranking-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ width: '35%', background: 'transparent' }}>Parameter</th>
                    {compareData.map((item, i) => (
                      <th key={i} style={{ borderBottom: `2px solid ${COMP_COLORS[i]}`, background: 'transparent' }}>
                        {item.village.village_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'National Rank', key: 'overall_rank', format: v => `#${v?.toLocaleString()}` },
                    { label: 'State', key: 'state' },
                    { label: 'District', key: 'district' },
                    { label: 'Gram Panchayat', key: 'gram_panchayat' },
                    { label: 'Block', key: 'block' },
                    { label: 'Population', key: 'total_population', format: v => v?.toLocaleString() },
                    { label: 'Households', key: 'households', format: v => v?.toLocaleString() },
                    { label: 'Area', key: 'area_sq_km', format: v => `${v} km²` },
                    { label: 'Density', key: 'population_density', format: v => `${v?.toFixed(0)} /km²` },
                    { label: 'Priority Level', key: 'priority_level' },
                    { label: 'Recommended Budget', key: 'recommended_budget_inr', format: v => v ? `₹${Number(v).toLocaleString()}` : '—' },
                  ].map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>{row.label}</td>
                      {compareData.map((item, i) => {
                        const val = item.village[row.key];
                        return (
                          <td key={i} style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.format ? row.format(val) : val || '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>

          {/* Domain Scores Table */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 className="panel-title" style={{ marginBottom: '16px' }}>Domain Scores</h3>
            <table className="ranking-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Domain</th>
                  {compareData.map((item, i) => (
                    <th key={i}>{item.village.village_name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Overall Development Score', key: 'overall_score' },
                  { label: 'Economy & Agriculture', key: 'economy_score' },
                  { label: 'Education & Human Capital', key: 'education_score' },
                  { label: 'Health & Nutrition', key: 'health_score' },
                  { label: 'Infrastructure & Connectivity', key: 'infrastructure_score' },
                  { label: 'Environment & Disaster', key: 'environment_score' },
                  { label: 'Governance & Resource Flow', key: 'governance_score' },
                  { label: 'Social Stability & Safety', key: 'social_score' },
                ].map((row, idx) => (
                  <tr key={idx} className="table-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ fontSize: '13px', fontWeight: '600', color: idx === 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {row.label}
                    </td>
                    {compareData.map((item, i) => {
                      const score = item.village[row.key] || 0;
                      const isOverall = idx === 0;
                      return (
                        <td key={i}>
                          <span
                            style={{
                              display: 'inline-block', padding: '4px 10px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold',
                              color: `hsl(${(score / 100) * 120}, 75%, 45%)`,
                              background: `hsl(${(score / 100) * 120}, 30%, 12%)`,
                              border: isOverall ? `1px solid hsl(${(score / 100) * 120}, 60%, 25%)` : 'none'
                            }}
                          >
                            {score.toFixed(1)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Detailed raw metrics side-by-side comparison */}
          <div className="metrics-section">
            <h3 className="section-title">Detailed Metrics Comparison</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {Object.entries(METRIC_MAP).map(([category, colList]) => (
                <div key={category} className="glass-panel" style={{ padding: '20px' }}>
                  <h4 style={{
                    fontSize: '15px', color: 'var(--text-primary)', borderBottom: `2px solid ${DOMAIN_KEYS.find(k => k.label === category)?.color || 'var(--border)'}`,
                    paddingBottom: '8px', marginBottom: '14px'
                  }}>
                    {category} Metrics
                  </h4>
                  <table className="ranking-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '35%', background: 'transparent' }}>Sub-Indicator</th>
                        {compareData.map((item, i) => (
                          <th key={i} style={{ background: 'transparent' }}>{item.village.village_name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {colList.map((colName, mIdx) => {
                        const values = compareData.map(item => {
                          const mGroup = item.metrics[category] || [];
                          const metricItem = mGroup.find(m => m.name === colName);
                          return metricItem ? metricItem.value : 0;
                        });
                        
                        const bestIdx = getBestValueIndex(colName, values);

                        return (
                          <tr key={mIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                            <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {formatMetricName(colName)}
                            </td>
                            {values.map((v, i) => {
                              const isBest = i === bestIdx;
                              return (
                                <td key={i} style={{ fontSize: '13px' }}>
                                  <span style={{
                                    color: isBest ? 'var(--success)' : 'inherit',
                                    fontWeight: isBest ? 'bold' : 'normal',
                                    background: isBest ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                                    padding: isBest ? '2px 8px' : '0',
                                    borderRadius: '4px',
                                    border: isBest ? '1px solid rgba(16, 185, 129, 0.2)' : 'none'
                                  }}>
                                    {typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>

          {/* Gap Analysis & Strategic Policy Recommendations */}
          {comparisonStats && (
            <div className="glass-panel" style={{ padding: '24px', marginTop: '24px' }}>
              <h3 className="panel-title" style={{ fontSize: '18px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '20px' }}>
                🔍 Gap Analysis & Strategic Policy Recommendations
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.15)', padding: '16px', borderRadius: '8px' }}>
                  <h4 style={{ color: 'var(--success)', margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold' }}>Top Performer</h4>
                  <p style={{ fontSize: '18px', fontWeight: '800', margin: '4px 0' }}>{comparisonStats.bestName}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Leads comparison with an overall score of <strong>{comparisonStats.bestScore.toFixed(1)}</strong>.</p>
                </div>
                
                {comparisonStats.greatestDisparity && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.15)', padding: '16px', borderRadius: '8px' }}>
                    <h4 style={{ color: 'var(--danger)', margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold' }}>Greatest Disparity</h4>
                    <p style={{ fontSize: '18px', fontWeight: '800', margin: '4px 0' }}>{comparisonStats.greatestDisparity.label}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                      Disparity of <strong>{comparisonStats.greatestDisparity.gap.toFixed(1)}</strong> points. 
                      Lead: <strong>{comparisonStats.greatestDisparity.lead}</strong>, Lag: <strong>{comparisonStats.greatestDisparity.lag}</strong>.
                    </p>
                  </div>
                )}
              </div>

              <h4 style={{ margin: '20px 0 10px 0', fontSize: '14px', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>Domain Disparities & Peer Recommendations</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {comparisonStats.domainGaps.map(g => (
                  <div key={g.label} style={{ background: 'rgba(255,255,255,0.02)', padding: '14px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ flex: '1 1 300px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{g.label}</strong>
                        <span className={`gap-badge ${g.gap > 20 ? 'gap-badge--lag' : 'gap-badge--lead'}`}>
                          Gap: {g.gap.toFixed(1)}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                        💡 {g.recommendation}
                      </p>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right', minWidth: '150px' }}>
                      <div>👑 Lead: <strong>{g.lead}</strong></div>
                      <div style={{ marginTop: '2px' }}>⚠️ Lag: <strong>{g.lag}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : (
        /* Empty selection landing panel */
        <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏘️</div>
          <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Compare Villages</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto', fontSize: '14px', lineHeight: '1.5' }}>
            Use the search bar above to find and add villages. Compare demographic details, domain scores, and individual metrics across up to 3 villages to analyze resource gaps.
          </p>
        </div>
      )}
    </div>
  );
}
