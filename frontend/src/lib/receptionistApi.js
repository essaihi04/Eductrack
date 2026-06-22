import { supabase } from './supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

async function request(path, { method = 'GET', body } = {}) {
  const token = await getToken();
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`);
  return data;
}

export const receptionistApi = {
  list: () => request('/api/admin/receptionists'),
  create: (data) => request('/api/admin/receptionists', { method: 'POST', body: data }),
  update: (id, data) => request(`/api/admin/receptionists/${id}`, { method: 'PUT', body: data }),
  remove: (id) => request(`/api/admin/receptionists/${id}`, { method: 'DELETE' }),
};
