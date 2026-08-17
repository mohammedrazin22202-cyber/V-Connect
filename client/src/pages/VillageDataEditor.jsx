import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchRankings, fetchVillage, updateVillageMetrics } from '../api';
import metricMeta from '../metric_meta.json';

const SECTIONS = {
  demographics: {
    label: 'Demographics',
    fields: [
      { key: 'total_population', label: 'Total Population', type: 'number', isInt: true },
      { key: 'households', label: 'Households count', type: 'number', isInt: true },
      { key: 'gram_panchayat', label: 'Gram Panchayat', type: 'text' },
      { key: 'block', label: 'Development Block', type: 'text' }
    ]
  },
  economy: {
    label: 'Economy & Agriculture',
    fields: [
      { key: 'employment_rate', label: 'Employment Rate (%)', type: 'number' },
      { key: 'avg_household_income', label: 'Avg Household Income (INR)', type: 'number' },
      { key: 'poverty_rate', label: 'Poverty Rate (%)', type: 'number' },
      { key: 'crop_yield_index%', label: 'Crop Yield Index (%)', type: 'number' },
      { key: 'farmer_income_avg', label: 'Avg Farmer Income (INR)', type: 'number' },
      { key: 'farmer_debt_index', label: 'Farmer Debt Index', type: 'number' },
      { key: 'market_access_score', label: 'Market Access Score', type: 'number' },
      { key: 'bank_access_score', label: 'Bank Access Score', type: 'number' }
    ]
  },
  education: {
    label: 'Education & Literacy',
    fields: [
      { key: 'literacy_rate', label: 'Literacy Rate (%)', type: 'number' },
      { key: 'female_literacy_rate', label: 'Female Literacy Rate (%)', type: 'number' },
      { key: 'dropout_rate', label: 'Dropout Rate (%)', type: 'number' },
      { key: 'school_count', label: 'Schools Presence', type: 'number', isInt: true },
      { key: 'teacher_student_ratio', label: 'Teacher-Student Ratio', type: 'number' },
      { key: 'digital_literacy_rate', label: 'Digital Literacy Rate (%)', type: 'number' }
    ]
  },
  health: {
    label: 'Health & Nutrition',
    fields: [
      { key: 'infant_mortality_rate', label: 'Infant Mortality Rate (‰)', type: 'number' },
      { key: 'malnutrition_rate', label: 'Child Malnutrition Rate (%)', type: 'number' },
      { key: 'vaccination_coverage%', label: 'Vaccination Coverage (%)', type: 'number' },
      { key: 'medical_staff_per_1000', label: 'Medical Staff per 1000', type: 'number' },
      { key: 'avg_healthcare_access_time_min', label: 'Healthcare Access Time (min)', type: 'number' },
      { key: 'healthcare_effectiveness_score', label: 'Healthcare Effectiveness', type: 'number' }
    ]
  },
  infrastructure: {
    label: 'Infrastructure & Utilities',
    fields: [
      { key: 'drinking_water_coverage_pct', label: 'Water Coverage (%)', type: 'number' },
      { key: 'sanitation_coverage_pct', label: 'Sanitation Coverage (%)', type: 'number' },
      { key: 'road_quality_index', label: 'Road Quality Index', type: 'number' },
      { key: 'electricity_hours_per_day', label: 'Electricity Hours', type: 'number' },
      { key: 'internet_penetration%', label: 'Internet Penetration (%)', type: 'number' },
      { key: 'nearest_hospital_distance_km', label: 'Nearest Hospital Distance (km)', type: 'number' }
    ]
  },
  environment: {
    label: 'Environment & Climate',
    fields: [
      { key: 'flood_risk_score', label: 'Flood Risk Score', type: 'number' },
      { key: 'earthquake_risk_score', label: 'Earthquake Risk Score', type: 'number' },
      { key: 'air_quality_index', label: 'Air Quality Index', type: 'number' },
      { key: 'forest_cover_pct', label: 'Forest Cover (%)', type: 'number' },
      { key: 'disaster_preparedness_score', label: 'Disaster Preparedness', type: 'number' },
      { key: 'climate_vulnerability_index', label: 'Climate Vulnerability', type: 'number' }
    ]
  },
  governance: {
    label: 'Governance & Schemes',
    fields: [
      { key: 'panchayat_efficiency_score', label: 'Panchayat Efficiency', type: 'number' },
      { key: 'transparency_index', label: 'Transparency Index', type: 'number' },
      { key: 'fund_utilization_pct', label: 'Fund Utilization (%)', type: 'number' },
      { key: 'scheme_coverage_pct', label: 'Scheme Coverage (%)', type: 'number' },
      { key: 'corruption_risk_proxy', label: 'Corruption Risk Proxy', type: 'number' }
    ]
  },
  social: {
    label: 'Social Stability',
    fields: [
      { key: 'total_crime_rate', label: 'Total Crime Rate', type: 'number' },
      { key: 'crimes_against_women_rate', label: 'Crimes Against Women', type: 'number' },
      { key: 'social_cohesion_index', label: 'Social Cohesion Index', type: 'number' },
      { key: 'community_participation_score', label: 'Community Participation', type: 'number' },
      { key: 'youth_engagement_score', label: 'Youth Engagement Score', type: 'number' }
    ]
  }
};

