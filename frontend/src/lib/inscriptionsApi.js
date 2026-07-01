import { supabase } from './supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

async function request(path, { method = 'GET', body, query } = {}) {
  const token = await getToken();
  let url = `${apiUrl}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`);
  return data;
}

// Client du sous-ensemble /api/inscriptions accessible au module finance
// (responsable financier) — cf. backend/src/routes/inscriptions.routes.js.
export const inscriptionsApi = {
  listClasses: (academicYear) => request('/api/inscriptions/classes', { query: { academic_year: academicYear } }),
  createStudent: (payload) => request('/api/inscriptions/students', { method: 'POST', body: payload }),
};
