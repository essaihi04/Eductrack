-- Ajouter une colonne pour stocker les éléments de suivi activés pour chaque séance
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS tracking_options JSONB DEFAULT '{"presence": true, "cahier_present": true, "sleeping": true, "homework": false, "participation": true, "discipline": true, "phone_use": true, "cahier": false, "attitude": false}';

-- Ajouter les colonnes manquantes à session_tracking si elles n'existent pas
ALTER TABLE session_tracking
ADD COLUMN IF NOT EXISTS cahier_present BOOLEAN,
ADD COLUMN IF NOT EXISTS sleeping BOOLEAN,
ADD COLUMN IF NOT EXISTS homework TEXT CHECK (homework IN ('done', 'partial', 'not_done')),
ADD COLUMN IF NOT EXISTS participation TEXT CHECK (participation IN ('weak', 'medium', 'good')),
ADD COLUMN IF NOT EXISTS attitude TEXT CHECK (attitude IN ('correct', 'disruptive', 'very_engaged')),
ADD COLUMN IF NOT EXISTS comment TEXT,
ADD COLUMN IF NOT EXISTS cahier_lesson TEXT CHECK (cahier_lesson IN ('complete', 'partial', 'absent')),
ADD COLUMN IF NOT EXISTS cahier_documents TEXT CHECK (cahier_documents IN ('correct', 'incomplete', 'not_glued')),
ADD COLUMN IF NOT EXISTS cahier_readability TEXT CHECK (cahier_readability IN ('readable', 'medium', 'difficult')),
ADD COLUMN IF NOT EXISTS mini_eval TEXT;
