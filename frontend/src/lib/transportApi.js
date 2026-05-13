// API helper pour le module Transport
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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || data.details || `HTTP ${res.status}`);
  return data;
}

export const transportApi = {
  // Bus
  listBuses: () => request('/api/transport/buses'),
  createBus: (data) => request('/api/transport/buses', { method: 'POST', body: data }),
  updateBus: (id, data) => request(`/api/transport/buses/${id}`, { method: 'PUT', body: data }),
  deleteBus: (id) => request(`/api/transport/buses/${id}`, { method: 'DELETE' }),
  // Assignations
  listBusStudents: (busId) => request(`/api/transport/buses/${busId}/students`),
  assignStudent: (busId, body) => request(`/api/transport/buses/${busId}/students`, { method: 'POST', body }),
  updateAssignment: (id, body) => request(`/api/transport/assignments/${id}`, { method: 'PUT', body }),
  reorderAssignments: (busId, items) => request(`/api/transport/buses/${busId}/assignments/order`, { method: 'PUT', body: { items } }),
  removeAssignment: (id) => request(`/api/transport/assignments/${id}`, { method: 'DELETE' }),
  updateStudentHome: (studentId, body) => request(`/api/transport/students/${studentId}/home`, { method: 'PUT', body }),
  listAvailableStudents: () => request('/api/transport/students/available'),
  // Trajets
  todayTrips: () => request('/api/transport/trips/today'),
  startTrip: (body) => request('/api/transport/trips/start', { method: 'POST', body }),
  endTrip: (id, body) => request(`/api/transport/trips/${id}/end`, { method: 'POST', body }),
  pushPosition: (id, body) => request(`/api/transport/trips/${id}/position`, { method: 'POST', body }),
  getPositions: (id) => request(`/api/transport/trips/${id}/positions`),
  pushEvent: (tripId, studentId, body) => request(`/api/transport/trips/${tripId}/students/${studentId}/event`, { method: 'POST', body }),
  getEvents: (tripId) => request(`/api/transport/trips/${tripId}/events`),
  // Live
  liveBuses: () => request('/api/transport/live'),
  parentLive: () => request('/api/transport/parent/live'),
  // Historique
  history: (params) => request('/api/transport/history', { query: params }),
  summary: () => request('/api/transport/summary'),
  statistics: (period = 'week') => request('/api/transport/statistics', { query: { period } }),
  // École (localisation GPS — départ et arrivée de chaque tournée)
  getSchool: () => request('/api/transport/school'),
  updateSchool: (body) => request('/api/transport/school', { method: 'PUT', body }),
};

export const transportManagersApi = {
  list: () => request('/api/admin/transport-managers'),
  create: (data) => request('/api/admin/transport-managers', { method: 'POST', body: data }),
  update: (id, data) => request(`/api/admin/transport-managers/${id}`, { method: 'PUT', body: data }),
  resetPassword: (id, newPassword) => request(`/api/admin/transport-managers/${id}/reset-password`, { method: 'POST', body: { newPassword } }),
  delete: (id) => request(`/api/admin/transport-managers/${id}`, { method: 'DELETE' }),
};

export const driversApi = {
  list: () => request('/api/admin/drivers'),
  create: (data) => request('/api/admin/drivers', { method: 'POST', body: data }),
  update: (id, data) => request(`/api/admin/drivers/${id}`, { method: 'PUT', body: data }),
  resetPassword: (id, newPassword) => request(`/api/admin/drivers/${id}/reset-password`, { method: 'POST', body: { newPassword } }),
  delete: (id) => request(`/api/admin/drivers/${id}`, { method: 'DELETE' }),
};

export const pushApi = {
  vapidKey: () => request('/api/push/vapid-public-key'),
  subscribe: (subscription) => request('/api/push/subscribe', {
    method: 'POST',
    body: {
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys,
      userAgent: navigator.userAgent
    }
  }),
  unsubscribe: (endpoint) => request('/api/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  test: () => request('/api/push/test', { method: 'POST' }),
};
