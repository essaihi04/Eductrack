// Routes principales du module Transport :
// - CRUD bus + assignations élèves
// - Driver : démarrer/terminer trajet, push GPS, événements élèves
// - Parent : suivi live de ses enfants
// - Historique
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import {
  authenticate,
  requireTransportAccess,
  requireDriverOrTransportAccess
} from '../middleware/auth.js';
import {
  notifyBoarded,
  notifyDropped,
  notifyAbsent,
  notifyApproaching,
  notifyTripStarted,
  notifyArrivedAtSchool,
  checkProximityAndNotify
} from '../services/transportNotifications.js';
import { activeEnrollmentMap } from '../utils/enrollmentScope.js';

const router = express.Router();
router.use(authenticate);

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.body.school_id || req.query.school_id || null;
  return req.user.school_id || null;
};

// ==================== BUSES (admin / transport_manager) ====================
router.get('/buses', requireTransportAccess, async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const enrollmentMap = await activeEnrollmentMap(schoolId, req.query.academic_year);
    let q = supabaseAdmin
      .from('buses')
      .select('*, driver:profiles!buses_driver_id_fkey(id, first_name, last_name, phone), manager:profiles!buses_transport_manager_id_fkey(id, first_name, last_name)')
      .order('created_at', { ascending: false });
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) throw error;

    // Compter élèves assignés
    const ids = (data || []).map(b => b.id);
    let counts = {};
    if (ids.length > 0) {
      const { data: ass } = await supabaseAdmin
        .from('bus_assignments').select('bus_id, student_id').in('bus_id', ids).eq('active', true);
      counts = (ass || [])
        .filter((assignment) => !enrollmentMap || enrollmentMap.has(assignment.student_id))
        .reduce((acc, a) => { acc[a.bus_id] = (acc[a.bus_id] || 0) + 1; return acc; }, {});
    }
    res.json({ buses: (data || []).map(b => ({ ...b, students_count: counts[b.id] || 0 })) });
  } catch (e) {
    console.error('Erreur fetch buses:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/buses', requireTransportAccess, async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { plate_number, model, capacity, driver_id, transport_manager_id, color, photo_url, status, notes } = req.body;
    if (!plate_number) return res.status(400).json({ error: 'Plaque requise' });
    const { data, error } = await supabaseAdmin
      .from('buses')
      .insert({ school_id: schoolId, plate_number, model, capacity, driver_id, transport_manager_id, color, photo_url, status, notes })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('Erreur create bus:', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

router.put('/buses/:id', requireTransportAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['plate_number','model','capacity','driver_id','transport_manager_id','color','photo_url','status','notes'];
    const update = {};
    fields.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
    const { data, error } = await supabaseAdmin
      .from('buses').update(update).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('Erreur update bus:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/buses/:id', requireTransportAccess, async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.from('buses').delete().eq('id', id);
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur delete bus:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ASSIGNATIONS ÉLÈVES <-> BUS ====================
router.get('/buses/:id/students', requireDriverOrTransportAccess, async (req, res) => {
  try {
    const { id } = req.params;
    // Si driver : vérifier qu'il est bien chauffeur de ce bus
    if (req.user.role === 'driver') {
      const { data: bus } = await supabaseAdmin.from('buses').select('driver_id, school_id').eq('id', id).single();
      if (!bus || bus.driver_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé' });
    }
    const { data: assigns, error } = await supabaseAdmin
      .from('bus_assignments')
      .select('id, direction, pickup_order, active, student:profiles!bus_assignments_student_id_fkey(id, first_name, last_name, phone, home_address, home_lat, home_lng, transport_notes, class_id, classes!fk_profiles_class(name))')
      .eq('bus_id', id)
      .order('pickup_order', { ascending: true });
    if (error) throw error;
    const enrollmentMap = await activeEnrollmentMap(getSchoolId(req), req.query.academic_year);
    const assignments = (assigns || [])
      .filter((assignment) => !enrollmentMap || enrollmentMap.has(assignment.student?.id))
      .map((assignment) => {
        const enrollment = enrollmentMap?.get(assignment.student?.id);
        return enrollment
          ? { ...assignment, student: { ...assignment.student, class_id: enrollment.class_id, classes: enrollment.class } }
          : assignment;
      });
    res.json({ assignments });
  } catch (e) {
    console.error('Erreur bus students:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/buses/:id/students', requireTransportAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { student_id, direction = 'both', pickup_order = 0 } = req.body;
    const schoolId = getSchoolId(req);
    if (!student_id) return res.status(400).json({ error: 'student_id requis' });
    const { data, error } = await supabaseAdmin
      .from('bus_assignments')
      .upsert({ bus_id: id, student_id, school_id: schoolId, direction, pickup_order, active: true }, { onConflict: 'bus_id,student_id' })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('Erreur assign student:', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

router.put('/assignments/:id', requireTransportAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { direction, pickup_order, active } = req.body;
    const update = {};
    if (direction !== undefined) update.direction = direction;
    if (pickup_order !== undefined) update.pickup_order = pickup_order;
    if (active !== undefined) update.active = active;
    const { data, error } = await supabaseAdmin
      .from('bus_assignments').update(update).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('Erreur update assignment:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/buses/:id/assignments/order', requireDriverOrTransportAccess, async (req, res) => {
  // body: { items: [{ id, pickup_order }] }
  try {
    const { id: busId } = req.params;
    const { items } = req.body || {};
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array requis' });
    // Si chauffeur, vérifier qu'il est bien chauffeur de ce bus
    if (req.user.role === 'driver') {
      const { data: bus } = await supabaseAdmin.from('buses').select('driver_id').eq('id', busId).maybeSingle();
      if (!bus || bus.driver_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé' });
    }
    await Promise.all(items.map(it =>
      supabaseAdmin.from('bus_assignments').update({ pickup_order: it.pickup_order }).eq('id', it.id)
    ));
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur reorder:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/assignments/:id', requireTransportAccess, async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.from('bus_assignments').delete().eq('id', id);
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur delete assignment:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /students/:id/home/by-driver — le chauffeur met à jour le GPS d'un élève
// (uniquement les élèves de son bus, sur sa tournée en cours)
router.put('/students/:id/home/by-driver', async (req, res) => {
  try {
    if (req.user.role !== 'driver') return res.status(403).json({ error: 'Réservé au chauffeur' });
    const { id } = req.params;
    const { home_lat, home_lng, home_address } = req.body;
    if (typeof home_lat !== 'number' || typeof home_lng !== 'number') {
      return res.status(400).json({ error: 'home_lat/home_lng requis' });
    }
    // Vérifier que cet élève est bien assigné à un bus dont le chauffeur est req.user
    const { data: bus } = await supabaseAdmin
      .from('buses').select('id').eq('driver_id', req.user.id).maybeSingle();
    if (!bus) return res.status(403).json({ error: 'Aucun bus assigné à votre compte' });
    const { data: assign } = await supabaseAdmin
      .from('bus_assignments').select('id').eq('bus_id', bus.id).eq('student_id', id).eq('active', true).maybeSingle();
    if (!assign) return res.status(403).json({ error: 'Élève non assigné à votre bus' });

    const update = { home_lat, home_lng };
    if (home_address !== undefined) update.home_address = home_address;
    const { data, error } = await supabaseAdmin
      .from('profiles').update(update).eq('id', id).eq('role', 'student').select('id, home_lat, home_lng, home_address').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('Erreur update home by driver:', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

// PUT /students/:id/home — admin/transport_manager met à jour adresse + GPS d'un élève
router.put('/students/:id/home', requireTransportAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { home_address, home_lat, home_lng, transport_notes } = req.body;
    const update = {};
    if (home_address !== undefined) update.home_address = home_address;
    if (home_lat !== undefined) update.home_lat = home_lat;
    if (home_lng !== undefined) update.home_lng = home_lng;
    if (transport_notes !== undefined) update.transport_notes = transport_notes;
    const { data, error } = await supabaseAdmin
      .from('profiles').update(update).eq('id', id).eq('role', 'student').select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('Erreur update home:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ÉCOLE (localisation) ====================

// GET /school — récupère lat/lng/address de l'école courante
// Accessible aussi aux drivers car ActiveTripPage en a besoin pour route retour école.
router.get('/school', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    const schoolId = req.user.school_id;
    if (!schoolId) return res.json({ id: null, name: null, lat: null, lng: null, address: null });
    const { data, error } = await supabaseAdmin
      .from('schools')
      .select('id, name, lat, lng, address')
      .eq('id', schoolId)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('Erreur get school:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /school — admin/transport_manager met à jour la localisation GPS de l'école
router.put('/school', requireTransportAccess, async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'Aucune école associée' });
    const { lat, lng, address } = req.body;
    const update = {};
    if (lat !== undefined) update.lat = lat;
    if (lng !== undefined) update.lng = lng;
    if (address !== undefined) update.address = address;
    const { data, error } = await supabaseAdmin
      .from('schools')
      .update(update)
      .eq('id', schoolId)
      .select('id, name, lat, lng, address')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('Erreur update school:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== TRIPS (chauffeur principalement) ====================

// GET /trips/today — trajets du jour pour le bus du chauffeur (ou pour admin tous bus)
router.get('/trips/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    let q = supabaseAdmin
      .from('bus_trips')
      .select('*, bus:buses(id, plate_number, model)')
      .eq('trip_date', today)
      .order('created_at', { ascending: false });
    if (req.user.role === 'driver') q = q.eq('driver_id', req.user.id);
    else if (req.user.school_id) q = q.eq('school_id', req.user.school_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ trips: data || [] });
  } catch (e) {
    console.error('Erreur trips today:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /trips/start — chauffeur démarre une tournée
router.post('/trips/start', async (req, res) => {
  try {
    if (req.user.role !== 'driver') return res.status(403).json({ error: 'Réservé au chauffeur' });
    const { direction, lat, lng } = req.body;
    if (!['morning_pickup','noon_dropoff','afternoon_pickup','evening_dropoff'].includes(direction)) {
      return res.status(400).json({ error: 'direction invalide' });
    }
    // Trouver bus du chauffeur
    const { data: bus } = await supabaseAdmin
      .from('buses').select('id, school_id').eq('driver_id', req.user.id).single();
    if (!bus) return res.status(400).json({ error: 'Aucun bus assigné à votre compte' });

    const today = new Date().toISOString().split('T')[0];
    // Vérifier si déjà un trip in_progress pour ce jour/direction
    const { data: existing } = await supabaseAdmin
      .from('bus_trips').select('id, status')
      .eq('bus_id', bus.id).eq('trip_date', today).eq('direction', direction)
      .in('status', ['scheduled','in_progress']).maybeSingle();

    let trip;
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('bus_trips').update({ status: 'in_progress', started_at: new Date().toISOString(), start_lat: lat, start_lng: lng, driver_id: req.user.id })
        .eq('id', existing.id).select().single();
      if (error) throw error;
      trip = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('bus_trips').insert({
          bus_id: bus.id, driver_id: req.user.id, school_id: bus.school_id,
          trip_date: today, direction, status: 'in_progress',
          started_at: new Date().toISOString(), start_lat: lat, start_lng: lng
        }).select().single();
      if (error) throw error;
      trip = data;
    }

    // Notifier les parents (background)
    notifyTripStarted(trip.id).catch(err => console.error('notifyTripStarted:', err));

    res.status(201).json(trip);
  } catch (e) {
    console.error('Erreur start trip:', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

// POST /trips/:id/end — terminer
router.post('/trips/:id/end', async (req, res) => {
  try {
    const { id } = req.params;
    const { total_km } = req.body || {};
    const { data: trip } = await supabaseAdmin.from('bus_trips').select('id, driver_id, started_at, direction').eq('id', id).single();
    if (!trip) return res.status(404).json({ error: 'Trajet introuvable' });
    if (req.user.role === 'driver' && trip.driver_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé' });

    const endedAt = new Date();
    const durationMin = trip.started_at ? Math.round((endedAt - new Date(trip.started_at)) / 60000) : null;
    const { data, error } = await supabaseAdmin
      .from('bus_trips').update({
        status: 'completed', ended_at: endedAt.toISOString(),
        total_duration_min: durationMin, total_km: total_km ?? null
      }).eq('id', id).select().single();
    if (error) throw error;

    // Si tournée de ramassage → notifier les parents que le bus est arrivé à l'école (background)
    if (trip.direction === 'morning_pickup' || trip.direction === 'afternoon_pickup') {
      notifyArrivedAtSchool(id).catch(err => console.error('notifyArrivedAtSchool:', err));
    }

    res.json(data);
  } catch (e) {
    console.error('Erreur end trip:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /trips/:id/position — chauffeur push position GPS (toutes les 5-10s)
router.post('/trips/:id/position', async (req, res) => {
  try {
    const { id } = req.params;
    const { lat, lng, speed_kmh, heading, accuracy_m } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat/lng requis' });
    }
    const { data: trip } = await supabaseAdmin
      .from('bus_trips').select('id, driver_id, bus_id, status').eq('id', id).single();
    if (!trip) return res.status(404).json({ error: 'Trajet introuvable' });
    if (req.user.role === 'driver' && trip.driver_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé' });
    if (trip.status !== 'in_progress') return res.status(400).json({ error: 'Trajet non actif' });

    const { error } = await supabaseAdmin.from('bus_positions').insert({
      trip_id: id, bus_id: trip.bus_id, lat, lng, speed_kmh: speed_kmh ?? null,
      heading: heading ?? null, accuracy_m: accuracy_m ?? null
    });
    if (error) throw error;

    // Vérifier proximité élèves à notifier (background, non bloquant)
    checkProximityAndNotify(id, lat, lng, speed_kmh).catch(err => console.error('checkProximityAndNotify:', err));

    res.json({ success: true });
  } catch (e) {
    console.error('Erreur position:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /trips/:id/positions — historique GPS d'un trajet (replay)
router.get('/trips/:id/positions', requireDriverOrTransportAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('bus_positions')
      .select('lat, lng, speed_kmh, heading, recorded_at')
      .eq('trip_id', id)
      .order('recorded_at', { ascending: true });
    if (error) throw error;
    res.json({ positions: data || [] });
  } catch (e) {
    console.error('Erreur positions:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /trips/:id/students/:sid/event — événement (boarded/dropped/absent)
router.post('/trips/:id/students/:sid/event', async (req, res) => {
  try {
    const { id, sid } = req.params;
    const { event_type, lat, lng, note } = req.body;
    if (!['boarded','dropped','absent','no_show','approaching'].includes(event_type)) {
      return res.status(400).json({ error: 'event_type invalide' });
    }
    const { data: trip } = await supabaseAdmin
      .from('bus_trips').select('id, driver_id, bus_id, direction').eq('id', id).single();
    if (!trip) return res.status(404).json({ error: 'Trajet introuvable' });
    if (req.user.role === 'driver' && trip.driver_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé' });

    // Idempotence : si le même événement a déjà été enregistré très récemment
    // (double tap, retry réseau de l'app chauffeur), on ne ré-insère pas et on
    // ne renotifie pas les parents — évite les messages WhatsApp en double.
    const { data: dup } = await supabaseAdmin
      .from('trip_student_events')
      .select('id')
      .eq('trip_id', id)
      .eq('student_id', sid)
      .eq('event_type', event_type)
      .gte('recorded_at', new Date(Date.now() - 60_000).toISOString())
      .limit(1)
      .maybeSingle();
    if (dup) {
      return res.status(200).json({ ...dup, duplicate: true });
    }

    const { data: ev, error } = await supabaseAdmin.from('trip_student_events').insert({
      trip_id: id, student_id: sid, event_type,
      lat: lat ?? null, lng: lng ?? null, recorded_by: req.user.id, note
    }).select().single();
    if (error) throw error;

    // Notifications parents (background) — avec direction et driverId pour adapter le message
    const opts = { direction: trip.direction, driverId: trip.driver_id };
    if (event_type === 'boarded') notifyBoarded(sid, trip.bus_id, opts).catch(err => console.error('notifyBoarded:', err));
    else if (event_type === 'dropped') notifyDropped(sid, trip.bus_id, opts).catch(err => console.error('notifyDropped:', err));
    else if (event_type === 'absent' || event_type === 'no_show') notifyAbsent(sid, note || '', opts).catch(err => console.error('notifyAbsent:', err));
    else if (event_type === 'approaching') notifyApproaching(sid, req.body.eta_min || 5, opts).catch(err => console.error('notifyApproaching:', err));

    // Marquer notifié
    await supabaseAdmin.from('trip_student_events').update({ notified_parent: true }).eq('id', ev.id);

    res.status(201).json(ev);
  } catch (e) {
    console.error('Erreur event:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /trips/:id/events
router.get('/trips/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('trip_student_events')
      .select('*, student:profiles!trip_student_events_student_id_fkey(id, first_name, last_name)')
      .eq('trip_id', id)
      .order('recorded_at', { ascending: false });
    if (error) throw error;
    res.json({ events: data || [] });
  } catch (e) {
    console.error('Erreur events:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== LIVE (admin/transport_manager + parent) ====================

// GET /live — tous les bus actifs (in_progress) pour l'école
router.get('/live', requireTransportAccess, async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const today = new Date().toISOString().split('T')[0];
    let q = supabaseAdmin
      .from('bus_trips')
      .select('id, bus_id, driver_id, direction, status, started_at, bus:buses(id, plate_number, model, color)')
      .eq('status', 'in_progress')
      .eq('trip_date', today);
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data: trips, error } = await q;
    if (error) throw error;

    // Dernière position de chaque trip
    const tripIds = (trips || []).map(t => t.id);
    const driverIds = [...new Set((trips || []).map(t => t.driver_id).filter(Boolean))];
    let lastPositions = {};
    let driversById = {};
    if (tripIds.length > 0) {
      const { data: positions } = await supabaseAdmin
        .from('bus_positions')
        .select('trip_id, lat, lng, speed_kmh, heading, recorded_at')
        .in('trip_id', tripIds)
        .order('recorded_at', { ascending: false });
      (positions || []).forEach(p => {
        if (!lastPositions[p.trip_id]) lastPositions[p.trip_id] = p;
      });
    }
    if (driverIds.length > 0) {
      const { data: drivers } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, phone')
        .in('id', driverIds);
      (drivers || []).forEach(d => { driversById[d.id] = d; });
    }
    res.json({
      trips: (trips || []).map(t => ({
        ...t,
        last_position: lastPositions[t.id] || null,
        driver: driversById[t.driver_id] || null
      }))
    });
  } catch (e) {
    console.error('Erreur live:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /parent/live — pour parent, positions des bus de ses enfants
router.get('/parent/live', async (req, res) => {
  try {
    if (req.user.role !== 'parent') return res.status(403).json({ error: 'Réservé aux parents' });
    // Mes enfants
    const { data: links } = await supabaseAdmin
      .from('parent_students').select('student_id').eq('parent_id', req.user.id);
    const studentIds = (links || []).map(l => l.student_id);
    if (studentIds.length === 0) return res.json({ children: [] });

    // Élèves + bus assignés
    const { data: students } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, home_lat, home_lng, home_address')
      .in('id', studentIds);

    const { data: assigns } = await supabaseAdmin
      .from('bus_assignments')
      .select('student_id, direction, bus:buses(id, plate_number, model, color)')
      .in('student_id', studentIds).eq('active', true);
    const assignByStudent = (assigns || []).reduce((acc, a) => {
      (acc[a.student_id] ||= []).push(a); return acc;
    }, {});

    // Trajets du jour pour ces bus
    const busIds = [...new Set((assigns || []).map(a => a.bus?.id).filter(Boolean))];
    const today = new Date().toISOString().split('T')[0];
    let activeTrips = [];
    if (busIds.length > 0) {
      const { data: trips } = await supabaseAdmin
        .from('bus_trips')
        .select('id, bus_id, direction, status, started_at')
        .in('bus_id', busIds).eq('trip_date', today)
        .in('status', ['in_progress','completed']);
      activeTrips = trips || [];
    }
    const tripsByBus = activeTrips.reduce((acc, t) => {
      (acc[t.bus_id] ||= []).push(t); return acc;
    }, {});

    // Dernière position pour les trips in_progress
    const tripIds = activeTrips.filter(t => t.status === 'in_progress').map(t => t.id);
    const lastPositions = {};
    if (tripIds.length > 0) {
      const { data: positions } = await supabaseAdmin
        .from('bus_positions')
        .select('trip_id, lat, lng, speed_kmh, heading, recorded_at')
        .in('trip_id', tripIds)
        .order('recorded_at', { ascending: false });
      (positions || []).forEach(p => { if (!lastPositions[p.trip_id]) lastPositions[p.trip_id] = p; });
    }

    // Derniers événements pour chaque enfant aujourd'hui
    const { data: events } = await supabaseAdmin
      .from('trip_student_events')
      .select('student_id, event_type, recorded_at, trip_id')
      .in('student_id', studentIds)
      .gte('recorded_at', today + 'T00:00:00.000Z')
      .order('recorded_at', { ascending: false });
    const lastEventByStudent = {};
    (events || []).forEach(e => { if (!lastEventByStudent[e.student_id]) lastEventByStudent[e.student_id] = e; });

    const children = (students || []).map(s => {
      const sa = assignByStudent[s.id] || [];
      const buses = sa.map(a => {
        const trips = tripsByBus[a.bus.id] || [];
        const inProgress = trips.find(t => t.status === 'in_progress');
        return {
          ...a.bus,
          direction: a.direction,
          active_trip: inProgress || null,
          last_position: inProgress ? lastPositions[inProgress.id] || null : null,
          today_trips: trips
        };
      });
      return {
        student: s,
        buses,
        last_event: lastEventByStudent[s.id] || null
      };
    });
    res.json({ children });
  } catch (e) {
    console.error('Erreur parent live:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /history — trajets passés (filtres : date, bus_id, student_id)
router.get('/history', requireTransportAccess, async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { date_from, date_to, bus_id } = req.query;
    let q = supabaseAdmin
      .from('bus_trips')
      .select('*, bus:buses(plate_number, model), driver:profiles!bus_trips_driver_id_fkey(first_name, last_name)')
      .order('trip_date', { ascending: false }).order('started_at', { ascending: false })
      .limit(200);
    if (schoolId) q = q.eq('school_id', schoolId);
    if (bus_id) q = q.eq('bus_id', bus_id);
    if (date_from) q = q.gte('trip_date', date_from);
    if (date_to) q = q.lte('trip_date', date_to);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ trips: data || [] });
  } catch (e) {
    console.error('Erreur history:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /students/available — élèves de l'école non assignés (ou tous), pour assignation
router.get('/students/available', requireTransportAccess, async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const enrollmentMap = await activeEnrollmentMap(schoolId, req.query.academic_year);
    let q = supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, phone, class_id, home_address, home_lat, home_lng, classes!fk_profiles_class(name)')
      .eq('role', 'student')
      .order('last_name');
    if (schoolId) q = q.eq('school_id', schoolId);
    if (enrollmentMap) {
      const activeIds = [...enrollmentMap.keys()];
      if (activeIds.length === 0) return res.json({ students: [] });
      q = q.in('id', activeIds);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json({ students: (data || []).map((student) => {
      const enrollment = enrollmentMap?.get(student.id);
      return enrollment
        ? { ...student, class_id: enrollment.class_id, classes: enrollment.class }
        : student;
    }) });
  } catch (e) {
    console.error('Erreur students available:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /statistics — stats détaillées par chauffeur + par trajet (admin/transport_manager)
// Query: ?period=today|week|month (default: week)
router.get('/statistics', requireTransportAccess, async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const period = (req.query.period || 'week').toString();
    const now = new Date();
    const from = new Date(now);
    if (period === 'today') from.setHours(0, 0, 0, 0);
    else if (period === 'month') from.setDate(from.getDate() - 30);
    else from.setDate(from.getDate() - 7); // week
    const fromDate = from.toISOString().split('T')[0];

    // Tous les trajets de la période (complétés ou en cours)
    let q = supabaseAdmin
      .from('bus_trips')
      .select('id, bus_id, driver_id, direction, status, trip_date, started_at, ended_at, total_duration_min, total_km, bus:buses(id, plate_number, model, color), driver:profiles!bus_trips_driver_id_fkey(id, first_name, last_name, phone)')
      .gte('trip_date', fromDate)
      .order('started_at', { ascending: false });
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data: trips, error } = await q;
    if (error) throw error;

    // Charger les événements (pour compter montés/déposés/absents par trajet)
    const tripIds = (trips || []).map(t => t.id);
    let eventsByTrip = {};
    if (tripIds.length > 0) {
      const { data: events } = await supabaseAdmin
        .from('trip_student_events')
        .select('trip_id, event_type, student_id')
        .in('trip_id', tripIds);
      // Dernier événement par (trip, student) — un élève peut être 'boarded' puis 'dropped'
      const lastByKey = {};
      (events || []).forEach(e => {
        const key = `${e.trip_id}_${e.student_id}`;
        lastByKey[key] = e; // events come in order, last wins (but DB doesn't guarantee; we just count all distinct statuses)
      });
      eventsByTrip = Object.values(lastByKey).reduce((acc, e) => {
        if (!acc[e.trip_id]) acc[e.trip_id] = { boarded: 0, dropped: 0, absent: 0, total: 0 };
        acc[e.trip_id].total++;
        if (e.event_type === 'boarded') acc[e.trip_id].boarded++;
        else if (e.event_type === 'dropped') acc[e.trip_id].dropped++;
        else if (e.event_type === 'absent' || e.event_type === 'no_show') acc[e.trip_id].absent++;
        return acc;
      }, {});
    }

    // Enrichir chaque trajet avec stats événements
    const enrichedTrips = (trips || []).map(t => ({
      ...t,
      events: eventsByTrip[t.id] || { boarded: 0, dropped: 0, absent: 0, total: 0 },
    }));

    // Aggréger par chauffeur
    const driverMap = {};
    enrichedTrips.forEach(t => {
      if (!t.driver_id) return;
      const key = t.driver_id;
      if (!driverMap[key]) {
        driverMap[key] = {
          driver: t.driver,
          driver_id: t.driver_id,
          total_trips: 0,
          completed_trips: 0,
          total_km: 0,
          total_duration_min: 0,
          total_boarded: 0,
          total_dropped: 0,
          total_absent: 0,
          buses_used: new Set(),
        };
      }
      const d = driverMap[key];
      d.total_trips++;
      if (t.status === 'completed') d.completed_trips++;
      d.total_km += Number(t.total_km || 0);
      d.total_duration_min += Number(t.total_duration_min || 0);
      d.total_boarded += t.events.boarded;
      d.total_dropped += t.events.dropped;
      d.total_absent += t.events.absent;
      if (t.bus_id) d.buses_used.add(t.bus_id);
    });
    const driverStats = Object.values(driverMap).map(d => ({
      ...d,
      buses_used: d.buses_used.size,
      avg_km_per_trip: d.completed_trips > 0 ? +(d.total_km / d.completed_trips).toFixed(2) : 0,
      avg_duration_min: d.completed_trips > 0 ? Math.round(d.total_duration_min / d.completed_trips) : 0,
    })).sort((a, b) => b.total_km - a.total_km);

    // Stats globales
    const completedTrips = enrichedTrips.filter(t => t.status === 'completed');
    const global = {
      total_trips: enrichedTrips.length,
      completed_trips: completedTrips.length,
      in_progress_trips: enrichedTrips.filter(t => t.status === 'in_progress').length,
      total_km: +completedTrips.reduce((s, t) => s + Number(t.total_km || 0), 0).toFixed(2),
      total_duration_min: completedTrips.reduce((s, t) => s + Number(t.total_duration_min || 0), 0),
      avg_km: completedTrips.length > 0 ? +(completedTrips.reduce((s, t) => s + Number(t.total_km || 0), 0) / completedTrips.length).toFixed(2) : 0,
      avg_duration_min: completedTrips.length > 0 ? Math.round(completedTrips.reduce((s, t) => s + Number(t.total_duration_min || 0), 0) / completedTrips.length) : 0,
      total_boarded: completedTrips.reduce((s, t) => s + t.events.boarded, 0),
      total_dropped: completedTrips.reduce((s, t) => s + t.events.dropped, 0),
      total_absent: completedTrips.reduce((s, t) => s + t.events.absent, 0),
      by_direction: completedTrips.reduce((acc, t) => { acc[t.direction] = (acc[t.direction] || 0) + 1; return acc; }, {}),
    };

    res.json({ period, from: fromDate, global, drivers: driverStats, trips: enrichedTrips });
  } catch (e) {
    console.error('Erreur stats transport:', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

// GET /summary — KPIs pour dashboard (bus actifs, trajets en cours, présences du jour)
router.get('/summary', requireTransportAccess, async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const today = new Date().toISOString().split('T')[0];

    let busQ = supabaseAdmin.from('buses').select('id, status', { count: 'exact' }).eq('status', 'active');
    if (schoolId) busQ = busQ.eq('school_id', schoolId);
    const { count: activeBuses } = await busQ;

    let tripQ = supabaseAdmin.from('bus_trips').select('id', { count: 'exact' }).eq('trip_date', today).eq('status', 'in_progress');
    if (schoolId) tripQ = tripQ.eq('school_id', schoolId);
    const { count: activeTrips } = await tripQ;

    let evQ = supabaseAdmin.from('trip_student_events').select('id, event_type').gte('recorded_at', today + 'T00:00:00.000Z');
    const { data: events } = await evQ;
    const boarded = (events || []).filter(e => e.event_type === 'boarded').length;
    const dropped = (events || []).filter(e => e.event_type === 'dropped').length;
    const absent = (events || []).filter(e => ['absent','no_show'].includes(e.event_type)).length;

    res.json({
      active_buses: activeBuses || 0,
      active_trips: activeTrips || 0,
      today: { boarded, dropped, absent }
    });
  } catch (e) {
    console.error('Erreur summary:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
