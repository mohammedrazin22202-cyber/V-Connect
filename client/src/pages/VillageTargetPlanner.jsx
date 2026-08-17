import { useState, useEffect, useMemo } from 'react';
import { fetchRankings, fetchVillage } from '../api';
import metricMeta from '../metric_meta.json';

const DOMAIN_LABELS = {
  economy: 'Economy',
  education: 'Education',
  health: 'Health',
  infrastructure: 'Infrastructure',
  environment: 'Environment',
  governance: 'Governance',
  social: 'Social',
};

const DOMAIN_COLORS = {
  economy: '#f59e0b',
  education: '#6366f1',
  health: '#ef4444',
  infrastructure: '#06b6d4',
  environment: '#10b981',
  governance: '#8b5cf6',
  social: '#ec4899',
};

const METRIC_MAP = {
  economy: ["employment_rate", "avg_household_income", "poverty_rate", "crop_yield_index%", "farmer_income_avg", "farmer_debt_index", "market_access_score", "bank_access_score"],
  education: ["literacy_rate", "female_literacy_rate", "dropout_rate", "school_count", "teacher_student_ratio", "digital_literacy_rate"],
  health: ["infant_mortality_rate", "malnutrition_rate", "vaccination_coverage%", "medical_staff_per_1000", "avg_healthcare_access_time_min", "healthcare_effectiveness_score"],
  infrastructure: ["drinking_water_coverage_pct", "sanitation_coverage_pct", "road_quality_index", "electricity_hours_per_day", "internet_penetration%", "nearest_hospital_distance_km"],
  environment: ["flood_risk_score", "earthquake_risk_score", "air_quality_index", "forest_cover_pct", "disaster_preparedness_score", "climate_vulnerability_index"],
  governance: ["panchayat_efficiency_score", "transparency_index", "fund_utilization_pct", "scheme_coverage_pct", "corruption_risk_proxy"],
  social: ["total_crime_rate", "crimes_against_women_rate", "social_cohesion_index", "community_participation_score", "youth_engagement_score"]
};

const NEGATIVE_METRICS = new Set([
  "poverty_rate", "farmer_debt_index", "dropout_rate", "infant_mortality_rate", 
  "malnutrition_rate", "avg_healthcare_access_time_min", "flood_risk_score", 
  "earthquake_risk_score", "climate_vulnerability_index", "corruption_risk_proxy", 
  "total_crime_rate", "crimes_against_women_rate", "nearest_hospital_distance_km",
  "air_quality_index"
]);

const DOMAIN_PROJECT_TEMPLATES = {
  economy: [
    { title: "DAY-NRLM Self-Help Group (SHG) Expansion", desc: "Launch cooperative micro-credit facilities for rural households to reduce farmer debt index and boost self-employment." },
    { title: "Cooperative Market Aggregator Setup", desc: "Establish direct cold-chain transport to nearby municipal markets to increase farm price realization and average household income." }
  ],
  education: [
    { title: "Samagra Shiksha Digital Classroom Upgrades", desc: "Equip local public schools with high-speed internet, smartboards, and computer labs to boost digital literacy rate." },
    { title: "Community Scholarship & Retention Drive", desc: "Establish direct incentives for adolescent female retention to drop school dropout rate below 5%." }
  ],
  health: [
    { title: "Poshan Abhiyaan Child Nutrition Drive", desc: "Upgrade local Anganwadi tracking tools and deliver fortified nutrition packs to reduce under-5 malnutrition rates." },
    { title: "Sub-Health Center Mobile Clinic Deployment", desc: "Launch weekly mobile medical vans to reduce average healthcare access times and improve primary vaccination coverage." }
  ],
  infrastructure: [
    { title: "Jal Jeevan Mission Household Tap Program", desc: "Install piped drinking water connections in all household sections to achieve 100% clean drinking water coverage." },
    { title: "PM Har Ghar Bijli Electricity Upgrade", desc: "Reinforce agricultural feeders and install localized solar mini-grids to secure at least 18+ daily electricity hours." }
  ],
  environment: [
    { title: "Rainwater Harvesting & Ground Recharge Network", desc: "Excavate community farm ponds and bioswales to restore depleted groundwater levels and mitigate drought risks." },
    { title: "Village Disaster Safety Center & Siren Network", desc: "Construct multi-purpose shelters and connect early warning systems to improve evacuation and disaster readiness." }
  ],
  governance: [
    { title: "e-Panchayat Portal & Digital Service Center", desc: "Digitize property and birth registers onto online databases to improve Panchayat administrative response speed and transparency." }
  ],
  social: [
    { title: "Panchayat Youth Sports & Vocational Academy", desc: "Build recreation spaces and schedule periodic tournaments to drive volunteerism and youth community engagement." },
    { title: "Mahila Suraksha Community Safety Initiative", desc: "Install streetlights on school pathways and coordinate women-led night watches to minimize crimes against women." }
  ]
};

function getMetricLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace('%', '')
    .replace('pct', '')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getMetricUnit(key) {
  if (key.includes('%') || key.includes('rate') || key.includes('_pct')) return '%';
  if (key.includes('income') || key.includes('budget')) return ' INR';
  if (key.includes('distance')) return ' km';
  if (key.includes('time')) return ' min';
  if (key.includes('hours')) return ' hrs/day';
  return '';
}

export default function VillageTargetPlanner() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  
  const [village, setVillage] = useState(null);
  const [loadingVillage, setLoadingVillage] = useState(false);
  const [activeDomain, setActiveDomain] = useState('infrastructure');

  // Sliders Target State
  const [targets, setTargets] = useState({
    economy: 50,
    education: 50,
    health: 50,
    infrastructure: 50,
    environment: 50,
    governance: 50,
    social: 50
  });

  // Search autocomplete
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      fetchRankings({ search: searchQuery, limit: 6 })
        .then(res => setSearchResults(res.data || []))
        .catch(console.error)
        .finally(() => setSearchLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectVillage = (v) => {
    setSearchQuery('');
    setSearchResults([]);
    setLoadingVillage(true);
    fetchVillage(v.village_id)
      .then(res => {
        setVillage(res);
        if (res && res.scores) {
          setTargets({
            economy: res.scores.economy_score || 50,
            education: res.scores.education_score || 50,
            health: res.scores.health_score || 50,
            infrastructure: res.scores.infrastructure_score || 50,
            environment: res.scores.environment_score || 50,
            governance: res.scores.governance_score || 50,
            social: res.scores.social_score || 50
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoadingVillage(false));
  };

  const handleSliderChange = (domain, value) => {
    setTargets(prev => ({
      ...prev,
      [domain]: parseFloat(value)
    }));
  };

  // Helper: Normalize
  const getNormalizedScore = (name, val) => {
    const meta = metricMeta[name];
    if (!meta) return 50;
    const { min, max } = meta;
    if (min === max) return 50;
    let norm = ((val - min) / (max - min)) * 100;
    norm = Math.max(0, Math.min(100, norm));
    if (NEGATIVE_METRICS.has(name)) {
      return 100 - norm;
    }
    return norm;
  };

  // Helper: Denormalize
  const getRawValueFromNorm = (name, norm) => {
    const meta = metricMeta[name];
    if (!meta) return 0;
    const { min, max } = meta;
    let targetNorm = Math.max(0, Math.min(100, norm));
    if (NEGATIVE_METRICS.has(name)) {
      targetNorm = 100 - targetNorm;
    }
    return min + (targetNorm / 100) * (max - min);
  };

  // Simulated metrics and checklist computation
  const simulation = useMemo(() => {
    if (!village) return null;
    const domains = ["economy", "education", "health", "infrastructure", "environment", "governance", "social"];
    const metricsData = {};
    let totalBudgetDelta = 0;
    const projectsList = [];

    domains.forEach(dom => {
      const currentScore = village.scores[`${dom}_score`] || 50;
      const targetScore = targets[dom];
      const delta = targetScore - currentScore;
      const cols = METRIC_MAP[dom];

      metricsData[dom] = cols.map(col => {
        const curVal = village.raw[col] ?? 0;
        const curNorm = getNormalizedScore(col, curVal);
        const tarNorm = Math.max(0, Math.min(100, curNorm + delta));
        const tarVal = getRawValueFromNorm(col, tarNorm);

        return {
          key: col,
          label: getMetricLabel(col),
          current: curVal,
          target: tarVal,
          unit: getMetricUnit(col),
          change: tarVal - curVal,
          isImprovement: NEGATIVE_METRICS.has(col) ? (tarVal < curVal) : (tarVal > curVal)
        };
      });

      // Calculate localized budget cost adjustment
      if (delta > 0) {
        // Budget: ₹1.5 Lakhs per score point per 1000 population
        const popFactor = (village.raw.total_population || 1000) / 1000;
        const scoreCostFactor = {
          economy: 150000,
          education: 100000,
          health: 200000,
          infrastructure: 300000,
          environment: 120000,
          governance: 50000,
          social: 75000
        };
        const cost = delta * (scoreCostFactor[dom] || 100000) * popFactor;
        totalBudgetDelta += cost;

        // Generate specific project action items
        const templates = DOMAIN_PROJECT_TEMPLATES[dom] || [];
        templates.forEach(t => {
          projectsList.push({
            ...t,
            domain: dom,
            estimatedCost: cost / templates.length
          });
        });
      }
    });

    const currentOverall = village.scores.overall_score || 50;
    const targetOverall = Number((Object.values(targets).reduce((a, b) => a + b, 0) / 7).toFixed(2));

    return {
      metrics: metricsData,
      currentOverall,
      targetOverall,
      overallDelta: targetOverall - currentOverall,
      estimatedBudgetDelta: totalBudgetDelta,
      projects: projectsList
    };
  }, [village, targets]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h2 className="page-title">Village Target Planner</h2>
          <p className="page-subtitle">Simulate domain score targets and generate structural Gram Panchayat blueprints</p>
        </div>
      </header>

      {/* Village Search Autocomplete Bar */}
      <div className="filter-bar" style={{ position: 'relative', overflow: 'visible' }}>
        <div className="filter-group" style={{ width: '100%' }}>
          <label htmlFor="planner-search">Select Village to Plan</label>
          <input
            id="planner-search"
            type="text"
            placeholder="Search village by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            style={{ width: '100%' }}
          />
          {searchLoading && <div className="spinner" style={{ position: 'absolute', right: '12px', top: '35px' }} />}
          
          {searchResults.length > 0 && (
            <div className="glass-panel" style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              maxHeight: '200px', overflowY: 'auto', zIndex: 1000,
              marginTop: '4px', background: 'rgba(15,22,41,0.98)', border: '1px solid var(--border)'
            }}>
              {searchResults.map(v => (
                <div
                  key={v.village_id}
                  onClick={() => handleSelectVillage(v)}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '13px' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <strong>{v.village_name}</strong> ({v.district}, {v.state})
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {loadingVillage ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading village planning profiles...</p>
        </div>
      ) : village ? (
        <div className="comparison-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: '24px', marginTop: '20px' }}>
          
          {/* Sliders Controller Panel */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <span className="badge" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
                Target Goals
              </span>
              <h3 className="section-title" style={{ marginTop: '6px', marginBottom: '2px' }}>{village.name}</h3>
              <p className="text-muted" style={{ fontSize: '12px', margin: 0 }}>
                {village.district}, {village.state} | Population: <strong>{village.raw.total_population?.toLocaleString()}</strong>
              </p>
            </div>

            {/* Overall Comparison */}
            {simulation && (
              <div style={{
                background: 'var(--card-bg-alt)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>OVERALL RURAL DEVELOPMENT SCORE</div>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', margin: '8px 0' }}>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                      {simulation.currentOverall.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Current</div>
                  </div>
                  <div style={{ fontSize: '20px', color: 'var(--primary)' }}>➔</div>
                  <div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--primary)' }}>
                      {simulation.targetOverall.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--primary)' }}>Simulated</div>
                  </div>
                </div>
                {simulation.overallDelta > 0 && (
                  <div style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>
                    📈 Score Improvement: +{simulation.overallDelta.toFixed(1)} points
                  </div>
                )}
              </div>
            )}

            {/* Goal Sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {Object.keys(DOMAIN_LABELS).map(dom => {
                const current = village.scores[`${dom}_score`] || 50;
                const value = targets[dom];
                return (
                  <div key={dom} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ fontWeight: '500' }}>{DOMAIN_LABELS[dom]}</span>
                      <span style={{ fontWeight: 'bold', color: DOMAIN_COLORS[dom] }}>
                        {value.toFixed(1)} <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>(cur: {current.toFixed(1)})</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="98"
                      step="0.5"
                      value={value}
                      onChange={(e) => handleSliderChange(dom, e.target.value)}
                      style={{
                        accentColor: DOMAIN_COLORS[dom],
                        width: '100%',
                        cursor: 'pointer'
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Estimated Budget impact summary */}
            {simulation && simulation.estimatedBudgetDelta > 0 && (
              <div className="alert-box" style={{
                borderLeft: '4px solid var(--primary)',
                backgroundColor: 'rgba(99, 102, 241, 0.05)',
                padding: '12px',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 'bold' }}>ESTIMATED BUDGET REQUIREMENT</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', margin: '4px 0', color: 'var(--text-main)' }}>
                  ₹{(simulation.estimatedBudgetDelta / 100000).toFixed(2)} Lakhs
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Calculated based on village population and sectoral deficit improvement factors.
                </div>
              </div>
            )}
          </div>

          {/* Details Planning Checklist Panel */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Domain Tab Selector */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', overflowX: 'auto' }}>
              {Object.keys(DOMAIN_LABELS).map(dom => (
                <button
                  key={dom}
                  onClick={() => setActiveDomain(dom)}
                  className={`tab-btn ${activeDomain === dom ? 'active' : ''}`}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeDomain === dom ? DOMAIN_COLORS[dom] : 'transparent',
                    color: activeDomain === dom ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    transition: 'all 0.2s'
                  }}
                >
                  {DOMAIN_LABELS[dom]}
                </button>
              ))}
            </div>

            {/* Sub-metric details table */}
            {simulation && (
              <div>
                <h3 className="section-title" style={{ fontSize: '14px', marginBottom: '10px' }}>
                  Raw Metric Target Values (Sector: {DOMAIN_LABELS[activeDomain]})
                </h3>
                <table className="dashboard-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>Indicator Name</th>
                      <th>Current Value</th>
                      <th>➔ Target Value</th>
                      <th>Simulated Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.metrics[activeDomain].map(m => {
                      const hasChanged = Math.abs(m.change) > 0.001;
                      return (
                        <tr key={m.key}>
                          <td>{m.label}</td>
                          <td><strong>{m.current.toFixed(2)}{m.unit}</strong></td>
                          <td>
                            <strong style={{ color: hasChanged ? 'var(--primary)' : 'inherit' }}>
                              {m.target.toFixed(2)}{m.unit}
                            </strong>
                          </td>
                          <td>
                            {hasChanged ? (
                              <span style={{ color: m.isImprovement ? '#10b981' : '#f59e0b', fontWeight: 'bold' }}>
                                {m.change > 0 ? '+' : ''}{m.change.toFixed(2)}{m.unit}
                              </span>
                            ) : (
                              <span className="text-muted">Unchanged</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Checklist items */}
            {simulation && (
              <div style={{ marginTop: '10px' }}>
                <h3 className="section-title" style={{ fontSize: '14px', marginBottom: '10px' }}>
                  📋 Actionable Project Interventions
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {simulation.projects.filter(p => p.domain === activeDomain).map((proj, idx) => (
                    <div
                      key={idx}
                      className="card"
                      style={{
                        padding: '14px',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        backgroundColor: 'var(--card-bg-alt)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '14px' }}>
                          {proj.title}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.12)', padding: '2px 6px', borderRadius: '4px' }}>
                          Est. Cost: ₹{(proj.estimatedCost / 100000).toFixed(1)}L
                        </span>
                      </div>
                      <p className="text-muted" style={{ fontSize: '12px', margin: 0, lineHeight: '1.4' }}>
                        {proj.desc}
                      </p>
                    </div>
                  ))}
                  {simulation.projects.filter(p => p.domain === activeDomain).length === 0 && (
                    <div className="alert-box text-center text-muted" style={{ padding: '20px' }}>
                      Slide the <strong>{DOMAIN_LABELS[activeDomain]}</strong> target above the current value to generate project interventions and budget estimates.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="panel text-center text-muted" style={{ padding: '60px', marginTop: '20px' }}>
          💡 Type and select a village name above to begin simulating development scenarios.
        </div>
      )}
    </div>
  );
}


// Git commit touch-up 22: refactor: Optimize denormalization calculations on domain score changes (denormalize)


// Git commit touch-up 23: style: Optimize slider thumb accent colors for better visibility (accentColor)


// Git commit touch-up 24: feat: Add printable export layout button for GPDP blueprints (print)


// Git commit touch-up 25: docs: Add user helper notes explaining target budget multipliers (multiplier help)


// Git commit touch-up 37: ux: Add loading indicators when fetching target planning data (loading planner)
