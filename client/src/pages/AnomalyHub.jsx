import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAnomalies } from '../api';

const ANOMALY_TYPES = {
  economic: {
    label: 'Economic Inequality',
    icon: '🌾',
    desc: 'High average household income (> ₹1,50,000) combined with a high poverty rate (> 35%). Indicates extreme wealth disparity or data ingestion errors.',
    badgeColor: 'rgba(245, 158, 11, 0.15)',
    textColor: '#f59e0b',
    cols: [
      { key: 'poverty_rate', label: 'Poverty Rate', unit: '%' },
      { key: 'avg_household_income', label: 'Household Income', unit: ' INR' }
    ]
  },
  healthcare: {
    label: 'Healthcare Isolation',
    icon: '🏥',
    desc: 'High population center (> 2,000 residents) situated very far from the nearest hospital (> 25 km) with low road connectivity index (< 35). High risk for emergency dispatch.',
    badgeColor: 'rgba(239, 68, 68, 0.15)',
    textColor: '#ef4444',
    cols: [
      { key: 'nearest_hospital_distance_km', label: 'Hospital Distance', unit: ' km' },
      { key: 'road_quality_index', label: 'Road Quality', unit: '' }
    ]
  },
  education: {
    label: 'Educational Inefficiency',
    icon: '🏫',
    desc: 'Low literacy rates (< 45%) despite having 3 or more schools built within the village block. Indicates potential resource under-utilization or teacher attendance issues.',
    badgeColor: 'rgba(99, 102, 241, 0.15)',
    textColor: '#6366f1',
    cols: [
      { key: 'school_count', label: 'Schools', unit: '' },
      { key: 'literacy_rate', label: 'Literacy Rate', unit: '%' }
    ]
  },
  infrastructure: {
    label: 'Basic Infrastructure Gap',
    icon: '⚡',
    desc: 'High population center (> 4,000 residents) lacking basic grid power (< 8 hours/day) or drinking water tap coverage (< 40%). High priority for infrastructural pipeline funding.',
    badgeColor: 'rgba(6, 182, 212, 0.15)',
    textColor: '#06b6d4',
    cols: [
      { key: 'drinking_water_coverage_pct', label: 'Water Coverage', unit: '%' },
      { key: 'electricity_hours_per_day', label: 'Electricity Hours', unit: ' hrs/day' }
    ]
  },
  social: {
    label: 'Social Cohesion Paradox',
    icon: '🤝',
    desc: 'High community participation & cohesion scores (> 65) matching high crime rate records (> 45). Indicates conflicting community reports or demographic unrest.',
    badgeColor: 'rgba(236, 72, 153, 0.15)',
    textColor: '#ec4899',
    cols: [
      { key: 'social_cohesion_index', label: 'Social Cohesion', unit: '' },
      { key: 'total_crime_rate', label: 'Crime Rate', unit: '' }
    ]
  }
};

export default function AnomalyHub() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('economic');

  useEffect(() => {
    setLoading(true);
    fetchAnomalies()
      .then(res => {
        if (res.success) {
          setData(res.data || {});
          setCounts(res.counts || null);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <div>
            <h2 className="page-title">Diagnostic & Anomaly Hub</h2>
            <p className="page-subtitle">Scanning village indicators for statistical anomalies...</p>
          </div>
        </header>
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Analyzing datasets...</p>
        </div>
      </div>
    );
  }

  const currentTabInfo = ANOMALY_TYPES[activeTab];
  const list = data?.[activeTab] || [];

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h2 className="page-title">Diagnostic & Anomaly Hub</h2>
          <p className="page-subtitle">Identify data errors, statistical outliers, and localized policy bottlenecks in real-time</p>
        </div>
      </header>

      {/* Summary Stat Cards */}
      {counts && (
        <div className="stats-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)', backgroundColor: 'var(--card-bg)' }}>
            <span className="stat-label">Total Outliers Flagged</span>
            <h4 className="stat-value">{counts.total.toLocaleString()}</h4>
          </div>
          {Object.entries(ANOMALY_TYPES).map(([key, config]) => (
            <div
              key={key}
              onClick={() => setActiveTab(key)}
              className="stat-card"
              style={{
                cursor: 'pointer',
                borderLeft: `4px solid ${config.textColor}`,
                backgroundColor: activeTab === key ? 'rgba(255,255,255,0.03)' : 'var(--card-bg)',
                transform: activeTab === key ? 'scale(1.02)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <span className="stat-label">{config.icon} {config.label}</span>
              <h4 className="stat-value" style={{ color: config.textColor }}>
                {counts[key]?.toLocaleString() ?? 0}
              </h4>
            </div>
          ))}
        </div>
      )}

      {/* Tab panel and descriptions */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <span className="badge" style={{ backgroundColor: currentTabInfo.badgeColor, color: currentTabInfo.textColor, fontWeight: 'bold' }}>
            {currentTabInfo.icon} {currentTabInfo.label}
          </span>
          <p className="text-muted" style={{ fontSize: '13px', marginTop: '10px', marginBottom: 0, lineHeight: '1.5' }}>
            {currentTabInfo.desc}
          </p>
        </div>

        {/* Results list table */}
        <div>
          <h3 className="section-title" style={{ fontSize: '15px', marginBottom: '12px' }}>
            Anomalous Villages (Showing top {list.length} matches)
          </h3>
          
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Village Name</th>
                <th>District</th>
                <th>State</th>
                <th>Population</th>
                {currentTabInfo.cols.map(c => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(v => (
                <tr key={v.village_id}>
                  <td><strong>{v.village_name}</strong></td>
                  <td>{v.district}</td>
                  <td className="text-muted" style={{ fontSize: '13px' }}>{v.state}</td>
                  <td>{v.total_population?.toLocaleString() ?? 'N/A'}</td>
                  {currentTabInfo.cols.map(c => (
                    <td key={c.key} style={{ fontWeight: 'bold', color: currentTabInfo.textColor }}>
                      {Number(v[c.key]).toFixed(1)}{c.unit}
                    </td>
                  ))}
                  <td className="text-right" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => navigate(`/village/${v.village_id}`)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      View Profile
                    </button>
                    <button
                      onClick={() => navigate(`/edit-village/${v.village_id}`)}
                      className="btn btn-primary"
                      style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer', border: 'none', background: 'var(--primary)' }}
                    >
                      Edit Data
                    </button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={5 + currentTabInfo.cols.length} className="text-center text-muted" style={{ padding: '24px' }}>
                    No anomalous entries found in this category. Data matches validation boundaries!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// Git commit touch-up 14: style: Enhance badge borders and hover shadows in AnomalyHub cards (boxShadow)
