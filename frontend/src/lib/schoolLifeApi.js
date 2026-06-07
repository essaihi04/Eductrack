// API client pour le module Vie scolaire (parascolaire, maternelle, objets
// perdus, sondages, signalements).
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function token() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

async function request(path, { method = 'GET', body, query } = {}) {
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
      Authorization: `Bearer ${await token()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || data.details || `HTTP ${res.status}`);
  return data;
}

// Requête multipart (upload de fichiers). `fields` = champs texte, `files` = { name: File | File[] }
async function upload(path, { method = 'POST', fields = {}, files = {} } = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) fd.append(k, v);
  });
  Object.entries(files).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((f) => f && fd.append(k, f));
    else if (v) fd.append(k, v);
  });
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}` },
    body: fd,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || data.details || `HTTP ${res.status}`);
  return data;
}

export const mediaUrl = (relUrl) => (relUrl ? `${API_URL}${relUrl}` : null);

export const schoolLifeApi = {
  // Parascolaire
  listActivities: () => request('/api/school-life/activities'),
  createActivity: ({ fields, photo }) => upload('/api/school-life/activities', { fields, files: { photo } }),
  updateActivity: (id, body) => request(`/api/school-life/activities/${id}`, { method: 'PUT', body }),
  deleteActivity: (id) => request(`/api/school-life/activities/${id}`, { method: 'DELETE' }),
  listRegistrations: (id) => request(`/api/school-life/activities/${id}/registrations`),
  register: (id, body) => request(`/api/school-life/activities/${id}/register`, { method: 'POST', body }),
  unregister: (id, studentId) => request(`/api/school-life/activities/${id}/register/${studentId}`, { method: 'DELETE' }),

  // Maternelle - cahier de vie
  listFeed: (classId) => request('/api/school-life/feed', { query: { classId } }),
  createFeedPost: ({ fields, photos }) => upload('/api/school-life/feed', { fields, files: { photos } }),
  deleteFeedPost: (id) => request(`/api/school-life/feed/${id}`, { method: 'DELETE' }),

  // Objets perdus
  listLostItems: (status) => request('/api/school-life/lost-items', { query: { status } }),
  createLostItem: ({ fields, photo }) => upload('/api/school-life/lost-items', { fields, files: { photo } }),
  updateLostItem: (id, body) => request(`/api/school-life/lost-items/${id}`, { method: 'PUT', body }),
  deleteLostItem: (id) => request(`/api/school-life/lost-items/${id}`, { method: 'DELETE' }),

  // Sondages
  listPolls: () => request('/api/school-life/polls'),
  createPoll: (body) => request('/api/school-life/polls', { method: 'POST', body }),
  votePoll: (id, optionId) => request(`/api/school-life/polls/${id}/vote`, { method: 'POST', body: { option_id: optionId } }),
  togglePoll: (id, isActive) => request(`/api/school-life/polls/${id}`, { method: 'PUT', body: { is_active: isActive } }),
  deletePoll: (id) => request(`/api/school-life/polls/${id}`, { method: 'DELETE' }),

  // Signalements
  listIssues: (status) => request('/api/school-life/issues', { query: { status } }),
  createIssue: (body) => request('/api/school-life/issues', { method: 'POST', body }),
  updateIssue: (id, body) => request(`/api/school-life/issues/${id}`, { method: 'PUT', body }),
  deleteIssue: (id) => request(`/api/school-life/issues/${id}`, { method: 'DELETE' }),

  // Élèves d'une classe (cible d'un signalement)
  listClassStudents: (classId) => request(`/api/school-life/classes/${classId}/students`),
};

// Liste des classes (pour les formulaires).
// Admin -> toutes les classes de l'école ; prof -> ses classes assignées.
export const fetchClasses = async () => {
  const auth = { headers: { Authorization: `Bearer ${await token()}` } };
  // 1) Essai endpoint admin (toutes les classes)
  try {
    const res = await fetch(`${API_URL}/api/admin/classes`, auth);
    if (res.ok) return await res.json();
  } catch {
    /* on tente le repli ci-dessous */
  }
  // 2) Repli prof : classes assignées au professeur
  try {
    const res = await fetch(`${API_URL}/api/teacher/my-classes`, auth);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : (data.classes || []);
    }
  } catch {
    /* ignore */
  }
  return [];
};
