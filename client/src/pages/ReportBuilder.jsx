import { useState, useEffect, useMemo } from 'react';
import { fetchRankings, fetchVillage } from '../api';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const DOMAIN_LABELS = {
  economy_score: 'Economy',
  education_score: 'Education',
  health_score: 'Health',
  infrastructure_score: 'Infrastructure',
  environment_score: 'Environment',
  governance_score: 'Governance',
  social_score: 'Social',
};

const DOMAIN_COLORS = {
  Economy: '#f59e0b',
  Education: '#6366f1',
  Health: '#ef4444',
  Infrastructure: '#06b6d4',
  Environment: '#10b981',
  Governance: '#8b5cf6',
  Social: '#ec4899',
};

export default function ReportBuilder() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedVillageId, setSelectedVillageId] = useState(null);
  
  const [villageData, setVillageData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Configuration switches
  const [incDemographics, setIncDemographics] = useState(true);
  const [incScoresRadar, setIncScoresRadar] = useState(true);
  const [incGapsList, setIncGapsList] = useState(true);
  const [incBudgetPie, setIncBudgetPie] = useState(true);
  const [incRecommendations, setIncRecommendations] = useState(true);

  // Fetch search results
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      fetchRankings({ search: searchQuery, limit: 8 })
        .then(res => setSearchResults(res.data || []))
        .catch(console.error)
        .finally(() => setSearchLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch selected village details
  useEffect(() => {
    if (!selectedVillageId) return;
    setLoading(true);
    fetchVillage(selectedVillageId)
      .then(res => {
        setVillageData(res);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedVillageId]);

  const radarData = useMemo(() => {
    if (!villageData || !villageData.village) return [];
    const v = villageData.village;
    return Object.entries(DOMAIN_LABELS).map(([key, label]) => ({
      domain: label,
      score: v[key] || 0,
      fullMark: 100
    }));
  }, [villageData]);

  const budgetAllocationData = useMemo(() => {
    if (!villageData || !villageData.village) return [];
    const v = villageData.village;
    const scores = {
      Economy: v.economy_score || 50,
      Education: v.education_score || 50,
      Health: v.health_score || 50,
      Infrastructure: v.infrastructure_score || 50,
      Environment: v.environment_score || 50,
      Governance: v.governance_score || 50,
      Social: v.social_score || 50,
    };
    
    const budgetTotal = v.recommended_budget_inr || 1500000;
    
    // Proportional to deficit
    const deficits = {};
    let totalDeficit = 0;
    Object.entries(scores).forEach(([cat, s]) => {
      const def = Math.max(0, 100 - s);
      deficits[cat] = def;
      totalDeficit += def;
    });

    return Object.entries(scores).map(([cat]) => {
      const ratio = totalDeficit > 0 ? (deficits[cat] / totalDeficit) : (1 / 7);
      return {
        name: cat,
        value: Math.round(budgetTotal * ratio),
        color: DOMAIN_COLORS[cat]
      };
    }).filter(d => d.value > 0);
  }, [villageData]);

  // Identify infrastructure gaps (metrics with score < 40%)
  const infrastructureGaps = useMemo(() => {
    if (!villageData || !villageData.metrics) return [];
    const gaps = [];
    Object.entries(villageData.metrics).forEach(([category, items]) => {
      items.forEach(m => {
        // Simple threshold check for low scores
        const isNegativeMetric = [
          "poverty_rate", "dropout_rate", "malnutrition_rate", "avg_healthcare_access_time_min",
          "nearest_hospital_distance_km", "farmer_debt_index", "total_crime_rate"
        ].includes(m.name);
        
        const isLowValue = !isNegativeMetric && typeof m.value === 'number' && m.value < 40;
        const isHighValueNegative = isNegativeMetric && typeof m.value === 'number' && m.value > 50;

        if (isLowValue || isHighValueNegative) {
          gaps.push({
            name: m.name.replace(/_/g, ' ').toUpperCase(),
            value: m.value,
            category
          });
        }
      });
    });
    return gaps.slice(0, 6);
  }, [villageData]);

  const handleSelectVillage = (v) => {
    setSelectedVillageId(v.village_id);
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <div className="dashboard animate-in">
      
      {/* Configuration Controls Bar */}
      <header className="dashboard-header no-print">
        <div>
          <h2 className="page-title">Executive Report Builder</h2>
          <p className="page-subtitle">Compile, customize, and print high-fidelity PDF briefs for district planning boards</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="btn btn--primary" 
            onClick={() => window.print()}
            disabled={!villageData}
            id="builder-print-btn"
          >
            🖨️ Generate & Print PDF
          </button>
        </div>
      </header>

      {/* Selector layout panels */}
      <div className="grid-layout no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        
        {/* Search Panel */}
        <div className="glass-panel" style={{ padding: '18px', position: 'relative' }}>
          <h3 className="panel-title" style={{ fontSize: '13px', marginBottom: '12px' }}>1. Select Target Village</h3>
          <input
            type="text"
            className="search-input"
            style={{ width: '100%' }}
            placeholder="Search village by name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            id="builder-village-search"
          />
          {searchLoading && <div className="spinner" style={{ position: 'absolute', right: '24px', top: '48px' }} />}
          
          {searchResults.length > 0 && (
            <div className="glass-panel" style={{
              position: 'absolute', top: '100%', left: 18, right: 18,
              maxHeight: '200px', overflowY: 'auto', zIndex: 1000,
              marginTop: '4px', background: 'rgba(15,22,41,0.98)', border: '1px solid var(--border)'
            }}>
              {searchResults.map(v => (
                <div
                  key={v.village_id}
                  onClick={() => handleSelectVillage(v)}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '12px' }}
                  className="search-result-item"
                >
                  <strong>{v.village_name}</strong> ({v.district}, {v.state})
                </div>
              ))}
            </div>
          )}

          {villageData && (
            <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(99,102,241,0.06)', borderRadius: '6px', fontSize: '12px', border: '1px solid rgba(99,102,241,0.1)' }}>
              Selected: <strong>{villageData.village.village_name}</strong> ({villageData.village.state})
            </div>
          )}
        </div>

        {/* Configuration switches */}
        <div className="glass-panel" style={{ padding: '18px' }}>
          <h3 className="panel-title" style={{ fontSize: '13px', marginBottom: '12px' }}>2. Customize Report Sections</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={incDemographics} onChange={e => setIncDemographics(e.target.checked)} id="toggle-demo" />
              Demographic Profile Table
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={incScoresRadar} onChange={e => setIncScoresRadar(e.target.checked)} id="toggle-radar" />
              Domain Scores Radar Chart
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={incGapsList} onChange={e => setIncGapsList(e.target.checked)} id="toggle-gaps" />
              Infrastructural Deficit Indicators
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={incBudgetPie} onChange={e => setIncBudgetPie(e.target.checked)} id="toggle-budget" />
              Recommended Budget Breakdown
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={incRecommendations} onChange={e => setIncRecommendations(e.target.checked)} id="toggle-recs" />
              Administrative Policy Guidelines
            </label>
          </div>
        </div>

      </div>

      {/* Report preview document panel */}
      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 20px auto' }} />
          <p>Compiling database schemas, mapping coordinate lines, and styling output sheets...</p>
        </div>
      ) : villageData ? (
        <div 
          className="report-preview-sheet" 
          id="report-printable-area"
          style={{
            background: '#ffffff',
            color: '#1e293b',
            padding: '40px',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            maxWidth: '800px',
            margin: '0 auto',
            fontFamily: 'system-ui, sans-serif'
          }}
        >
          {/* Header Brief */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #1e3a8a', paddingBottom: '16px', marginBottom: '24px' }}>
            <div>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', color: '#1e3a8a' }}>VCONNECT NATIONAL DEVELOPMENT PORTAL</span>
              <h1 style={{ margin: '4px 0 0 0', fontSize: '28px', color: '#0f172a', fontWeight: '800' }}>{villageData.village.village_name}</h1>
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#475569' }}>
                State: <strong>{villageData.village.state}</strong> | District: <strong>{villageData.village.district}</strong> | Sub-District: <strong>{villageData.village.block || '—'}</strong>
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#1e3a8a' }}>#{villageData.village.overall_rank?.toLocaleString()}</div>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#475569', fontWeight: 'bold' }}>National Rank</span>
            </div>
          </div>

          {/* Demographic Grid */}
          {incDemographics && (
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '14px', textTransform: 'uppercase', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', color: '#0f172a', marginBottom: '10px' }}>
                Demographic & Geographic Profile
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '12px' }}>
                <div style={{ padding: '6px', background: '#f8fafc', borderRadius: '4px' }}>
                  <div style={{ color: '#475569', fontSize: '10px' }}>TOTAL POPULATION</div>
                  <strong style={{ fontSize: '13px', color: '#0f172a' }}>{villageData.village.total_population?.toLocaleString()}</strong>
                </div>
                <div style={{ padding: '6px', background: '#f8fafc', borderRadius: '4px' }}>
                  <div style={{ color: '#475569', fontSize: '10px' }}>TOTAL HOUSEHOLDS</div>
                  <strong style={{ fontSize: '13px', color: '#0f172a' }}>{villageData.village.households?.toLocaleString()}</strong>
                </div>
                <div style={{ padding: '6px', background: '#f8fafc', borderRadius: '4px' }}>
                  <div style={{ color: '#475569', fontSize: '10px' }}>AREA (SQ KM)</div>
                  <strong style={{ fontSize: '13px', color: '#0f172a' }}>{villageData.village.area_sq_km} km²</strong>
                </div>
                <div style={{ padding: '6px', background: '#f8fafc', borderRadius: '4px' }}>
                  <div style={{ color: '#475569', fontSize: '10px' }}>POPULATION DENSITY</div>
                  <strong style={{ fontSize: '13px', color: '#0f172a' }}>{villageData.village.population_density?.toFixed(0)} /km²</strong>
                </div>
              </div>
            </div>
          )}

          {/* Radar Score Panel */}
          {incScoresRadar && (
            <div style={{ marginBottom: '28px', display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '14px', textTransform: 'uppercase', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', color: '#0f172a', marginBottom: '10px' }}>
                  Sectoral Development Scores
                </h2>
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      { label: 'Overall Score', val: villageData.village.overall_score },
                      { label: 'Economy & Farming', val: villageData.village.economy_score },
                      { label: 'Education & Literacy', val: villageData.village.education_score },
                      { label: 'Healthcare & Nutrition', val: villageData.village.health_score },
                      { label: 'Infrastructure & Roads', val: villageData.village.infrastructure_score },
                      { label: 'Environmental Vulnerability', val: villageData.village.environment_score },
                      { label: 'Governance & Schemes', val: villageData.village.governance_score },
                      { label: 'Social Safety & Policing', val: villageData.village.social_score },
                    ].map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', height: '24px' }}>
                        <td style={{ fontWeight: idx === 0 ? 'bold' : 'normal' }}>{row.label}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1e3a8a' }}>{row.val?.toFixed(1)} / 100</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ width: '220px', height: '180px' }} className="no-print-chart">
                {/* Print layout might skip interactive canvas or render standard SVG */}
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
                    <PolarGrid stroke="#cbd5e1" />
                    <PolarAngleAxis dataKey="domain" tick={{ fill: '#334155', fontSize: 8 }} />
                    <Radar name="Score" dataKey="score" stroke="#1e3a8a" fill="#1e3a8a" fillOpacity={0.15} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Infrastructure Deficits Gaps list */}
          {incGapsList && (
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '14px', textTransform: 'uppercase', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', color: '#0f172a', marginBottom: '10px' }}>
                Key Development Deficits
              </h2>
              {infrastructureGaps.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '11px' }}>
                  {infrastructureGaps.map((gap, idx) => (
                    <div key={idx} style={{ padding: '8px', border: '1px solid #fee2e2', background: '#fef2f2', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '600', color: '#991b1b' }}>{gap.name}</span>
                      <span style={{ background: '#fca5a5', padding: '2px 6px', borderRadius: '3px', fontWeight: 'bold', color: '#7f1d1d' }}>
                        Deficient (Level: {gap.value})
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#475569', margin: 0 }}>No critical developmental deficits flagged in main indicators.</p>
              )}
            </div>
          )}

          {/* Budget allocation Pie panel */}
          {incBudgetPie && (
            <div style={{ marginBottom: '24px', display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div style={{ width: '180px', height: '140px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={budgetAllocationData}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={50}
                      dataKey="value"
                    >
                      {budgetAllocationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '14px', textTransform: 'uppercase', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', color: '#0f172a', marginBottom: '10px' }}>
                  Recommended Budget Allocations
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: '10px' }}>
                  {budgetAllocationData.map((d, idx) => (
                    <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: d.color }} />
                      <strong>{d.name}</strong>: ₹{Math.round(d.value).toLocaleString()}
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: '10px', color: '#475569', marginTop: '10px', fontStyle: 'italic', lineHeight: '1.4' }}>
                  * Total estimated budget required: <strong>₹{villageData.village.recommended_budget_inr?.toLocaleString() || '1,500,000'}</strong>. Calculated dynamically based on multi-indicator deficit priority weights.
                </p>
              </div>
            </div>
          )}

          {/* Policy recommendations and guidelines */}
          {incRecommendations && (
            <div style={{ marginBottom: '10px', borderTop: '2px dashed #cbd5e1', paddingTop: '16px' }}>
              <h2 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#0f172a', marginBottom: '8px' }}>
                Administrative Action Guidelines
              </h2>
              <ul style={{ fontSize: '11px', color: '#334155', paddingLeft: '20px', lineHeight: '1.6', margin: 0 }}>
                {villageData.village.priority_level === 'Critical' || villageData.village.priority_level === 'High' ? (
                  <>
                    <li><strong>Immediate Action Required</strong>: Trigger emergency health support and clean drinking water pipeline installations.</li>
                    <li><strong>Financial Oversight</strong>: Route scheme budgets directly to Gram Panchayat fund trackers to avoid leaks.</li>
                    <li><strong>Educational Audit</strong>: Address school dropout numbers by organizing digital literacy drives.</li>
                  </>
                ) : (
                  <>
                    <li><strong>Development Maintenance</strong>: Periodically check sanitation index counts to sustain high scores.</li>
                    <li><strong>MSME Engagement</strong>: Extend credit availability scores to rural household farmers.</li>
                  </>
                )}
                <li><strong>Local Contact Officer</strong>: Sub-District Block Officer, {villageData.village.block || 'District Headquarters'}.</li>
              </ul>
            </div>
          )}

          {/* Document Footer */}
          <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '24px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b' }}>
            <span>REPORT GENERATED: {new Date().toLocaleDateString()}</span>
            <span>VCONNECT DEVELOPMENT METRIC DECISION ENGINE -- DOCUMENT PAGE 1</span>
          </div>

        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>No Village Selected</h3>
          <p style={{ maxWidth: '400px', margin: '8px auto 0 auto', fontSize: '13px', lineHeight: '1.5' }}>
            Use the left-hand search panel to locate and select a village to start customizing the printable PDF report sheets.
          </p>
        </div>
      )}

    </div>
  );
}
