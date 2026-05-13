-- ============================================================================
-- Migration TRANSPORT SCOLAIRE — Eductrack
-- Ajoute les rôles transport_manager + driver, et toutes les tables nécessaires
-- au suivi en direct du transport scolaire (style inDrive / Wassalni / Kawa).
-- ============================================================================

-- 1) Étendre la contrainte CHECK sur profiles.role
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'super_admin',
    'admin',
    'school_admin',
    'pedagogical_director',
    'pedagogical_manager',
    'finance_manager',
    'transport_manager',
    'driver',
    'teacher',
    'student',
    'parent'
  ));

-- 2) Adresse domicile + GPS sur profiles (pour les élèves)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_address TEXT,
  ADD COLUMN IF NOT EXISTS home_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS home_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS transport_notes TEXT;

-- 3) Bus / véhicules
CREATE TABLE IF NOT EXISTS public.buses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  plate_number TEXT NOT NULL,
  model TEXT,
  capacity INT DEFAULT 30,
  driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  transport_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  color TEXT,
  photo_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','maintenance','inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_buses_school ON public.buses(school_id);
CREATE INDEX IF NOT EXISTS idx_buses_driver ON public.buses(driver_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_buses_plate_school
  ON public.buses(school_id, plate_number);

-- 4) Assignation élève -> bus
CREATE TABLE IF NOT EXISTS public.bus_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id UUID NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  direction TEXT DEFAULT 'both' CHECK (direction IN ('pickup','dropoff','both')),
  pickup_order INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ba_bus ON public.bus_assignments(bus_id);
CREATE INDEX IF NOT EXISTS idx_ba_student ON public.bus_assignments(student_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ba_bus_student
  ON public.bus_assignments(bus_id, student_id);

-- 5) Trajets quotidiens
CREATE TABLE IF NOT EXISTS public.bus_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id UUID NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  trip_date DATE NOT NULL DEFAULT CURRENT_DATE,
  direction TEXT NOT NULL CHECK (direction IN ('morning_pickup','evening_dropoff')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  start_lat NUMERIC(10,7),
  start_lng NUMERIC(10,7),
  total_km NUMERIC(10,2),
  total_duration_min INT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trips_bus_date ON public.bus_trips(bus_id, trip_date DESC);
CREATE INDEX IF NOT EXISTS idx_trips_driver_date ON public.bus_trips(driver_id, trip_date DESC);
CREATE INDEX IF NOT EXISTS idx_trips_status ON public.bus_trips(status);

-- 6) Positions GPS du bus (haute fréquence, à purger périodiquement)
CREATE TABLE IF NOT EXISTS public.bus_positions (
  id BIGSERIAL PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.bus_trips(id) ON DELETE CASCADE,
  bus_id UUID NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  speed_kmh NUMERIC(6,2),
  heading NUMERIC(5,2),
  accuracy_m NUMERIC(8,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_positions_trip ON public.bus_positions(trip_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_positions_bus ON public.bus_positions(bus_id, recorded_at DESC);

-- 7) Événements par élève (montée / descente / absent / no-show)
CREATE TABLE IF NOT EXISTS public.trip_student_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.bus_trips(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('boarded','dropped','absent','no_show','approaching')),
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT,
  notified_parent BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_tse_trip ON public.trip_student_events(trip_id);
CREATE INDEX IF NOT EXISTS idx_tse_student ON public.trip_student_events(student_id, recorded_at DESC);

-- 8) Push web subscriptions (parents/admins)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_endpoint ON public.push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS idx_push_user ON public.push_subscriptions(user_id);

-- 9) Realtime : activer la publication pour les tables suivies en direct
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bus_positions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.bus_positions';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'trip_student_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_student_events';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bus_trips'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.bus_trips';
  END IF;
END $$;

-- 10) Trigger updated_at sur buses
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_buses_updated_at ON public.buses;
CREATE TRIGGER trg_buses_updated_at
  BEFORE UPDATE ON public.buses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- FIN
-- ============================================================================
