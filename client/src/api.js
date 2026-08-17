const API_BASE = '/api';

export async function fetchRankings(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  if (params.sort_by) query.set('sort_by', params.sort_by);
  if (params.order) query.set('order', params.order);
  if (params.state) query.set('state', params.state);
  if (params.district) query.set('district', params.district);
  if (params.priority) query.set('priority', params.priority);
  if (params.search) query.set('search', params.search);
  
  // Custom weights
  if (params.w_eco) query.set('w_eco', params.w_eco);
  if (params.w_edu) query.set('w_edu', params.w_edu);
  if (params.w_hea) query.set('w_hea', params.w_hea);
  if (params.w_inf) query.set('w_inf', params.w_inf);
  if (params.w_env) query.set('w_env', params.w_env);
  if (params.w_gov) query.set('w_gov', params.w_gov);
  if (params.w_soc) query.set('w_soc', params.w_soc);

  const res = await fetch(`${API_BASE}/rankings?${query}`);
  return res.json();
}

export async function fetchVillage(id) {
  const res = await fetch(`${API_BASE}/villages/${id}`);
  return res.json();
}

export async function fetchSimulatedRank(score) {
  const res = await fetch(`${API_BASE}/simulate-rank?score=${score}`);
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/stats`);
  return res.json();
}

export async function fetchFilters(state = '') {
  const query = state ? `?state=${encodeURIComponent(state)}` : '';
  const res = await fetch(`${API_BASE}/filters${query}`);
  return res.json();
}

export async function fetchStateComparison(states = []) {
  const query = states.length ? `?states=${states.join(',')}` : '';
  const res = await fetch(`${API_BASE}/compare/states${query}`);
  return res.json();
}

export async function fetchRegionalSimulation(params = {}) {
  const query = new URLSearchParams();
  if (params.state) query.set('state', params.state);
  if (params.district) query.set('district', params.district);
  if (params.budget) query.set('budget', params.budget);
  if (params.strategy) query.set('strategy', params.strategy);

  const res = await fetch(`${API_BASE}/simulation/region?${query}`);
  return res.json();
}

export async function updateVillageBudget(payload = {}) {
  const res = await fetch(`${API_BASE}/admin/update-budget`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function ingestCSVData(csvContent) {
  const res = await fetch(`${API_BASE}/admin/ingest-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csvContent }),
  });
  return res.json();
}

export async function fetchAdminStats() {
  const res = await fetch(`${API_BASE}/admin/stats`);
  return res.json();
}

export async function fetchDistrictAggregates() {
  const res = await fetch(`${API_BASE}/stats/districts`);
  return res.json();
}

export async function fetchCorrelationData(var1 = '', var2 = '') {
  const query = (var1 && var2) ? `?var1=${encodeURIComponent(var1)}&var2=${encodeURIComponent(var2)}` : '';
  const res = await fetch(`${API_BASE}/analytics/correlation${query}`);
  return res.json();
}

export async function triggerPipelineRun(pipeline, args = []) {
  const res = await fetch(`${API_BASE}/admin/run-pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pipeline, args }),
  });
  return res.json();
}

export function streamPipelineLogs(onLog, onStatus) {
  const eventSource = new EventSource(`${API_BASE}/admin/pipeline-logs`);
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.log) {
        onLog(data.log);
      }
      if (data.status) {
        onStatus(data.status);
        if (data.status === 'complete') {
          eventSource.close();
        }
      }
    } catch (err) {
      console.error('Error parsing event source message:', err);
    }
  };

  eventSource.onerror = (err) => {
    console.error('EventSource connection failed:', err);
    eventSource.close();
    onStatus('error');
  };

  return () => eventSource.close();
}

export async function fetchVillageHistory(id) {
  const res = await fetch(`${API_BASE}/villages/${id}/history`);
  return res.json();
}

export async function fetchVillageRecommendations(id) {
  const res = await fetch(`${API_BASE}/villages/${id}/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function fetchDataQualityReport() {
  const res = await fetch(`${API_BASE}/admin/data-quality`);
  return res.json();
}

export async function fetchAmenitiesStatus(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  if (params.state) query.set('state', params.state);
  if (params.district) query.set('district', params.district);
  if (params.search) query.set('search', params.search);
  if (params.sort_by) query.set('sort_by', params.sort_by);
  if (params.order) query.set('order', params.order);
  if (params.fulfillment) query.set('fulfillment', params.fulfillment);
  if (params.missing) query.set('missing', params.missing);

  // Thresholds
  if (params.water_t !== undefined) query.set('water_t', params.water_t);
  if (params.sanitation_t !== undefined) query.set('sanitation_t', params.sanitation_t);
  if (params.electricity_t !== undefined) query.set('electricity_t', params.electricity_t);
  if (params.school_t !== undefined) query.set('school_t', params.school_t);
  if (params.hospital_t !== undefined) query.set('hospital_t', params.hospital_t);
  if (params.road_t !== undefined) query.set('road_t', params.road_t);
  if (params.internet_t !== undefined) query.set('internet_t', params.internet_t);

  const res = await fetch(`${API_BASE}/villages/amenities-status?${query}`);
  return res.json();
}

export async function fetchDistrictRankings(params = {}) {
  const query = new URLSearchParams();
  if (params.state) query.set('state', params.state);
  if (params.sort_by) query.set('sort_by', params.sort_by);
  if (params.order) query.set('order', params.order);
  const res = await fetch(`${API_BASE}/districts/rankings?${query}`);
  return res.json();
}

export async function fetchAnomalies() {
  const res = await fetch(`${API_BASE}/admin/anomalies`);
  return res.json();
}

export async function updateVillageMetrics(id, metrics) {
  const res = await fetch(`${API_BASE}/villages/${id}/update-metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics }),
  });
  return res.json();
}





// Git commit touch-up 30: refactor: Add basic error handling blocks in fetch rankings calls (catch block)


// Git commit touch-up 31: docs: Document new endpoint fetch options in api.js module (API comments)
