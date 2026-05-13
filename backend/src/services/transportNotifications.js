// Service de notifications transport (WhatsApp + Push web)
import { supabaseAdmin } from '../config/supabase.js';
import { getSchoolSessionApiKey } from './whatsappChatbot.js';
import { sendPushToUsers } from './webPush.js';

const WASENDER_BASE = process.env.WASENDER_BASE_URL || 'https://wasenderapi.com';

async function sendWhatsApp(phone, text, schoolId) {
  if (!phone) return { ok: false, reason: 'no_phone' };
  try {
    const sessionApiKey = await getSchoolSessionApiKey(schoolId);
    if (!sessionApiKey) return { ok: false, reason: 'no_session' };
    const res = await fetch(`${WASENDER_BASE}/api/send-message`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sessionApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, text })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (e) {
    console.error('[TransportNotif] WA send error:', e.message);
    return { ok: false, reason: e.message };
  }
}

// Récupère les infos élève + parents (id + phone) pour notification
async function getStudentNotificationContext(studentId) {
  const { data: student } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, school_id, class_id')
    .eq('id', studentId).single();
  if (!student) return null;

  const { data: links } = await supabaseAdmin
    .from('parent_students').select('parent_id').eq('student_id', studentId);
  const parentIds = (links || []).map(l => l.parent_id);

  let parents = [];
  if (parentIds.length > 0) {
    const { data: ps } = await supabaseAdmin
      .from('profiles')
      .select('id, phone, first_name, last_name')
      .in('id', parentIds);
    parents = ps || [];
  }
  return { student, parents };
}

function fmtTime(date = new Date()) {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// 🚌 Notif "élève monté dans le bus"
export async function notifyBoarded(studentId, busId) {
  const ctx = await getStudentNotificationContext(studentId);
  if (!ctx) return;
  const { student, parents } = ctx;
  const { data: bus } = await supabaseAdmin
    .from('buses').select('plate_number, model').eq('id', busId).single();
  const name = `${student.first_name} ${student.last_name}`;
  const plate = bus?.plate_number || '—';
  const text = `🚌 *Transport*\n${name} est monté(e) dans le bus *${plate}* à ${fmtTime()}.\nNous vous tiendrons informé à l'arrivée.`;

  for (const p of parents) {
    if (p.phone) sendWhatsApp(p.phone, text, student.school_id);
  }
  if (parents.length > 0) {
    await sendPushToUsers(parents.map(p => p.id), {
      title: `🚌 ${name} est monté(e) dans le bus`,
      body: `Bus ${plate} • ${fmtTime()}`,
      url: '/parent/transport',
      tag: `transport-boarded-${studentId}`
    });
  }
}

// ✅ Notif "élève déposé"
export async function notifyDropped(studentId, busId) {
  const ctx = await getStudentNotificationContext(studentId);
  if (!ctx) return;
  const { student, parents } = ctx;
  const name = `${student.first_name} ${student.last_name}`;
  const text = `✅ *Transport*\n${name} a été déposé(e) à destination à ${fmtTime()}.\nBonne journée !`;

  for (const p of parents) {
    if (p.phone) sendWhatsApp(p.phone, text, student.school_id);
  }
  if (parents.length > 0) {
    await sendPushToUsers(parents.map(p => p.id), {
      title: `✅ ${name} est arrivé(e)`,
      body: `Déposé(e) à ${fmtTime()}`,
      url: '/parent/transport',
      tag: `transport-dropped-${studentId}`
    });
  }
}

// ⏰ Notif "le bus approche dans X minutes"
export async function notifyApproaching(studentId, etaMin) {
  const ctx = await getStudentNotificationContext(studentId);
  if (!ctx) return;
  const { student, parents } = ctx;
  const name = `${student.first_name} ${student.last_name}`;
  const text = `⏰ *Transport*\nLe bus arrive dans environ ${etaMin} min pour récupérer ${name}.\nMerci de préparer l'élève.`;

  for (const p of parents) {
    if (p.phone) sendWhatsApp(p.phone, text, student.school_id);
  }
  if (parents.length > 0) {
    await sendPushToUsers(parents.map(p => p.id), {
      title: `⏰ Bus à ${etaMin} min`,
      body: `Préparez ${name}, le bus approche.`,
      url: '/parent/transport',
      tag: `transport-eta-${studentId}`
    });
  }
}

// ❌ Notif absence enregistrée par chauffeur
export async function notifyAbsent(studentId, note = '') {
  const ctx = await getStudentNotificationContext(studentId);
  if (!ctx) return;
  const { student, parents } = ctx;
  const name = `${student.first_name} ${student.last_name}`;
  const extra = note ? `\nNote : ${note}` : '';
  const text = `⚠️ *Transport*\n${name} a été marqué(e) absent(e) par le chauffeur à ${fmtTime()}.${extra}\nMerci de nous confirmer.`;

  for (const p of parents) {
    if (p.phone) sendWhatsApp(p.phone, text, student.school_id);
  }
  if (parents.length > 0) {
    await sendPushToUsers(parents.map(p => p.id), {
      title: `⚠️ ${name} absent(e) du bus`,
      body: `Signalé à ${fmtTime()}`,
      url: '/parent/transport',
      tag: `transport-absent-${studentId}`
    });
  }
}

// 🚀 Notif "tournée démarrée" à tous les parents du bus
export async function notifyTripStarted(tripId) {
  const { data: trip } = await supabaseAdmin
    .from('bus_trips').select('id, bus_id, school_id, direction').eq('id', tripId).single();
  if (!trip) return;
  const { data: bus } = await supabaseAdmin.from('buses').select('plate_number').eq('id', trip.bus_id).single();
  const { data: assigns } = await supabaseAdmin
    .from('bus_assignments').select('student_id').eq('bus_id', trip.bus_id).eq('active', true);
  const studentIds = (assigns || []).map(a => a.student_id);
  if (studentIds.length === 0) return;
  const { data: links } = await supabaseAdmin
    .from('parent_students').select('parent_id, student_id').in('student_id', studentIds);
  const parentIds = [...new Set((links || []).map(l => l.parent_id))];
  if (parentIds.length === 0) return;

  const directionLabel = trip.direction === 'morning_pickup' ? 'Ramassage du matin' : 'Retour à la maison';
  const plate = bus?.plate_number || '—';
  const text = `🚀 *Transport*\n${directionLabel} démarré.\nBus *${plate}* en route. Suivez en direct dans l'application.`;

  // WhatsApp aux parents
  const { data: parents } = await supabaseAdmin
    .from('profiles').select('id, phone').in('id', parentIds);
  for (const p of parents || []) {
    if (p.phone) sendWhatsApp(p.phone, text, trip.school_id);
  }

  // Push
  await sendPushToUsers(parentIds, {
    title: `🚀 Bus ${plate} en route`,
    body: directionLabel,
    url: '/parent/transport',
    tag: `transport-start-${tripId}`
  });
}