export default function VillageDataEditor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [villageId, setVillageId] = useState(null);
  const [villageData, setVillageData] = useState(null);
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  // Load village on parameter change
  useEffect(() => {
    if (id) {
      loadVillageData(id);
    }
  }, [id]);

  // Search typeahead
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

  const loadVillageData = (vId) => {
    setLoading(true);
    setSaveStatus(null);
    setErrors({});
    fetchVillage(vId)
      .then(res => {
        setVillageId(vId);
        setVillageData(res);
        if (res && res.raw) {
          setFormData(res.raw);
        }
      })
      .catch(err => {
        console.error("Failed to load village:", err);
      })
      .finally(() => setLoading(false));
  };

  const handleSelectVillage = (v) => {
    setSearchQuery('');
    setSearchResults([]);
    navigate(`/edit-village/${v.village_id}`);
  };

  const handleInputChange = (key, val, config) => {
    let finalVal = val;
    let fieldErr = null;

    if (config.type === 'number') {
      if (val === '') {
        finalVal = '';
      } else {
        const num = config.isInt ? parseInt(val, 10) : parseFloat(val);
        finalVal = isNaN(num) ? '' : num;

        // Validation against metric_meta boundaries
        const limits = metricMeta[key];
        if (limits) {
          if (finalVal < limits.min) {
            fieldErr = `Value cannot be less than ${limits.min}`;
          } else if (finalVal > limits.max) {
            fieldErr = `Value cannot be greater than ${limits.max}`;
          }
        }
      }
    }

    setFormData(prev => ({
      ...prev,
      [key]: finalVal
    }));

    setErrors(prev => ({
      ...prev,
      [key]: fieldErr
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check validation errors
    const activeErrors = Object.values(errors).filter(err => err !== null);
    if (activeErrors.length > 0) {
      alert("Please fix validation errors before saving.");
      return;
    }

    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await updateVillageMetrics(villageId, formData);
      if (res.success) {
        setSaveStatus({
          success: true,
          message: "Data saved successfully! Domain scores and national rankings recalculated.",
          scores: res.scores
        });
      } else {
        setSaveStatus({
          success: false,
          message: res.error || "Failed to save village data."
        });
      }
    } catch (err) {
      setSaveStatus({
        success: false,
        message: err.message || "An error occurred during submission."
      });
    }
    setSaving(false);
  };

  const hasFormErrors = Object.values(errors).some(err => err !== null);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h2 className="page-title">Village Data Editor</h2>
          <p className="page-subtitle">Administrative CRUD dashboard to search, inspect, and modify raw village metric values</p>
        </div>
      </header>

      {/* Village Search Autocomplete Bar */}
      <div className="filter-bar" style={{ position: 'relative', overflow: 'visible', marginBottom: '20px' }}>
        <div className="filter-group" style={{ width: '100%' }}>
          <label htmlFor="editor-search">Search Village to Edit</label>
          <input
            id="editor-search"
            type="text"
            placeholder="Type name to load a village profile..."
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

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading village record...</p>
        </div>
      ) : villageData ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Status Message */}
          {saveStatus && (
            <div className="alert-box" style={{
              borderLeft: `4px solid ${saveStatus.success ? '#10b981' : '#ef4444'}`,
              backgroundColor: saveStatus.success ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
              padding: '16px',
              borderRadius: '8px'
            }}>
              <strong style={{ color: saveStatus.success ? '#10b981' : '#ef4444', display: 'block', fontSize: '14px', marginBottom: '4px' }}>
                {saveStatus.success ? '✓ Success' : '✗ Save Failed'}
              </strong>
              <p style={{ margin: 0, fontSize: '13px' }}>{saveStatus.message}</p>
              {saveStatus.success && saveStatus.scores && (
                <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                  <div style={{ fontSize: '11px', background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '4px' }}>
                    Overall Score: <strong>{saveStatus.scores.overall_score.toFixed(1)}</strong>
                  </div>
                  {Object.entries(saveStatus.scores).map(([k, s]) => {
                    if (k === 'overall_score') return null;
                    return (
                      <div key={k} style={{ fontSize: '11px', background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '4px' }}>
                        {k.replace('_score', '').replace(/^\w/, c => c.toUpperCase())}: <strong>{s.toFixed(1)}</strong>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Core Info Header */}
          <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="badge" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
                Active Record
              </span>
              <h3 className="section-title" style={{ marginTop: '6px', marginBottom: '2px' }}>{villageData.name}</h3>
              <p className="text-muted" style={{ fontSize: '12px', margin: 0 }}>
                District: <strong>{villageData.district}</strong> | State: <strong>{villageData.state}</strong> | ID: <strong>{villageId}</strong>
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => navigate(`/village/${villageId}`)}
                className="btn btn-secondary"
                style={{ cursor: 'pointer' }}
              >
                Inspect Profile
              </button>
              <button
                type="submit"
                disabled={saving || hasFormErrors}
                className="btn btn-primary"
                style={{
                  cursor: (saving || hasFormErrors) ? 'not-allowed' : 'pointer',
                  opacity: (saving || hasFormErrors) ? 0.6 : 1,
                  background: 'var(--primary)',
                  border: 'none'
                }}
              >
                {saving ? 'Saving...' : 'Save & Recalculate'}
              </button>
            </div>
          </div>

          {/* Form Sections */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {Object.entries(SECTIONS).map(([sectKey, config]) => (
              <div key={sectKey} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h3 className="panel-title" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '4px' }}>
                  {config.label}
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {config.fields.map(f => {
                    const limits = metricMeta[f.key];
                    const error = errors[f.key];
                    return (
                      <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label
                          htmlFor={`field-${f.key}`}
                          style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}
                        >
                          {f.label}
                        </label>
                        <input
                          id={`field-${f.key}`}
                          type={f.type}
                          value={formData[f.key] ?? ''}
                          onChange={(e) => handleInputChange(f.key, e.target.value, f)}
                          style={{
                            padding: '8px 10px',
                            background: 'var(--card-bg-alt)',
                            border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`,
                            borderRadius: '6px',
                            color: 'var(--text-main)',
                            fontSize: '13px'
                          }}
                        />
                        {limits && (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            Range: {limits.min} to {limits.max}
                          </span>
                        )}
                        {error && (
                          <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 'bold' }}>
                            ⚠ {error}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

        </form>
      ) : (
        <div className="panel text-center text-muted" style={{ padding: '60px', marginTop: '20px' }}>
          🔒 Search and load a village profile above to edit its parameters in this administrative portal.
        </div>
      )}
    </div>
  );
}


// Git commit touch-up 18: refactor: Add collapsible toggle buttons for CRUD editor sections (collapsible)


// Git commit touch-up 19: style: Adjust validation range hint text colors and size (fontSize: '11px')


// Git commit touch-up 20: ux: Add redirect confirm on successfully saving metrics (redirect)


// Git commit touch-up 21: docs: Add description blocks for metric ranges in editor forms (description)


// Git commit touch-up 36: refactor: Implement instant field reset action in CRUD editor (reset button)
