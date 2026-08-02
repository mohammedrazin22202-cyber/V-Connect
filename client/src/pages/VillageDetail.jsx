import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts';
import { fetchVillage } from '../api';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchVillage(id)
      .then(res => {
        setVillage(res.village);
        setMetrics(res.metrics || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading-state"><div className="spinner" /><p>Loading village...</p></div>
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

  const radarData = Object.entries(DOMAIN_LABELS).map(([key, label]) => ({
    domain: label,
    score: village[key] || 0,
    fullMark: 100,
  }));

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

  return (
    <div className="dashboard">
      <button className="btn btn--ghost back-btn" onClick={() => navigate('/')} id="back-btn">
        ← Back to Rankings
      </button>

      <header className="village-header glass-panel">
        <div className="village-header-top">
          <div>
            <h2 className="village-name">{village.village_name}</h2>
            <p className="village-location">
              {village.district}, {village.state}
              {village.block && ` · ${village.block}`}
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
            <span className="meta-label">Budget (INR)</span>
            <span className="meta-value">
              {village.recommended_budget_inr
                ? `₹${Number(village.recommended_budget_inr).toLocaleString()}`
                : '—'}
            </span>
          </div>
        </div>
      </header>

      {/* Scores Section */}
      <div className="detail-grid">
        {/* Radar Chart */}
        <div className="glass-panel radar-panel">
          <h3 className="panel-title">Domain Profile</h3>
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis
                dataKey="domain"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: '#64748b', fontSize: 10 }}
              />
              <Radar
                name="Score"
                dataKey="score"
                stroke="#6366f1"
                fill="#6366f1"
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
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Score Bars */}
        <div className="glass-panel scores-panel">
          <h3 className="panel-title">Domain Scores</h3>
          <div className="domain-score-list">
            <div className="domain-score-item domain-score-item--overall">
              <ScoreBar score={village.overall_score} label="Overall" size="lg" />
            </div>
            {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
              <div key={key} className="domain-score-item">
                <ScoreBar score={village[key]} label={label} size="md" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Raw Metrics */}
      <div className="metrics-section">
        <h3 className="section-title">Detailed Metrics</h3>
        <div className="metrics-grid">
          {Object.entries(metrics).map(([category, items]) => (
            <div key={category} className="glass-panel metric-category-panel">
              <h4 className="metric-category-title">{category}</h4>
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
