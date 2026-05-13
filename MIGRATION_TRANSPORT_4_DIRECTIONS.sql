-- ============================================================================
-- Étend les directions de tournée à 4 valeurs (matin/midi/après-midi/soir)
-- - morning_pickup    : ramassage matin (typiquement 6h-10h)
-- - noon_dropoff      : retour midi (typiquement 11h-13h30)
-- - afternoon_pickup  : ramassage après-midi (typiquement 13h30-16h)
-- - evening_dropoff   : retour soir (typiquement 16h-22h)
-- ============================================================================

-- 1) bus_trips.direction : nouvelle CHECK constraint
ALTER TABLE public.bus_trips DROP CONSTRAINT IF EXISTS bus_trips_direction_check;
ALTER TABLE public.bus_trips
  ADD CONSTRAINT bus_trips_direction_check
  CHECK (direction IN ('morning_pickup','noon_dropoff','afternoon_pickup','evening_dropoff'));

-- 2) bus_assignments.direction : autorise aussi 'both' (élève dans toutes les tournées)
--    et les nouvelles valeurs si on souhaite assigner un élève à une période précise
ALTER TABLE public.bus_assignments DROP CONSTRAINT IF EXISTS bus_assignments_direction_check;
ALTER TABLE public.bus_assignments
  ADD CONSTRAINT bus_assignments_direction_check
  CHECK (direction IN ('both','morning_pickup','noon_dropoff','afternoon_pickup','evening_dropoff'));
