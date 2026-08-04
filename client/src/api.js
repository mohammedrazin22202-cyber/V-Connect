const API_BASE = 'http://localhost:3001/api';

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
