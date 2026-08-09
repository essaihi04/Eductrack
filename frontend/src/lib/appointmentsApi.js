import { supabase } from './supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, { method = 'GET', body } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const appointmentsApi = {
  /** Liste adaptée au rôle connecté (parent / professeur / staff). */
  list: (status) => request(`/api/appointments${status ? `?status=${status}` : ''}`),
  get: (id) => request(`/api/appointments/${id}`),

  /** Parent : professeurs de la classe de l'enfant. */
  classTeachers: (studentId) => request(`/api/appointments/teachers?student_id=${studentId}`),
  /** Parent : nouvelle demande. */
  create: (body) => request('/api/appointments', { method: 'POST', body }),

  /** Professeur : proposer un créneau (validé ensuite par le staff). */
  propose: (id, body) => request(`/api/appointments/${id}/propose`, { method: 'PATCH', body }),
  /** Professeur : se déclarer indisponible — le staff reprend la main. */
  unavailable: (id, body) => request(`/api/appointments/${id}/unavailable`, { method: 'PATCH', body }),

  /** Staff : accorder le rendez-vous (le parent est notifié automatiquement). */
  confirm: (id, body) => request(`/api/appointments/${id}/confirm`, { method: 'PATCH', body }),
  decline: (id, body) => request(`/api/appointments/${id}/decline`, { method: 'PATCH', body }),
  cancel: (id, body) => request(`/api/appointments/${id}/cancel`, { method: 'PATCH', body }),
};

// ── Présentation partagée par les trois pages ──────────────────────────────

export const APPOINTMENT_STATUS = {
  en_attente: { label: 'En attente', cls: 'bg-amber-100 text-amber-700' },
  propose: { label: 'Créneau proposé', cls: 'bg-blue-100 text-blue-700' },
  confirme: { label: 'Confirmé', cls: 'bg-emerald-100 text-emerald-700' },
  refuse: { label: 'Refusé', cls: 'bg-red-100 text-red-700' },
  annule: { label: 'Annulé', cls: 'bg-gray-100 text-gray-600' },
  termine: { label: 'Terminé', cls: 'bg-gray-100 text-gray-600' },
};

/**
 * « jeudi 4 septembre 2026 à 10:30 ».
 * `locale` / `at` permettent aux pages traduites (arabe) de rendre la même
 * phrase dans leur langue sans dupliquer le formatage.
 */
export function formatSlot(iso, { locale = 'fr-FR', at = 'à' } = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} ${at} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
}

/** ISO → valeur pour <input type="datetime-local"> (heure locale). */
export function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const personName = (p) => `${p?.first_name || ''} ${p?.last_name || ''}`.trim();
