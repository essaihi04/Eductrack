// API pour la gestion des responsables pédagogiques (pedagogical_manager)
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, { method = 'GET', body, query } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const url = new URL(`${API_URL}${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || data.details || `HTTP ${res.status}`);
  return data;
}

export const pedagogicalManagersApi = {
  list: () => request('/api/admin/pedagogical-managers'),
  create: (data) => request('/api/admin/pedagogical-managers', { method: 'POST', body: data }),
  update: (id, data) => request(`/api/admin/pedagogical-managers/${id}`, { method: 'PUT', body: data }),
  resetPassword: (id, newPassword) => request(`/api/admin/pedagogical-managers/${id}/reset-password`, { method: 'POST', body: { newPassword } }),
  delete: (id) => request(`/api/admin/pedagogical-managers/${id}`, { method: 'DELETE' }),
};
