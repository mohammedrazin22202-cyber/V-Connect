import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend
} from 'recharts';
import { fetchVillage, fetchSimulatedRank } from '../api';
import ScoreBar from '../components/ScoreBar';

const DOMAIN_LABELS = {
  economy_score: 'Economy',
  education_score: 'Education',
  health_score: 'Health',
  infrastructure_score: 'Infrastructure',
  environment_score: 'Environment',
  governance_score: 'Governance',
  social_score: 'Social',
};

const METRIC_MAP = {
  "Economy": ["employment_rate", "avg_household_income", "poverty_rate",
               "crop_yield_index%", "farmer_income_avg", "farmer_debt_index",
               "market_access_score", "bank_access_score"],
  "Education": ["literacy_rate", "female_literacy_rate", "dropout_rate",
                 "school_count", "teacher_student_ratio", "digital_literacy_rate"],
  "Health": ["infant_mortality_rate", "malnutrition_rate", "vaccination_coverage%",
             "medical_staff_per_1000", "avg_healthcare_access_time_min",
             "healthcare_effectiveness_score"],
  "Infrastructure": ["drinking_water_coverage_pct", "sanitation_coverage_pct",
                     "road_quality_index", "electricity_hours_per_day",
                     "internet_penetration%", "nearest_hospital_distance_km"],
  "Environment": ["flood_risk_score", "earthquake_risk_score", "air_quality_index",
                   "forest_cover_pct", "disaster_preparedness_score",
                   "climate_vulnerability_index"],
  "Governance": ["panchayat_efficiency_score", "transparency_index",
                 "fund_utilization_pct", "scheme_coverage_pct",
                 "corruption_risk_proxy"],
  "Social": ["total_crime_rate", "crimes_against_women_rate",
             "social_cohesion_index", "community_participation_score",
             "youth_engagement_score"],
};

// Colors for domains
const DOMAIN_COLORS = {
  "Economy": "#f59e0b",
  "Education": "#6366f1",
  "Health": "#ef4444",
  "Infrastructure": "#06b6d4",
  "Environment": "#10b981",
  "Governance": "#8b5cf6",
  "Social": "#ec4899",
};

// High impact sliders configuration
const SLIDER_CONFIGS = [
  { col: 'avg_household_income', label: 'Household Income (INR)', category: 'Economy', minVal: 1000, maxVal: 50000, step: 500 },
  { col: 'poverty_rate', label: 'Poverty Rate (%)', category: 'Economy', minVal: 0, maxVal: 100, step: 1 },
  { col: 'dropout_rate', label: 'School Dropout Rate (%)', category: 'Education', minVal: 0, maxVal: 100, step: 0.5 },
  { col: 'digital_literacy_rate', label: 'Digital Literacy (%)', category: 'Education', minVal: 0, maxVal: 100, step: 1 },
  { col: 'malnutrition_rate', label: 'Child Malnutrition (%)', category: 'Health', minVal: 0, maxVal: 100, step: 0.5 },
  { col: 'avg_healthcare_access_time_min', label: 'Healthcare Access Time (min)', category: 'Health', minVal: 5, maxVal: 180, step: 5 },
  { col: 'drinking_water_coverage_pct', label: 'Drinking Water Coverage (%)', category: 'Infrastructure', minVal: 0, maxVal: 100, step: 1 },
  { col: 'sanitation_coverage_pct', label: 'Sanitation Coverage (%)', category: 'Infrastructure', minVal: 0, maxVal: 100, step: 1 },
  { col: 'electricity_hours_per_day', label: 'Electricity hours/day', category: 'Infrastructure', minVal: 0, maxVal: 24, step: 1 },
  { col: 'internet_penetration%', label: 'Internet Penetration (%)', category: 'Infrastructure', minVal: 0, maxVal: 100, step: 1 },
];

