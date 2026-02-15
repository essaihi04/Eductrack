-- Fix: Allow same subject code in different schools
-- The original constraint was UNIQUE(code) which is global,
-- preventing two schools from having the same subject (e.g. MATH).
-- Change it to UNIQUE(code, school_id) so each school can have its own subjects.

-- 1. Drop the old global unique constraint on code
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_code_key;

-- 2. Also drop any unique index on code alone
DROP INDEX IF EXISTS subjects_code_key;

-- 3. Add new unique constraint per school
ALTER TABLE subjects ADD CONSTRAINT subjects_code_school_unique UNIQUE (code, school_id);
