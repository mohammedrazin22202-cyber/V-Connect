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
  const res = await fetch(`${API_BASE}/rankings?${query}`);
  return res.json();
}

export async function fetchVillage(id) {
  const res = await fetch(`${API_BASE}/villages/${id}`);
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
