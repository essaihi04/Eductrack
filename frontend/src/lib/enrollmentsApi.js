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
  // Recherche d'élèves dans les écoles associées (par nom et/ou par niveau)
  crossSchoolSearch: (q, level) => request('/api/enrollments/cross-school/search', { query: { q, level } }),
  // Niveaux réels présents dans les établissements associés
  crossSchoolLevels: () => request('/api/enrollments/cross-school/levels'),
  // Réinscription d'un élève (propre école = RI, école associée = déménagement NI)
  reinscribe: (payload) => request('/api/enrollments/reinscribe', { method: 'POST', body: payload }),
  // Annule la réinscription d'un élève : supprime l'inscription de l'année et
  // remet l'élève dans sa classe/niveau précédents (état initial)
  undoReinscribe: (studentId, academicYear) => request('/api/enrollments/reinscribe/undo', { method: 'POST', body: { student_id: studentId, academic_year: academicYear } }),
  // Réinscription en masse d'un niveau entier depuis un établissement associé
  reinscribeLevel: (payload) => request('/api/enrollments/cross-school/reinscribe-level', { method: 'POST', body: payload }),
};
