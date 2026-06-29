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

export const enrollmentsApi = {
  listSchoolYears: () => request('/api/enrollments/school-years'),
  getFunnel: (academicYear) => request('/api/enrollments/funnel', { query: { academic_year: academicYear } }),
  list: (academicYear, classId) => request('/api/enrollments', { query: { academic_year: academicYear, class_id: classId } }),
  reinscription: (payload) => request('/api/enrollments/reinscription', { method: 'POST', body: payload }),
  autoReinscription: (fromYear, options) => request('/api/enrollments/auto-reinscription', { method: 'POST', body: { from_year: fromYear, options } }),
  reset: (year) => request('/api/enrollments/reset', { method: 'POST', body: { year } }),
  // Réinscription inter-établissements (compte multi-écoles)
  crossSchoolSearch: (q) => request('/api/enrollments/cross-school/search', { query: { q } }),
  crossSchoolTransfer: (payload) => request('/api/enrollments/cross-school/transfer', { method: 'POST', body: payload }),
};
