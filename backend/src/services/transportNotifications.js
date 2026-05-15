// Service de notifications transport (WhatsApp + Push web)
// Toutes les notifications WA sont :
//  - taggées category='transport' (visibles dans l'inbox du transport_manager)
//  - loggées dans whatsapp_messages + whatsapp_message_recipients
//  - envoyées au numéro WhatsApp officiel du parent (parent_contacts.phone_e164),
//    avec fallback sur profiles.phone si non configuré.
import { supabaseAdmin } from '../config/supabase.js';
import { getSchoolSessionApiKey } from './whatsappChatbot.js';
import { sendPushToUsers } from './webPush.js';

const WASENDER_BASE = process.env.WASENDER_BASE_URL || 'https://wasenderapi.com';

// Envoi brut Wasender (utilisé après log DB)
async function rawSend(phone, text, sessionApiKey) {
  try {
    const res = await fetch(`${WASENDER_BASE}/api/send-message`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sessionApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, text })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Récupère le numéro WhatsApp préféré d'un parent : parent_contacts > profiles.phone
async function getParentWhatsAppPhone(parentId) {
  const { data: contact } = await supabaseAdmin
    .from('parent_contacts')
    .select('phone_e164')
    .eq('parent_id', parentId)
    .eq('channel', 'whatsapp')
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (contact?.phone_e164) return contact.phone_e164;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('phone')
    .eq('id', parentId)
    .maybeSingle();
  return profile?.phone || null;
}

/**
 * Envoie un message WhatsApp "transport" à une liste de parents en passant par
 * la pipeline unifiée (whatsapp_messages + whatsapp_message_recipients).
 * @param {object} opts
 * @param {string} opts.schoolId
 * @param {string|null} opts.senderId - profile.id à mettre dans sent_by (driver, manager, ou null)
 * @param {Array<{parent_id:string, phone:string}>} opts.recipients - parents à notifier
 * @param {string} opts.text - corps du message
 * @param {object} [opts.recipientFilter] - infos contextuelles stockées dans recipient_filter
 */
async function sendTransportWhatsApp({ schoolId, senderId, recipients, text, recipientFilter = {} }) {
  if (!recipients || recipients.length === 0) return { ok: false, reason: 'no_recipients' };
  const validRecipients = recipients.filter(r => r.phone);
  if (validRecipients.length === 0) return { ok: false, reason: 'no_phones' };

  const sessionApiKey = await getSchoolSessionApiKey(schoolId);
  if (!sessionApiKey) {
    console.warn('[TransportNotif] Pas de session WhatsApp pour school', schoolId);
    return { ok: false, reason: 'no_session' };
  }

  // 1) Log message global
  const { data: msgLog, error: logErr } = await supabaseAdmin
    .from('whatsapp_messages')
    .insert({
      school_id: schoolId,
      sent_by: senderId || null,
      message_type: 'text',
      content: text,
      recipient_filter: { type: 'transport_auto', ...recipientFilter },
      total_recipients: validRecipients.length,
      status: 'sending',
      category: 'transport'
    })
    .select('id')
    .single();

  if (logErr) {
    console.error('[TransportNotif] log error:', logErr.message);
    return { ok: false, reason: 'log_error' };
  }

  // 2) Insérer les destinataires en "pending"
  const recipientRows = validRecipients.map(r => ({
    message_id: msgLog.id,
    parent_id: r.parent_id || null,
    phone_e164: r.phone,
    status: 'pending'
  }));
  await supabaseAdmin.from('whatsapp_message_recipients').insert(recipientRows);

  // 3) Envoi Wasender en parallèle, puis mise à jour des statuts
  let sentOk = 0, failed = 0;
  await Promise.all(validRecipients.map(async (r) => {
    const result = await rawSend(r.phone, text, sessionApiKey);
    const status = result.ok ? 'sent' : 'failed';
    if (result.ok) sentOk++; else failed++;
    await supabaseAdmin
      .from('whatsapp_message_recipients')
      .update({
        status,
        sent_at: result.ok ? new Date().toISOString() : null,
        error_message: result.ok ? null : (result.error || 'send_failed')
      })
      .eq('message_id', msgLog.id)
      .eq('phone_e164', r.phone);
  }));

  // 4) Statut global du message
  await supabaseAdmin
    .from('whatsapp_messages')
    .update({ status: failed === 0 ? 'sent' : (sentOk === 0 ? 'failed' : 'partial') })
    .eq('id', msgLog.id);

  return { ok: true, sent: sentOk, failed };
}

// Récupère les infos élève + parents (id + WhatsApp phone résolu) pour notification
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
    // Résoudre le numéro WhatsApp préféré pour chaque parent
    await Promise.all(parents.map(async (p) => {
      p.whatsapp_phone = await getParentWhatsAppPhone(p.id);
    }));
  }
  return { student, parents };
}