const OPTIMIZER_FACTORS = {
  avg_household_income: { costFactor: 300, isPositive: true },
  poverty_rate: { costFactor: 15000, isPositive: false },
  dropout_rate: { costFactor: 10000, isPositive: false },
  digital_literacy_rate: { costFactor: 8000, isPositive: true },
  malnutrition_rate: { costFactor: 25000, isPositive: false },
  avg_healthcare_access_time_min: { costFactor: 4000, isPositive: false },
  drinking_water_coverage_pct: { costFactor: 12000, isPositive: true },
  sanitation_coverage_pct: { costFactor: 10000, isPositive: true },
  electricity_hours_per_day: { costFactor: 30000, isPositive: true },
  "internet_penetration%": { costFactor: 5000, isPositive: true }
};

function formatMetricName(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/%/g, '')
    .replace(/\bpct\b/g, '%')
    .replace(/\bavg\b/gi, 'Avg')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function VillageDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [village, setVillage] = useState(null);
  const [metrics, setMetrics] = useState({});
  const [metricMeta, setMetricMeta] = useState({});
  const [loading, setLoading] = useState(true);

  // Simulation states
  const [simulatedMetrics, setSimulatedMetrics] = useState({});
  const [simulatedRank, setSimulatedRank] = useState(null);
  const [simulatingRank, setSimulatingRank] = useState(false);
  const [customBudget, setCustomBudget] = useState('');
  const [activePreset, setActivePreset] = useState(null);

  const applyPreset = (presetType) => {
    const updated = {};
    Object.values(metrics).forEach(items => {
      items.forEach(item => {
        updated[item.name] = item.value;
      });
    });

    if (presetType === 'water_sanitation') {
      updated['drinking_water_coverage_pct'] = 100;
      updated['sanitation_coverage_pct'] = 100;
    } else if (presetType === 'digital_edu') {
      updated['digital_literacy_rate'] = 90;
      updated['internet_penetration%'] = 90;
      updated['electricity_hours_per_day'] = 24;
    } else if (presetType === 'healthcare') {
      updated['malnutrition_rate'] = Math.max(0, updated['malnutrition_rate'] - 15);
      updated['avg_healthcare_access_time_min'] = Math.max(5, Math.min(updated['avg_healthcare_access_time_min'], 30));
    } else if (presetType === 'economic') {
      updated['avg_household_income'] = Math.min(50000, updated['avg_household_income'] * 1.5);
      updated['poverty_rate'] = Math.max(0, updated['poverty_rate'] - 20);
    }
    
    setSimulatedMetrics(updated);
    setActivePreset(presetType);
  };

  const optimizeBudgetAllocation = (totalBudget) => {
    if (!village || !totalBudget || totalBudget <= 0) return;

    const initialSimulated = {};
    Object.values(metrics).forEach(items => {
      items.forEach(item => {
        initialSimulated[item.name] = item.value;
      });
    });

    let remainingBudget = totalBudget;

    const steps = {
      avg_household_income: 100,
      poverty_rate: 0.5,
      dropout_rate: 0.5,
      digital_literacy_rate: 1,
      malnutrition_rate: 0.5,
      avg_healthcare_access_time_min: 1,
      drinking_water_coverage_pct: 1,
      sanitation_coverage_pct: 1,
      electricity_hours_per_day: 0.5,
      "internet_penetration%": 1
    };

    let loopCount = 0;
    const maxLoops = 2000;
    
    while (remainingBudget > 0 && loopCount < maxLoops) {
      let bestMetric = null;
      let bestROI = -1;
      let bestStepCost = 0;
      let bestNextVal = 0;

      SLIDER_CONFIGS.forEach(cfg => {
        const col = cfg.col;
        const currentVal = initialSimulated[col] !== undefined ? initialSimulated[col] : (metricMeta[col]?.min || 0);
        const step = steps[col];
        const config = OPTIMIZER_FACTORS[col];

        if (!config) return;

        let nextVal;
        if (config.isPositive) {
          nextVal = Math.min(cfg.maxVal, currentVal + step);
        } else {
          nextVal = Math.max(cfg.minVal, currentVal - step);
        }

        if (nextVal === currentVal) return;

        const valChange = Math.abs(nextVal - currentVal);
        const stepCost = valChange * config.costFactor;

        if (stepCost > remainingBudget) return;

        const currentNorm = getNormalizedValue(col, currentVal);
        const nextNorm = getNormalizedValue(col, nextVal);
        const normGain = nextNorm - currentNorm;

        const roi = normGain / stepCost;

        if (roi > bestROI && normGain > 0) {
          bestROI = roi;
          bestMetric = col;
          bestStepCost = stepCost;
          bestNextVal = nextVal;
        }
      });

      if (!bestMetric) break;

      initialSimulated[bestMetric] = bestNextVal;
      remainingBudget -= bestStepCost;
      loopCount++;
    }

    setSimulatedMetrics(initialSimulated);
    setActivePreset(null);
  };

  const localMapRef = useRef(null);

  // Fetch initial data
  useEffect(() => {
    setLoading(true);
    fetchVillage(id)
      .then(res => {
        setVillage(res.village);
        setMetrics(res.metrics || {});
        setMetricMeta(res.metricMeta || {});
        
        // Flatten metrics to initialize simulator state
        const initialSimulated = {};
        if (res.metrics) {
          Object.values(res.metrics).forEach(items => {
            items.forEach(item => {
              initialSimulated[item.name] = item.value;
            });
          });
        }
        setSimulatedMetrics(initialSimulated);
        setSimulatedRank(res.village?.overall_rank);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  // Priority classification helper
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

  // Normalization math helper
  const getNormalizedValue = (col, val) => {
    const colMeta = metricMeta[col];
    if (!colMeta) return 50.0;
    const { min, max } = colMeta;
    if (min === max) return 50.0;

    let norm = ((val - min) / (max - min)) * 100;
    norm = Math.min(100, Math.max(0, norm)); // Bound between 0 and 100

    // List of negative indicators
    const isNegative = [
      "poverty_rate", "farmer_debt_index", "dropout_rate", "infant_mortality_rate", 
      "malnutrition_rate", "avg_healthcare_access_time_min", "flood_risk_score", 
      "earthquake_risk_score", "climate_vulnerability_index", "corruption_risk_proxy", 
      "total_crime_rate", "crimes_against_women_rate", "nearest_hospital_distance_km"
    ].includes(col);

    return isNegative ? (100 - norm) : norm;
  };

  // Compute a single category score based on simulated values
  const getSimulatedCategoryScore = (category) => {
    const cols = METRIC_MAP[category];
    let sum = 0;
    let count = 0;
    cols.forEach(col => {
      const val = simulatedMetrics[col];
      if (val !== undefined && val !== null) {
        sum += getNormalizedValue(col, val);
        count++;
      }
    });
    return count > 0 ? Number((sum / count).toFixed(2)) : 50.0;
  };

  // Memoized simulated domain scores
  const simulatedScores = useMemo(() => {
    if (!village) return {};
    const scores = {};
    Object.keys(METRIC_MAP).forEach(cat => {
      scores[cat] = getSimulatedCategoryScore(cat);
    });
    return scores;
  }, [simulatedMetrics, village, metricMeta]);

  // Memoized overall score
  const simulatedOverallScore = useMemo(() => {
    const scoresList = Object.values(simulatedScores);
    if (scoresList.length === 0) return 0;
    return Number((scoresList.reduce((a, b) => a + b, 0) / scoresList.length).toFixed(2));
  }, [simulatedScores]);

  // Debounced API call to retrieve simulated national rank
  useEffect(() => {
    if (!village || loading) return;
    
    // Check if score changed from original overall score
    const diff = Math.abs(simulatedOverallScore - village.overall_score);
    if (diff < 0.01) {
      setSimulatedRank(village.overall_rank);
      return;
    }

    setSimulatingRank(true);
    const handler = setTimeout(() => {
      fetchSimulatedRank(simulatedOverallScore)
        .then(res => {
          setSimulatedRank(res.rank);
        })
        .catch(console.error)
        .finally(() => setSimulatingRank(false));
    }, 300);

    return () => clearTimeout(handler);
  }, [simulatedOverallScore, village, loading]);

  // Budget Allocation logic based on deficit prioritization
  const budgetAllocationData = useMemo(() => {
    if (!village) return [];
    
    const budgetTotal = village.recommended_budget_inr || 1000000;
    
    // Calculate deficits (100 - score)
    const deficits = {};
    let totalDeficit = 0;
    
    Object.entries(simulatedScores).forEach(([cat, score]) => {
      const def = Math.max(0, 100 - score);
      deficits[cat] = def;
      totalDeficit += def;
    });

    return Object.entries(simulatedScores).map(([cat, score]) => {
      const ratio = totalDeficit > 0 ? (deficits[cat] / totalDeficit) : (1 / 7);
      return {
        name: cat,
        value: Math.round(budgetTotal * ratio),
        percentage: Number((ratio * 100).toFixed(1)),
        color: DOMAIN_COLORS[cat]
      };
    }).filter(d => d.value > 0);
  }, [simulatedScores, village]);

  // Radar Data combining original and simulated scores
  const radarData = useMemo(() => {
    if (!village) return [];
    return Object.entries(DOMAIN_LABELS).map(([key, label]) => {
      const catKey = label; // Map label to simulatedScores keys
      return {
        domain: label,
        original: village[key] || 0,
        simulated: simulatedScores[catKey] || 0,
        fullMark: 100,
      };
    });
  }, [village, simulatedScores]);

  // Leaflet map setup for showing local village and nearby facilities
  useEffect(() => {
    if (!loading && village && village.latitude && village.longitude && window.L) {
      const timer = setTimeout(() => {
        const container = document.getElementById('village-local-map');
        if (!container) return;

        if (localMapRef.current) {
          localMapRef.current.remove();
        }

        const center = [village.latitude, village.longitude];
        const map = window.L.map('village-local-map', {
          zoomControl: true,
          scrollWheelZoom: false,
        }).setView(center, 13);
        localMapRef.current = map;

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        // Custom Village Icon marker (Red circle)
        window.L.circle(center, {
          radius: 120,
          color: '#ef4444',
          fillColor: '#ef4444',
          fillOpacity: 0.4,
          weight: 2
        }).addTo(map);

        window.L.circleMarker(center, {
          radius: 10,
          fillColor: '#ef4444',
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        })
        .addTo(map)
        .bindPopup(`<strong>${village.village_name} (Center)</strong><br/>Gram Panchayat: ${village.gram_panchayat || '—'}`)
        .openPopup();

        // Calculate and plot simulated facilities based on distance metrics
        const hospitalDist = village.nearest_hospital_distance_km || 5.0;
        const schoolDist = (simulatedMetrics.school_count > 0) ? 0.3 : 3.0;
        const marketDist = (15 - ((simulatedMetrics.market_access_score || 50) / 100) * 14.5);

        const facilities = [
          { name: 'Simulated Nearby Hospital', dist: hospitalDist, color: '#ef4444', angle: 0, icon: '🏥' },
          { name: 'Simulated Local School', dist: schoolDist, color: '#6366f1', angle: 72, icon: '🏫' },
          { name: 'Simulated Nearby Market', dist: marketDist, color: '#f59e0b', angle: 144, icon: '🛒' },
        ];

        const mapPoints = [center];

        facilities.forEach(fac => {
          // Convert distance & angle into offset lat/lon coordinates
          const rad = (fac.angle * Math.PI) / 180;
          const latOffset = (fac.dist / 111.3) * Math.cos(rad);
          const lonOffset = (fac.dist / (111.3 * Math.cos((village.latitude * Math.PI) / 180))) * Math.sin(rad);

          const facCoord = [village.latitude + latOffset, village.longitude + lonOffset];
          mapPoints.push(facCoord);

          // Plot marker
          window.L.circleMarker(facCoord, {
            radius: 7,
            fillColor: fac.color,
            color: '#ffffff',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.85
          })
          .addTo(map)
          .bindPopup(`<strong>${fac.name}</strong><br/>Distance: ${fac.dist.toFixed(1)} km`);

          // Draw dotted connector line
          window.L.polyline([center, facCoord], {
            color: fac.color,
            weight: 1.5,
            dashArray: '5, 8',
            opacity: 0.7
          }).addTo(map);
        });

        // Fit map bounds to show all simulated facility lines
        map.fitBounds(mapPoints, { padding: [50, 50] });
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [loading, village, simulatedMetrics.school_count, simulatedMetrics.market_access_score]);

  // Cleanup map instance on unmount
  useEffect(() => {
    return () => {
      if (localMapRef.current) {
        localMapRef.current.remove();
        localMapRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading-state"><div className="spinner" /><p>Loading village details...</p></div>
      </div>
    );
  }

  if (!village) {
    return (
      <div className="dashboard">
        <p>Village not found.</p>
        <button className="btn btn--primary" onClick={() => navigate('/')}>Back</button>
      </div>
    );
  }

  const overallScoreDiff = Number((simulatedOverallScore - village.overall_score).toFixed(2));
  const overallRankDiff = village.overall_rank - simulatedRank;

  return (
    <div className="dashboard animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }} className="no-print">
        <button className="btn btn--ghost back-btn" onClick={() => navigate('/')} id="back-btn" style={{ margin: 0 }}>
          ← Back to Rankings
        </button>
        <button className="btn btn--primary" onClick={() => window.print()} id="print-pdf-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          🖨️ Print PDF Report
        </button>
      </div>

      {/* Main glass info header */}
      <header className="village-header glass-panel">
        <div className="village-header-top">
          <div>
            <h2 className="village-name">{village.village_name}</h2>
            <p className="village-location">
              {village.district}, {village.state}
              {village.block && ` · Block: ${village.block}`}
              {village.gram_panchayat && ` · Panchayat: ${village.gram_panchayat}`}
            </p>
          </div>
          <div className="village-rank-badge">
            <span className="rank-number">#{village.overall_rank?.toLocaleString()}</span>
            <span className="rank-label">National Rank</span>
          </div>
        </div>

        <div className="village-meta-grid">
          <div className="meta-item">
            <span className="meta-label">Population</span>
            <span className="meta-value">{village.total_population?.toLocaleString()}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Households</span>
            <span className="meta-value">{village.households?.toLocaleString()}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Area</span>
            <span className="meta-value">{village.area_sq_km} km²</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Density</span>
            <span className="meta-value">{village.population_density?.toFixed(0)} /km²</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Priority</span>
            <span className={`priority-badge ${getPriorityClass(village.priority_level)}`}>
              {village.priority_level}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Urgency Score</span>
            <span className="meta-value">{village.village_urgency_score?.toFixed(1)}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Category</span>
            <span className="meta-value">{village.intervention_category}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Base Budget</span>
            <span className="meta-value" style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
              {village.recommended_budget_inr
                ? `₹${Number(village.recommended_budget_inr).toLocaleString()}`
                : '—'}
            </span>
          </div>
        </div>
      </header>

      {/* Scores & Proximity Map layout grid */}
      <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', margin: '24px 0' }}>
        {/* Domain Profile Radar (Double shape overlays) */}
        <div className="glass-panel radar-panel" style={{ height: '420px' }}>
          <h3 className="panel-title">Domain Score Profile</h3>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Overlay compares baseline metrics (purple) with simulated metric planner (blue).
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="domain" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} />
              <Radar
                name="Baseline"
                dataKey="original"
                stroke="var(--accent)"
                fill="var(--accent)"
                fillOpacity={0.1}
                strokeWidth={1.5}
              />
              <Radar
                name="Simulated"
                dataKey="simulated"
                stroke="#06b6d4"
                fill="#06b6d4"
                fillOpacity={0.25}
                strokeWidth={2}
              />
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

        {/* Local facility connection map */}
        <div className="glass-panel" style={{ height: '420px', display: 'flex', flexDirection: 'column' }}>
          <h3 className="panel-title" style={{ marginBottom: '4px' }}>Local Proximity Map</h3>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Estimated locations based on distance indices (dashed lines map straight-line proximity).
          </p>
          <div id="village-local-map" style={{ flex: 1, width: '100%', borderRadius: '8px', zIndex: 1 }} />
        </div>
      </div>

      {/* Intervention simulator control dashboard */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px' }}>
        <h3 className="panel-title" style={{ fontSize: '18px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '20px' }}>
          🛠️ AI Development Planner & Dynamic Simulator
        </h3>

        {/* Campaign Presets and Smart Budget Optimizer panel */}
        <div style={{ marginBottom: '24px', background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }} className="no-print">
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {/* Presets */}
            <div style={{ flex: '2 1 400px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Quick-Apply Intervention Presets</h4>
              <div className="preset-grid">
                <button 
                  className={`preset-btn ${activePreset === 'water_sanitation' ? 'preset-btn--active' : ''}`}
                  onClick={() => applyPreset('water_sanitation')}
                >
                  💧 Clean Water & Sanitation
                </button>
                <button 
                  className={`preset-btn ${activePreset === 'digital_edu' ? 'preset-btn--active' : ''}`}
                  onClick={() => applyPreset('digital_edu')}
                >
                  💻 Digital Village Push
                </button>
                <button 
                  className={`preset-btn ${activePreset === 'healthcare' ? 'preset-btn--active' : ''}`}
                  onClick={() => applyPreset('healthcare')}
                >
                  🏥 Primary Health Drive
                </button>
                <button 
                  className={`preset-btn ${activePreset === 'economic' ? 'preset-btn--active' : ''}`}
                  onClick={() => applyPreset('economic')}
                >
                  🌾 Economy & Poverty Relief
                </button>
              </div>
            </div>

            {/* Smart Optimizer */}
            <div style={{ flex: '1 1 250px', borderLeft: '1px solid var(--border)', paddingLeft: '24px', minWidth: '240px' }} className="optimizer-section">
              <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Smart Budget Optimizer</h4>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  className="search-input" 
                  style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}
                  placeholder={`e.g. ₹${(village.recommended_budget_inr || 1500000).toLocaleString()}`}
                  value={customBudget}
                  onChange={e => setCustomBudget(e.target.value.replace(/\D/g, ''))}
                  id="optimizer-budget-input"
                />
                <button 
                  className="btn btn--primary"
                  onClick={() => {
                    const b = customBudget ? parseInt(customBudget) : (village.recommended_budget_inr || 1500000);
                    optimizeBudgetAllocation(b);
                  }}
                  id="optimizer-run-btn"
                  style={{ fontSize: '12px', whiteSpace: 'nowrap' }}
                >
                  Auto-Allocate
                </button>
              </div>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Runs gradient allocation to maximize score gain based on index cost coefficients.
              </p>
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          {/* Slider controls (Left) */}
          <div style={{ flex: '2 1 500px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            {SLIDER_CONFIGS.map(cfg => {
              const currentVal = simulatedMetrics[cfg.col] !== undefined ? simulatedMetrics[cfg.col] : (metricMeta[cfg.col]?.min || 0);
              const baselineVal = metrics[cfg.category]?.find(m => m.name === cfg.col)?.value ?? currentVal;
              const color = DOMAIN_COLORS[cfg.category];

              return (
                <div key={cfg.col} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{cfg.label}</span>
                    <span style={{ fontWeight: '700', color }}>{currentVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                  </div>
                  <input
                    type="range"
                    min={cfg.minVal}
                    max={cfg.maxVal}
                    step={cfg.step}
                    value={currentVal}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setSimulatedMetrics(prev => ({ ...prev, [cfg.col]: v }));
                    }}
                    style={{ width: '100%', accentColor: color, cursor: 'pointer', height: '5px' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)' }}>
                    <span>Baseline: {baselineVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                    {currentVal !== baselineVal && (
                      <span style={{ color: currentVal > baselineVal ? 'var(--success)' : 'var(--danger)' }}>
                        {currentVal > baselineVal ? '▲ Improved' : '▼ Regressed'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Simulated results & Budget Allocation Pie (Right) */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '20px', minWidth: '280px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: '12px', padding: '16px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                Simulated Impact
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Simulated Score</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: '#06b6d4', margin: '4px 0' }}>
                    {simulatedOverallScore.toFixed(1)}
                  </div>
                  <div style={{ fontSize: '10px' }}>
                    {overallScoreDiff > 0 ? (
                      <span style={{ color: 'var(--success)' }}>+{overallScoreDiff.toFixed(1)} gain</span>
                    ) : overallScoreDiff < 0 ? (
                      <span style={{ color: 'var(--danger)' }}>{overallScoreDiff.toFixed(1)} drop</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>No change</span>
                    )}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Estimated Rank</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: '#06b6d4', margin: '4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    #{simulatedRank?.toLocaleString()}
                    {simulatingRank && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>...</span>}
                  </div>
                  <div style={{ fontSize: '10px' }}>
                    {overallRankDiff > 0 ? (
                      <span style={{ color: 'var(--success)' }}>▲ Improved by {overallRankDiff.toLocaleString()}</span>
                    ) : overallRankDiff < 0 ? (
                      <span style={{ color: 'var(--danger)' }}>▼ Slipped by {Math.abs(overallRankDiff).toLocaleString()}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>No change</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  const initial = {};
                  Object.values(metrics).forEach(items => {
                    items.forEach(item => {
                      initial[item.name] = item.value;
                    });
                  });
                  setSimulatedMetrics(initial);
                  setSimulatedRank(village.overall_rank);
                }}
                style={{ width: '100%', fontSize: '11px', padding: '6px' }}
              >
                Reset Planner
              </button>
            </div>

            {/* Budget Allocation Pie chart */}
            <div style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--text-secondary)', alignSelf: 'flex-start' }}>
                Simulated Budget Allocation
              </h4>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={budgetAllocationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {budgetAllocationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`₹${value.toLocaleString()}`, 'Allocated Budget']}
                    contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid var(--border)', borderRadius: '8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', justifyContent: 'center', fontSize: '10px', marginTop: '10px' }}>
                {budgetAllocationData.map(d => (
                  <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: d.color }} />
                    {d.name}: ₹{Math.round(d.value / 1000)}K ({d.percentage}%)
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Raw metrics sections */}
      <div className="metrics-section">
        <h3 className="section-title">Baseline Detail Metrics</h3>
        <div className="metrics-grid">
          {Object.entries(metrics).map(([category, items]) => (
            <div key={category} className="glass-panel metric-category-panel">
              <h4 className="metric-category-title" style={{ borderBottom: `2px solid ${DOMAIN_COLORS[category] || 'var(--border)'}`, paddingBottom: '6px' }}>
                {category}
              </h4>
              <div className="metric-list">
                {items.map((m, i) => (
                  <div key={i} className="metric-row">
                    <span className="metric-name">{formatMetricName(m.name)}</span>
                    <span className="metric-value">
                      {typeof m.value === 'number' ? m.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : m.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
