import { useState, useEffect, useRef } from 'react';
import { fetchAdminStats, fetchRankings, updateVillageBudget, triggerPipelineRun, streamPipelineLogs, ingestCSVData, fetchDataQualityReport } from '../api';

export default function AdminPortal() {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Village budget modification states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedVillage, setSelectedVillage] = useState(null);
  const [newBudget, setNewBudget] = useState('');
  const [newPriority, setNewPriority] = useState('');
  
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState(null);

  // Ingestion Validator states
  const [pastedCSV, setPastedCSV] = useState('');
  const [validationLogs, setValidationLogs] = useState([]);
  const [validating, setValidating] = useState(false);
  const [ingesting, setIngesting] = useState(false);

  // Data Import states
  const [parsedData, setParsedData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMappings, setColumnMappings] = useState({});
  const [dragOver, setDragOver] = useState(false);

  // Subprocess Pipeline states
  const [selectedPipeline, setSelectedPipeline] = useState('ingest'); // 'scraper' | 'ingest'
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [pipelineLogs, setPipelineLogs] = useState([]);
  const logTerminalRef = useRef(null);

  // Data Quality states
  const [qualityReport, setQualityReport] = useState(null);
  const [loadingQuality, setLoadingQuality] = useState(true);
  const [qualityTab, setQualityTab] = useState('summary');

  useEffect(() => {
    loadStats();
    loadQualityReport();
  }, []);

  // Auto-scroll pipeline terminal
  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [pipelineLogs]);

  const loadStats = () => {
    setLoadingStats(true);
    fetchAdminStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoadingStats(false));
  };

  const loadQualityReport = () => {
    setLoadingQuality(true);
    fetchDataQualityReport()
      .then(setQualityReport)
      .catch(console.error)
      .finally(() => setLoadingQuality(false));
  };

  // Fetch search results
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetchRankings({ search: searchQuery, limit: 8 })
        .then(res => setSearchResults(res.data || []))
        .catch(console.error);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectVillage = (v) => {
    setSelectedVillage(v);
    setNewBudget(v.recommended_budget_inr || '');
    setNewPriority(v.priority_level || 'Medium');
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSaveOverride = async (e) => {
    e.preventDefault();
    if (!selectedVillage) return;
    setOverrideLoading(true);
    setOverrideMessage(null);
    try {
      const res = await updateVillageBudget({
        village_id: selectedVillage.village_id,
        recommended_budget_inr: parseFloat(newBudget) || 0,
        priority_level: newPriority
      });
      if (res.success) {
        setOverrideMessage({ type: 'success', text: `Success: Overrides saved for ${selectedVillage.village_name}.` });
        loadStats();
      } else {
        setOverrideMessage({ type: 'error', text: res.error || "Save overrides failed." });
      }
    } catch (err) {
      console.error(err);
      setOverrideMessage({ type: 'error', text: "Error: Could not save database overrides." });
    }
    setOverrideLoading(false);
  };

  const VALID_METRICS = [
    "employment_rate", "avg_household_income", "poverty_rate", "crop_yield_index%",
    "farmer_income_avg", "farmer_debt_index", "market_access_score", "bank_access_score",
    "literacy_rate", "female_literacy_rate", "dropout_rate", "school_count",
    "teacher_student_ratio", "digital_literacy_rate", "infant_mortality_rate",
    "malnutrition_rate", "vaccination_coverage%", "medical_staff_per_1000",
    "avg_healthcare_access_time_min", "healthcare_effectiveness_score",
    "drinking_water_coverage_pct", "sanitation_coverage_pct", "road_quality_index",
    "electricity_hours_per_day", "internet_penetration%", "nearest_hospital_distance_km",
    "flood_risk_score", "earthquake_risk_score", "air_quality_index", "forest_cover_pct",
    "disaster_preparedness_score", "climate_vulnerability_index", "panchayat_efficiency_score",
    "transparency_index", "fund_utilization_pct", "scheme_coverage_pct",
    "corruption_risk_proxy", "total_crime_rate", "crimes_against_women_rate",
    "social_cohesion_index", "community_participation_score", "youth_engagement_score",
    "recommended_budget_inr", "priority_level"
  ];

  const performFuzzyMapping = (headers) => {
    const mapping = {};
    const dbOptions = ['village_id', ...VALID_METRICS];
    
    headers.forEach(h => {
      const cleanHeader = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Direct Match
      let bestMatch = dbOptions.find(opt => opt.replace(/[^a-z0-9]/g, '') === cleanHeader);
      
      if (!bestMatch) {
        // Substring / fuzzy mapping
        bestMatch = dbOptions.find(opt => {
          const cleanOpt = opt.replace(/[^a-z0-9]/g, '');
          return cleanOpt.includes(cleanHeader) || cleanHeader.includes(cleanOpt);
        });
      }
      
      mapping[h] = bestMatch || 'skip';
    });
    return mapping;
  };

  const parseCSVContent = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      setValidationLogs(["❌ Error: CSV must contain a header and at least one data row."]);
      return;
    }
    
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length === headers.length) {
        const rowObj = {};
        headers.forEach((h, idx) => {
          rowObj[h] = cols[idx];
        });
        data.push(rowObj);
      }
    }
    
    setCsvHeaders(headers);
    setParsedData(data);
    const mappings = performFuzzyMapping(headers);
    setColumnMappings(mappings);
    setValidationLogs([`📂 Loaded CSV: ${data.length} records, ${headers.length} columns detected. Review column mappings below.`]);
  };

  const constructMappedCSV = () => {
    if (parsedData.length === 0) return '';
    
    const villageIdCsvHeader = Object.entries(columnMappings).find(([_, dbCol]) => dbCol === 'village_id')?.[0];
    if (!villageIdCsvHeader) return '';
    
    const mappedEntries = Object.entries(columnMappings).filter(([_, dbCol]) => dbCol !== 'skip' && dbCol !== 'village_id');
    const newHeaders = ['village_id', ...mappedEntries.map(([_, dbCol]) => dbCol)];
    
    const rows = [newHeaders.join(',')];
    parsedData.forEach(rowObj => {
      const rowData = [rowObj[villageIdCsvHeader]];
      mappedEntries.forEach(([csvH]) => {
        rowData.push(rowObj[csvH]);
      });
      rows.push(rowData.join(','));
    });
    
    return rows.join('\n');
  };

  const handleValidateCSV = (e) => {
    if (e) e.preventDefault();
    setValidating(true);
    setValidationLogs([]);
    
    setTimeout(() => {
      const logs = [];
      logs.push("⏳ Initializing VCONNECT schema validator...");
      
      const mappedCSV = constructMappedCSV();
      if (!mappedCSV) {
        logs.push("❌ Validation Failed: One column must be mapped to 'village_id'");
        setValidationLogs(logs);
        setValidating(false);
        return;
      }
      
      const lines = mappedCSV.split('\n').map(l => l.trim()).filter(Boolean);
      const headers = lines[0].split(',');
      logs.push(`🔍 Mapped Schema Layout: [${headers.join(', ')}]`);
      
      let hasError = false;
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',').map(v => v.trim());
        const villageId = parseInt(row[0], 10);
        if (isNaN(villageId)) {
          logs.push(`❌ Row ${i + 1} has invalid village_id: "${row[0]}"`);
          hasError = true;
          break;
        }
        
        for (let j = 1; j < row.length; j++) {
          const header = headers[j];
          if (header === 'priority_level') {
            const val = row[j].toLowerCase();
            if (!['low', 'medium', 'high', 'critical', 'stable', 'moderate'].includes(val)) {
              logs.push(`❌ Row ${i + 1} has invalid priority_level: "${row[j]}"`);
              hasError = true;
              break;
            }
          } else {
            const val = parseFloat(row[j]);
            if (isNaN(val)) {
              logs.push(`❌ Row ${i + 1} has invalid numeric value for ${headers[j]}: "${row[j]}"`);
              hasError = true;
              break;
            }
          }
        }
        if (hasError) break;
      }

      if (hasError) {
        logs.push("❌ Datatype verification: FAILED");
      } else {
        logs.push("✅ Datatype verification: All mapped columns validated successfully.");
        logs.push("🚀 Ingestion simulation sandbox ready. Ready to append to SQLite.");
      }

      setValidationLogs(logs);
      setValidating(false);
    }, 600);
  };

  const handleIngestCSV = async () => {
    setIngesting(true);
    const logs = [...validationLogs];
    logs.push("⚙️ Starting transaction blocks...");
    logs.push("📝 Appending records into villages master sqlite3...");
    setValidationLogs([...logs]);
    
    try {
      const mappedCSV = constructMappedCSV();
      const res = await ingestCSVData(mappedCSV);
      if (res.success) {
        logs.push("✓ Transaction committed successfully.");
        logs.push("🎉 Ingestion complete. Dashboard ranks and averages successfully updated!");
        setValidationLogs([...logs]);
        setParsedData([]);
        setCsvHeaders([]);
        setColumnMappings({});
        loadStats();
      } else {
        logs.push(`❌ Ingestion failed: ${res.error || 'Unknown error'}`);
        setValidationLogs([...logs]);
      }
    } catch (err) {
      console.error(err);
      logs.push(`❌ Network/Server error: ${err.message}`);
      setValidationLogs([...logs]);
    }
    setIngesting(false);
  };

  const handleRunPipeline = async () => {
    setRunningPipeline(true);
    setPipelineLogs([`[VCONNECT SYSTEM] Dispatching command trigger for background pipeline: ${selectedPipeline}...`]);

    try {
      const res = await triggerPipelineRun(selectedPipeline);
      if (res.success) {
        streamPipelineLogs(
          (log) => {
            setPipelineLogs(prev => [...prev, log]);
          },
          (status) => {
            if (status === 'complete') {
              setRunningPipeline(false);
              loadStats();
            } else if (status === 'error') {
              setPipelineLogs(prev => [...prev, '❌ Lost connection to background streaming log feed.']);
              setRunningPipeline(false);
            }
          }
        );
      } else {
        setPipelineLogs(prev => [...prev, `❌ Remote execution failed: ${res.error}`]);
        setRunningPipeline(false);
      }
    } catch (err) {
      setPipelineLogs(prev => [...prev, `❌ Error: ${err.message}`]);
      setRunningPipeline(false);
    }
  };

  return (
    <div className="dashboard animate-in">
      <header className="dashboard-header">
        <div>
          <h2 className="page-title">Administrative Data Portal</h2>
          <p className="page-subtitle">Manage SQLite engine connection health, override development priorities, and ingest CSV updates</p>
        </div>
      </header>

      {/* Database status row */}
      {loadingStats ? (
        <div className="glass-panel" style={{ padding: '24px', textAlign: 'center', marginBottom: '24px' }}>
          <div className="spinner" style={{ margin: '0 auto 10px auto' }} />
          <span>Retrieving SQLite database metadata...</span>
        </div>
      ) : stats ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid var(--accent)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase' }}>Database Size</span>
            <strong style={{ fontSize: '20px', color: '#fff', display: 'block', margin: '4px 0' }}>{stats.databaseSizeMB} MB</strong>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>File: {stats.dbPath.split(/[\\/]/).pop()}</span>
          </div>

          <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid #06b6d4' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase' }}>Total Villages</span>
            <strong style={{ fontSize: '20px', color: '#fff', display: 'block', margin: '4px 0' }}>{stats.villageCount?.toLocaleString()}</strong>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Mapped rows in villages</span>
          </div>

          <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid var(--success)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase' }}>State / District Coverage</span>
            <strong style={{ fontSize: '20px', color: '#fff', display: 'block', margin: '4px 0' }}>{stats.stateCount} States / {stats.districtCount} Districts</strong>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Comprehensive index coverage</span>
          </div>

          <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid #8b5cf6' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase' }}>Engine Writes Mode</span>
            <strong style={{ fontSize: '20px', color: 'var(--success)', display: 'block', margin: '4px 0' }}>READ/WRITE</strong>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>SQLite connection writable</span>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '16px', color: 'var(--danger)', marginBottom: '24px' }}>
          ⚠️ Could not connect to SQLite database. Make sure Express server is running and writable.
        </div>
      )}

      {/* Main split dashboard admin controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        
        {/* Priority & Budget Override (Left) */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 className="panel-title" style={{ marginBottom: '6px' }}>⚡ Live Database Overrides</h3>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
            Search a village to directly override recommended budget and priority flags in the database.
          </p>

          <div style={{ position: 'relative', marginBottom: '18px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Search Village</label>
            <input
              type="text"
              className="search-input"
              style={{ width: '100%' }}
              placeholder="Search village name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              id="admin-search-village"
            />
            
            {searchResults.length > 0 && (
              <div className="glass-panel" style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                maxHeight: '180px', overflowY: 'auto', zIndex: 1000,
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
          </div>

          {selectedVillage ? (
            <form onSubmit={handleSaveOverride} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}>
                Village Selected: <strong>{selectedVillage.village_name}</strong><br/>
                District: <strong>{selectedVillage.district}</strong> | Current Rank: <strong>#{selectedVillage.overall_rank}</strong>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Recommended Budget (INR)</label>
                <input
                  type="text"
                  className="search-input"
                  style={{ width: '100%' }}
                  value={newBudget}
                  onChange={e => setNewBudget(e.target.value.replace(/\D/g, ''))}
                  id="admin-budget-input"
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Priority Level</label>
                <select
                  className="filter-select"
                  style={{ width: '100%' }}
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value)}
                  id="admin-priority-select"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              {overrideMessage && (
                <div style={{
                  padding: '8px 12px', borderRadius: '4px', fontSize: '12px',
                  background: overrideMessage.type === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                  border: `1px solid ${overrideMessage.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                  color: overrideMessage.type === 'success' ? 'var(--success)' : 'var(--danger)'
                }}>
                  {overrideMessage.text}
                </div>
              )}

              <button
                type="submit"
                className="btn btn--primary"
                disabled={overrideLoading}
                id="admin-save-btn"
              >
                {overrideLoading ? 'Updating SQLite records...' : '💾 Save Overrides'}
              </button>
            </form>
          ) : (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: '8px', fontSize: '12px' }}>
              Select a village from search above to edit.
            </div>
          )}
        </div>

        {/* CSV Ingestion Sandbox (Right) */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h3 className="panel-title" style={{ marginBottom: '6px' }}>📂 Data Import & Validation Dashboard</h3>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
            Upload a CSV containing village development metrics. Auto-map headers and preview values before appending.
          </p>

          <form onSubmit={handleValidateCSV} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0 }}>
            {parsedData.length === 0 ? (
              // Drag and Drop Zone
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file && file.name.endsWith('.csv')) {
                    const reader = new FileReader();
                    reader.onload = (evt) => parseCSVContent(evt.target.result);
                    reader.readAsText(file);
                  }
                }}
                onClick={() => document.getElementById('admin-csv-file-input').click()}
                style={{
                  flex: 1,
                  minHeight: '180px',
                  border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                  background: dragOver ? 'rgba(99,102,241,0.05)' : 'rgba(0,0,0,0.2)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: '20px',
                  textAlign: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <span style={{ fontSize: '32px', marginBottom: '8px' }}>📂</span>
                <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>
                  Drag & Drop CSV File here
                </strong>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  or click to select from your device
                </span>
                <input
                  type="file"
                  id="admin-csv-file-input"
                  accept=".csv"
                  onChange={e => {
                    const file = e.target.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (evt) => parseCSVContent(evt.target.result);
                      reader.readAsText(file);
                    }
                  }}
                  style={{ display: 'none' }}
                />
              </div>
            ) : (
              // Mapping & Preview Dashboard View
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', maxHeight: '420px', paddingRight: '4px' }} className="custom-scrollbar">
                
                {/* Column Mappings Section */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                      1. Schema Mapping
                    </h4>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        setParsedData([]);
                        setCsvHeaders([]);
                        setColumnMappings({});
                        setValidationLogs([]);
                      }}
                      style={{ padding: '2px 8px', fontSize: '10px', height: '22px' }}
                    >
                      Clear File
                    </button>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    {csvHeaders.map(h => (
                      <div key={h} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#fff', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h}>
                          {h}
                        </span>
                        <select
                          className="filter-select"
                          style={{ padding: '4px 6px', fontSize: '11px', width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: '#fff', height: '26px' }}
                          value={columnMappings[h] || 'skip'}
                          onChange={e => setColumnMappings(prev => ({ ...prev, [h]: e.target.value }))}
                        >
                          <option value="skip">⚠️ [Skip Column]</option>
                          <option value="village_id">🔑 village_id (Primary Key)</option>
                          {VALID_METRICS.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Data Preview Table */}
                <div>
                  <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold', marginBottom: '8px' }}>
                    2. Data Preview (First 5 Rows)
                  </h4>
                  <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                          {csvHeaders.map(h => {
                            const mapped = columnMappings[h];
                            return (
                              <th key={h} style={{ padding: '6px 8px', color: mapped === 'skip' ? 'var(--text-muted)' : mapped === 'village_id' ? '#10b981' : 'var(--accent)', borderRight: '1px solid rgba(255,255,255,0.02)' }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}>{h}</div>
                                <div style={{ fontSize: '8px', fontWeight: 'normal', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}>
                                  {mapped === 'skip' ? 'skipped' : mapped}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.slice(0, 5).map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                            {csvHeaders.map(h => (
                              <td key={h} style={{ padding: '6px 8px', color: columnMappings[h] === 'skip' ? 'var(--text-muted)' : 'var(--text-primary)', borderRight: '1px solid rgba(255,255,255,0.02)' }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}>{row[h]}</div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {parsedData.length > 0 && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  className="btn btn--ghost"
                  style={{ flex: 1 }}
                  disabled={validating || ingesting}
                  id="admin-validate-btn"
                >
                  {validating ? 'Validating schema...' : '🔍 Validate CSV Layout'}
                </button>

                {validationLogs.some(log => log.includes("SUCCESS") || log.includes("successfully")) && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    style={{ flex: 1 }}
                    onClick={handleIngestCSV}
                    disabled={ingesting}
                    id="admin-ingest-btn"
                  >
                    {ingesting ? 'Saving transaction...' : '🚀 Append to DB'}
                  </button>
                )}
              </div>
            )}
          </form>

          {/* Validation Logs console */}
          {validationLogs.length > 0 && (
            <div style={{
              background: '#070a13', border: '1px solid var(--border)', borderRadius: '6px',
              padding: '12px', marginTop: '16px', fontSize: '10px', fontFamily: 'monospace',
              maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px'
            }} className="console-log custom-scrollbar">
              {validationLogs.map((log, idx) => (
                <span
                  key={idx}
                  style={{
                    color: log.includes("❌") ? 'var(--danger)' : log.includes("✅") || log.includes("✓") || log.includes("SUCCESS") ? 'var(--success)' : '#e2e8f0'
                  }}
                >
                  {log}
                </span>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Real-time Data Integrity Audit Dashboard */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 className="panel-title" style={{ marginBottom: '4px' }}>🔍 Data Integrity Audit & Anomaly Detection</h3>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Real-time audit scanning database entries for coordinate outliers, demographic deficits, and metric range inconsistencies.
            </p>
          </div>
          <button
            onClick={loadQualityReport}
            disabled={loadingQuality}
            className="btn btn--ghost"
            style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}
            id="run-audit-btn"
          >
            {loadingQuality ? 'Auditing...' : '🔄 Run Audit'}
          </button>
        </div>

        {loadingQuality ? (
          <div style={{ padding: '40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <div className="spinner" />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Scanning SQL tables for anomaly indices...</span>
          </div>
        ) : qualityReport ? (
          <div>
            {/* Health Score Banner */}
            <div style={{
              display: 'flex', gap: '20px', alignItems: 'center', background: 'rgba(255,255,255,0.01)',
              border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '20px', flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '120px', borderRight: '1px solid var(--border)', paddingRight: '20px' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Integrity Rating</span>
                <strong style={{
                  fontSize: '26px',
                  color: qualityReport.stats.healthScore >= 95 ? 'var(--success)' : qualityReport.stats.healthScore >= 85 ? '#f59e0b' : 'var(--danger)',
                  margin: '4px 0 0 0'
                }}>
                  {qualityReport.stats.healthScore}%
                </strong>
              </div>

              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div style={{ cursor: 'pointer' }} onClick={() => setQualityTab('coordinates')}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>COORDINATES ERRORS</span>
                  <strong style={{ display: 'block', fontSize: '14px', marginTop: '3px', color: qualityReport.stats.coordAnomalyCount > 0 ? '#ef4444' : 'var(--text-primary)' }}>
                    {qualityReport.stats.coordAnomalyCount} flagged
                  </strong>
                </div>
                <div style={{ cursor: 'pointer' }} onClick={() => setQualityTab('demographics')}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>DEMOGRAPHIC ERRORS</span>
                  <strong style={{ display: 'block', fontSize: '14px', marginTop: '3px', color: qualityReport.stats.demoAnomalyCount > 0 ? '#ef4444' : 'var(--text-primary)' }}>
                    {qualityReport.stats.demoAnomalyCount} flagged
                  </strong>
                </div>
                <div style={{ cursor: 'pointer' }} onClick={() => setQualityTab('percentages')}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>RANGE INCONSISTENCIES</span>
                  <strong style={{ display: 'block', fontSize: '14px', marginTop: '3px', color: qualityReport.stats.pctAnomalyCount > 0 ? '#ef4444' : 'var(--text-primary)' }}>
                    {qualityReport.stats.pctAnomalyCount} flagged
                  </strong>
                </div>
                <div style={{ cursor: 'pointer' }} onClick={() => setQualityTab('hospitals')}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>ISOLATION OUTLIERS</span>
                  <strong style={{ display: 'block', fontSize: '14px', marginTop: '3px', color: qualityReport.stats.hospAnomalyCount > 0 ? '#f59e0b' : 'var(--text-primary)' }}>
                    {qualityReport.stats.hospAnomalyCount} flagged
                  </strong>
                </div>
              </div>
            </div>

            {/* Quality detail tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '14px', overflowX: 'auto', whiteSpace: 'nowrap' }} className="no-print">
              <button
                className={`preset-btn ${qualityTab === 'summary' ? 'preset-btn--active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '11px', cursor: 'pointer' }}
                onClick={() => setQualityTab('summary')}
              >
                📋 Audit Summary
              </button>
              <button
                className={`preset-btn ${qualityTab === 'coordinates' ? 'preset-btn--active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '11px', cursor: 'pointer' }}
                onClick={() => setQualityTab('coordinates')}
              >
                🗺️ Coordinate Outliers ({qualityReport.stats.coordAnomalyCount})
              </button>
              <button
                className={`preset-btn ${qualityTab === 'demographics' ? 'preset-btn--active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '11px', cursor: 'pointer' }}
                onClick={() => setQualityTab('demographics')}
              >
                👨‍👩‍👧‍👦 Demographic Flags ({qualityReport.stats.demoAnomalyCount})
              </button>
              <button
                className={`preset-btn ${qualityTab === 'percentages' ? 'preset-btn--active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '11px', cursor: 'pointer' }}
                onClick={() => setQualityTab('percentages')}
              >
                📊 Range Flags ({qualityReport.stats.pctAnomalyCount})
              </button>
              <button
                className={`preset-btn ${qualityTab === 'hospitals' ? 'preset-btn--active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '11px', cursor: 'pointer' }}
                onClick={() => setQualityTab('hospitals')}
              >
                🏥 Proximity Flags ({qualityReport.stats.hospAnomalyCount})
              </button>
            </div>

            {/* Tab content view */}
            {qualityTab === 'summary' && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <p style={{ margin: '0 0 10px 0' }}>
                  The Data Integrity Engine executes database check constraints to identify outliers and physical impossibilities in your dataset.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginTop: '14px' }}>
                  <div style={{ padding: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                    <strong>🗺️ Coordinates boundaries check:</strong>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Checks that coordinates coordinates fall within standard limits (India: Lat 6-38, Lon 68-98). Out-of-bounds coordinates indicate placement issues.
                    </span>
                  </div>
                  <div style={{ padding: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                    <strong>👨‍👩‍👧‍👦 Demographic thresholds check:</strong>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Identifies records with zero or missing values for population or household counts, indicating incomplete surveys.
                    </span>
                  </div>
                  <div style={{ padding: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                    <strong>📊 Metric bounds check:</strong>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Scans percentage columns (water coverage, sanitation, internet penetration) to flag values exceeding 100% or falling below 0%.
                    </span>
                  </div>
                  <div style={{ padding: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                    <strong>🏥 Isolation threshold outliers check:</strong>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Flags villages where key infrastructure points (nearest hospital) indicate distance metrics exceeding 50 kilometers, denoting extreme isolation or measurement error.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {qualityTab === 'coordinates' && (
              <div>
                <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
                  First 5 villages showing coordinate positions mapped outside bounding limits:
                </p>
                {qualityReport.anomalies.coordinates.length > 0 ? (
                  <div className="table-container">
                    <table className="ranking-table" style={{ width: '100%', fontSize: '11.5px' }}>
                      <thead>
                        <tr>
                          <th>Village ID</th>
                          <th>Village Name</th>
                          <th>District, State</th>
                          <th>Latitude</th>
                          <th>Longitude</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qualityReport.anomalies.coordinates.map(v => (
                          <tr key={v.village_id} className="table-row">
                            <td>{v.village_id}</td>
                            <td><strong>{v.village_name}</strong></td>
                            <td>{v.district}, {v.state}</td>
                            <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{v.latitude?.toFixed(4) || 'NULL'}</td>
                            <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{v.longitude?.toFixed(4) || 'NULL'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--success)', border: '1px dashed var(--border)', borderRadius: '6px', fontSize: '12px' }}>
                    ✅ Excellent! No coordinate outliers detected.
                  </div>
                )}
              </div>
            )}

            {qualityTab === 'demographics' && (
              <div>
                <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
                  First 5 villages showing zero or empty values in population and household surveys:
                </p>
                {qualityReport.anomalies.demographics.length > 0 ? (
                  <div className="table-container">
                    <table className="ranking-table" style={{ width: '100%', fontSize: '11.5px' }}>
                      <thead>
                        <tr>
                          <th>Village ID</th>
                          <th>Village Name</th>
                          <th>District, State</th>
                          <th>Total Population</th>
                          <th>Households</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qualityReport.anomalies.demographics.map(v => (
                          <tr key={v.village_id} className="table-row">
                            <td>{v.village_id}</td>
                            <td><strong>{v.village_name}</strong></td>
                            <td>{v.district}, {v.state}</td>
                            <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{v.total_population?.toLocaleString() ?? 'NULL'}</td>
                            <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{v.households?.toLocaleString() ?? 'NULL'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--success)', border: '1px dashed var(--border)', borderRadius: '6px', fontSize: '12px' }}>
                    ✅ Excellent! No demographic anomalies detected.
                  </div>
                )}
              </div>
            )}

            {qualityTab === 'percentages' && (
              <div>
                <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
                  First 5 villages showing percentage indicators out of standard [0, 100]% boundaries:
                </p>
                {qualityReport.anomalies.percentages.length > 0 ? (
                  <div className="table-container">
                    <table className="ranking-table" style={{ width: '100%', fontSize: '11.5px' }}>
                      <thead>
                        <tr>
                          <th>Village ID</th>
                          <th>Village Name</th>
                          <th>Water Coverage</th>
                          <th>Sanitation</th>
                          <th>Internet Pen.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qualityReport.anomalies.percentages.map(v => (
                          <tr key={v.village_id} className="table-row">
                            <td>{v.village_id}</td>
                            <td><strong>{v.village_name}</strong></td>
                            <td style={{ color: (v.drinking_water_coverage_pct < 0 || v.drinking_water_coverage_pct > 100) ? '#ef4444' : '#cbd5e1', fontWeight: 'bold' }}>
                              {v.drinking_water_coverage_pct?.toFixed(1) || '0'}%
                            </td>
                            <td style={{ color: (v.sanitation_coverage_pct < 0 || v.sanitation_coverage_pct > 100) ? '#ef4444' : '#cbd5e1', fontWeight: 'bold' }}>
                              {v.sanitation_coverage_pct?.toFixed(1) || '0'}%
                            </td>
                            <td style={{ color: (v['internet_penetration%'] < 0 || v['internet_penetration%'] > 100) ? '#ef4444' : '#cbd5e1', fontWeight: 'bold' }}>
                              {v['internet_penetration%']?.toFixed(1) || '0'}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--success)', border: '1px dashed var(--border)', borderRadius: '6px', fontSize: '12px' }}>
                    ✅ Excellent! No indicator range errors detected.
                  </div>
                )}
              </div>
            )}

            {qualityTab === 'hospitals' && (
              <div>
                <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
                  First 5 villages with extreme hospital distance metrics (&gt; 50 km):
                </p>
                {qualityReport.anomalies.hospitalDistances.length > 0 ? (
                  <div className="table-container">
                    <table className="ranking-table" style={{ width: '100%', fontSize: '11.5px' }}>
                      <thead>
                        <tr>
                          <th>Village ID</th>
                          <th>Village Name</th>
                          <th>District, State</th>
                          <th>Hospital Distance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qualityReport.anomalies.hospitalDistances.map(v => (
                          <tr key={v.village_id} className="table-row">
                            <td>{v.village_id}</td>
                            <td><strong>{v.village_name}</strong></td>
                            <td>{v.district}, {v.state}</td>
                            <td style={{ color: '#f59e0b', fontWeight: 'bold' }}>{v.nearest_hospital_distance_km?.toFixed(1) || '0'} km</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--success)', border: '1px dashed var(--border)', borderRadius: '6px', fontSize: '12px' }}>
                    ✅ Excellent! No isolated proximity outliers detected.
                  </div>
                )}
              </div>
            )}

          </div>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            Failed to load data quality audit. Make sure API connection is active.
          </div>
        )}
      </div>

      {/* Real Script subprocess terminal console (Full Width) */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <h3 className="panel-title" style={{ marginBottom: '6px' }}>⚙️ Script Pipeline runner</h3>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Execute scraping campaigns or full SQLite database metric recalculations directly. Watch stdout outputs in real-time.
        </p>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <select 
            className="filter-select"
            style={{ width: '260px' }}
            value={selectedPipeline}
            onChange={e => setSelectedPipeline(e.target.value)}
            disabled={runningPipeline}
            id="pipeline-select"
          >
            <option value="ingest">⚡ SQLite Database Recalculator Ingestion (ingest.py)</option>
            <option value="scraper">🕷️ Playwright Google Maps Scraper (village_profile.py)</option>
          </select>

          <button 
            className="btn btn--primary"
            onClick={handleRunPipeline}
            disabled={runningPipeline}
            id="pipeline-run-btn"
            style={{ padding: '8px 20px' }}
          >
            {runningPipeline ? '⏳ Job In Progress...' : '⚡ Run Pipeline'}
          </button>
        </div>

        {/* Terminal display log */}
        {(pipelineLogs.length > 0 || runningPipeline) && (
          <div 
            ref={logTerminalRef}
            style={{
              background: '#040711',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              padding: '16px',
              fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
              fontSize: '11px',
              lineHeight: '1.5',
              maxHeight: '280px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8)'
            }} 
            className="custom-scrollbar"
          >
            {pipelineLogs.map((log, idx) => (
              <span 
                key={idx} 
                style={{ 
                  color: log.includes("❌") || log.includes("[STDERR]") ? '#ef4444' : log.includes("✓") || log.includes("[OK]") || log.includes("SUCCESS") ? '#10b981' : '#cbd5e1'
                }}
              >
                {log}
              </span>
            ))}
            {runningPipeline && (
              <span className="animate-pulse" style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                ▋ [Process active - awaiting output buffers...]
              </span>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