// Heure locale Maroc (Africa/Casablanca = UTC+1)
const SCHOOL_TZ = process.env.SCHOOL_TIMEZONE || 'Africa/Casablanca';
function fmtTime(date = new Date()) {
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: SCHOOL_TZ,
  });
}

// 🚌 Notif "élève monté dans le bus" — texte adapté à la direction
// direction: morning_pickup | noon_dropoff | afternoon_pickup | evening_dropoff
export async function notifyBoarded(studentId, busId, opts = {}) {
  const { direction, driverId } = opts;
  const ctx = await getStudentNotificationContext(studentId);
  if (!ctx) return;
  const { student, parents } = ctx;
  const { data: bus } = await supabaseAdmin
    .from('buses').select('plate_number, model').eq('id', busId).single();
  const name = `${student.first_name} ${student.last_name}`;
  const plate = bus?.plate_number || '—';

  // Adapter le texte selon le moment de la journée
  let headline, footer;
  if (direction === 'noon_dropoff' || direction === 'evening_dropoff') {
    // Retour à la maison
    headline = `🚌 *Retour à la maison*\n${name} vient de monter dans le bus *${plate}* à ${fmtTime()} pour rentrer.`;
    footer = `Vous serez prévenu(e) à l'approche de la maison. 🏠`;
  } else {
    // Ramassage matin / après-midi
    headline = `🚌 *Transport scolaire*\n${name} est bien monté(e) dans le bus *${plate}* à ${fmtTime()}.`;
    footer = `Direction l'école 🏫. Vous serez notifié(e) à l'arrivée.`;
  }
  const text = `${headline}\n${footer}`;

  await sendTransportWhatsApp({
    schoolId: student.school_id,
    senderId: driverId || null,
    recipients: parents.map(p => ({ parent_id: p.id, phone: p.whatsapp_phone })),
    text,
    recipientFilter: { event: 'boarded', student_id: studentId, bus_id: busId, direction }
  });

  if (parents.length > 0) {
    await sendPushToUsers(parents.map(p => p.id), {
      title: `🚌 ${name} est monté(e) dans le bus`,
      body: `Bus ${plate} • ${fmtTime()}`,
      url: '/parent/transport',
      tag: `transport-boarded-${studentId}`
    });
  }
}

// ✅ Notif "élève déposé" (à la maison ou à destination)
export async function notifyDropped(studentId, busId, opts = {}) {
  const { direction, driverId } = opts;
  const ctx = await getStudentNotificationContext(studentId);
  if (!ctx) return;
  const { student, parents } = ctx;
  const name = `${student.first_name} ${student.last_name}`;
  const isReturn = direction === 'noon_dropoff' || direction === 'evening_dropoff';
  const text = isReturn
    ? `🏠 *Retour à la maison*\n${name} a bien été déposé(e) devant la maison à ${fmtTime()}. ✅\nBonne fin de journée ! 🌟`
    : `✅ *Transport*\n${name} est bien arrivé(e) à destination à ${fmtTime()}.\nBonne journée ! ☀️`;

  await sendTransportWhatsApp({
    schoolId: student.school_id,
    senderId: driverId || null,
    recipients: parents.map(p => ({ parent_id: p.id, phone: p.whatsapp_phone })),
    text,
    recipientFilter: { event: 'dropped', student_id: studentId, bus_id: busId, direction }
  });

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
export async function notifyApproaching(studentId, etaMin, opts = {}) {
  const { driverId, direction } = opts;
  const ctx = await getStudentNotificationContext(studentId);
  if (!ctx) return;
  const { student, parents } = ctx;
  const name = `${student.first_name} ${student.last_name}`;
  const isReturn = direction === 'noon_dropoff' || direction === 'evening_dropoff';
  const text = isReturn
    ? `⏰ *Retour à la maison*\nLe bus arrive dans environ *${etaMin} min* pour déposer ${name} à la maison. 🏠\nMerci d'être disponible pour l'accueillir. 👨‍👩‍👧`
    : `⏰ *Bus en approche*\nLe bus arrive dans environ *${etaMin} min* pour récupérer ${name}. 🚌\nMerci de préparer l'élève. 🎒`;

  await sendTransportWhatsApp({
    schoolId: student.school_id,
    senderId: driverId || null,
    recipients: parents.map(p => ({ parent_id: p.id, phone: p.whatsapp_phone })),
    text,
    recipientFilter: { event: 'approaching', student_id: studentId, eta_min: etaMin, direction }
  });

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
export async function notifyAbsent(studentId, note = '', opts = {}) {
  const { driverId } = opts;
  const ctx = await getStudentNotificationContext(studentId);
  if (!ctx) return;
  const { student, parents } = ctx;
  const name = `${student.first_name} ${student.last_name}`;
  const extra = note ? `\n📝 Note : ${note}` : '';
  const text = `⚠️ *Transport — Absence*\n${name} a été marqué(e) absent(e) par le chauffeur à ${fmtTime()}.${extra}\nMerci de nous confirmer la situation. 🙏`;

  await sendTransportWhatsApp({
    schoolId: student.school_id,
    senderId: driverId || null,
    recipients: parents.map(p => ({ parent_id: p.id, phone: p.whatsapp_phone })),
    text,
    recipientFilter: { event: 'absent', student_id: studentId, note: note || null }
  });

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
    .from('bus_trips').select('id, bus_id, school_id, direction, driver_id').eq('id', tripId).single();
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

  const isPickup = trip.direction === 'morning_pickup' || trip.direction === 'afternoon_pickup';
  const directionLabel = isPickup ? 'Ramassage' : 'Retour à la maison';
  const plate = bus?.plate_number || '—';
  const text = isPickup
    ? `🚀 *Tournée démarrée — ${directionLabel}*\nLe bus *${plate}* vient de démarrer la tournée. 🚌\nVotre enfant sera bientôt récupéré. Vous serez notifié(e) quand le bus approchera. 📍\nSuivez en direct dans l'application. 📱`
    : `🚀 *Retour démarré*\nLe bus *${plate}* quitte l'école pour ramener votre enfant à la maison. 🏠\nVous serez notifié(e) à l'approche de la maison. 📍\nSuivez en direct dans l'application. 📱`;

  // Résoudre les numéros WhatsApp préférés
  const recipients = await Promise.all(parentIds.map(async (pid) => ({
    parent_id: pid,
    phone: await getParentWhatsAppPhone(pid)
  })));

  await sendTransportWhatsApp({
    schoolId: trip.school_id,
    senderId: trip.driver_id || null,
    recipients,
    text,
    recipientFilter: { event: 'trip_started', trip_id: tripId, direction: trip.direction }
  });

  // Push
  await sendPushToUsers(parentIds, {
    title: `🚀 Bus ${plate} en route`,
    body: directionLabel,
    url: '/parent/transport',
    tag: `transport-start-${tripId}`
  });
}

// 🏫 Notif "bus arrivé à l'école" — fin de tournée pickup
export async function notifyArrivedAtSchool(tripId) {
  const { data: trip } = await supabaseAdmin
    .from('bus_trips').select('id, bus_id, school_id, direction, driver_id').eq('id', tripId).single();
  if (!trip) return;
  // Uniquement pour les tournées de ramassage
  if (trip.direction !== 'morning_pickup' && trip.direction !== 'afternoon_pickup') return;

  const { data: bus } = await supabaseAdmin.from('buses').select('plate_number').eq('id', trip.bus_id).single();

  // Élèves effectivement montés sur ce trajet (pour ne notifier que les parents concernés)
  const { data: events } = await supabaseAdmin
    .from('trip_student_events')
    .select('student_id, event_type')
    .eq('trip_id', tripId);
  const boardedStudentIds = [...new Set((events || []).filter(e => e.event_type === 'boarded').map(e => e.student_id))];
  if (boardedStudentIds.length === 0) return;

  // Récupérer parents de ces élèves
  const { data: links } = await supabaseAdmin
    .from('parent_students').select('parent_id, student_id').in('student_id', boardedStudentIds);
  const studentToParents = (links || []).reduce((acc, l) => {
    (acc[l.student_id] ||= []).push(l.parent_id); return acc;
  }, {});

  // Récupérer noms des élèves
  const { data: students } = await supabaseAdmin
    .from('profiles').select('id, first_name, last_name').in('id', boardedStudentIds);
  const studentById = (students || []).reduce((acc, s) => { acc[s.id] = s; return acc; }, {});

  const plate = bus?.plate_number || '—';

  // Une notification personnalisée par élève
  await Promise.all(boardedStudentIds.map(async (sid) => {
    const s = studentById[sid];
    if (!s) return;
    const parentIds = studentToParents[sid] || [];
    if (parentIds.length === 0) return;
    const recipients = await Promise.all(parentIds.map(async (pid) => ({
      parent_id: pid,
      phone: await getParentWhatsAppPhone(pid)
    })));
    const name = `${s.first_name} ${s.last_name}`;
    const text = `🏫 *Arrivée à l'école*\nLe bus *${plate}* est bien arrivé à l'école avec ${name} à ${fmtTime()}. ✅\nBonne journée à votre enfant ! 📚✨`;
    await sendTransportWhatsApp({
      schoolId: trip.school_id,
      senderId: trip.driver_id || null,
      recipients,
      text,
      recipientFilter: { event: 'arrived_at_school', trip_id: tripId, student_id: sid }
    });
    await sendPushToUsers(parentIds, {
      title: `🏫 ${name} arrivé(e) à l'école`,
      body: `Bus ${plate} • ${fmtTime()}`,
      url: '/parent/transport',
      tag: `transport-school-${sid}`
    });
  }));
}

// ============================================================================
// 📍 PROXIMITY AUTO-TRIGGER — appelée à chaque push GPS du chauffeur.
// Détecte si le bus est à environ 5 min d'un domicile d'élève ou de l'école
// (selon direction), et envoie automatiquement notifyApproaching une seule fois.
// Dédup en mémoire (par process). Reset au redémarrage du serveur.
// ============================================================================
const _approachingSent = new Set(); // `${tripId}:${studentId}`
const _schoolApproachingSent = new Set(); // `${tripId}` — pour notif "bus approche école" si on en veut une

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Calcule l'ETA en minutes en fonction de la vitesse actuelle.
 * Si vitesse trop faible/inconnue, on utilise une estimation à 25 km/h (vitesse urbaine moyenne d'un bus).
 */
function etaMinutes(distanceMeters, speedKmh) {
  const speed = (typeof speedKmh === 'number' && speedKmh > 5) ? speedKmh : 25; // km/h
  const speedMs = speed * 1000 / 3600;
  return Math.max(1, Math.round((distanceMeters / speedMs) / 60));
}

/**
 * Vérifie la proximité du bus avec les domiciles des élèves restants à notifier.
 * À appeler depuis l'endpoint POST /trips/:id/position.
 * Déclenche notifyApproaching automatiquement quand l'ETA tombe à ≤ 5 min.
 */
export async function checkProximityAndNotify(tripId, lat, lng, speedKmh) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return;
  // Récupérer trip + bus + direction
  const { data: trip } = await supabaseAdmin
    .from('bus_trips').select('id, bus_id, school_id, direction, driver_id, status').eq('id', tripId).maybeSingle();
  if (!trip || trip.status !== 'in_progress') return;

  const isPickup = trip.direction === 'morning_pickup' || trip.direction === 'afternoon_pickup';

  // Pour un retour (dropoff) → on notifie à l'approche du domicile de chaque élève qui est encore dans le bus
  // Pour un pickup → on notifie à l'approche du domicile de chaque élève pas encore récupéré
  const { data: assigns } = await supabaseAdmin
    .from('bus_assignments')
    .select('student_id, student:profiles!bus_assignments_student_id_fkey(id, home_lat, home_lng)')
    .eq('bus_id', trip.bus_id)
    .eq('active', true);

  if (!assigns || assigns.length === 0) return;

  // Événements déjà enregistrés sur ce trip
  const { data: events } = await supabaseAdmin
    .from('trip_student_events')
    .select('student_id, event_type')
    .eq('trip_id', tripId);
  const lastEventByStudent = {};
  (events || []).forEach(e => {
    // garder le premier rencontré (l'ordre n'est pas garanti, mais on traite "déjà eu un événement final")
    if (!lastEventByStudent[e.student_id]) lastEventByStudent[e.student_id] = e.event_type;
  });

  // Filtre : élèves à considérer
  const candidates = assigns.filter(a => {
    const ev = lastEventByStudent[a.student_id];
    if (isPickup) {
      // Pickup : pas encore monté/absent
      return !ev || ev === 'approaching';
    } else {
      // Dropoff : déjà monté ce matin (présent dans le bus à déposer), pas encore déposé
      return ev === 'boarded' || ev === 'approaching';
    }
  });

  for (const a of candidates) {
    const home = a.student;
    if (!home || home.home_lat == null || home.home_lng == null) continue;
    const dedupKey = `${tripId}:${a.student_id}`;
    if (_approachingSent.has(dedupKey)) continue;
    const dist = haversineMeters(lat, lng, Number(home.home_lat), Number(home.home_lng));
    const eta = etaMinutes(dist, speedKmh);
    // Seuil : ETA <= 5 min ET distance <= 2 km (évite faux positifs lointains)
    if (eta <= 5 && dist <= 2000) {
      _approachingSent.add(dedupKey);
      try {
        await notifyApproaching(a.student_id, eta, { driverId: trip.driver_id, direction: trip.direction });
        // Logger l'événement "approaching" pour traçabilité
        await supabaseAdmin.from('trip_student_events').insert({
          trip_id: tripId,
          student_id: a.student_id,
          event_type: 'approaching',
          lat, lng,
          recorded_by: trip.driver_id || null,
          notified_parent: true
        });
      } catch (e) {
        console.error('[ProximityNotif] error:', e.message);
        _approachingSent.delete(dedupKey); // permettre nouvelle tentative
      }
    }
  }
}

