-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  SEED TRACKING : Suivi rapide pour la classe TEST 2BAC PC BIOF           ║
-- ║                                                                          ║
-- ║  À exécuter APRÈS SEED_TEST_2BAC_PC_BIOF.sql                             ║
-- ║                                                                          ║
-- ║  Crée :                                                                  ║
-- ║   • 16 séances par matière (8 S1 + 8 S2)  → 144 séances au total         ║
-- ║   • 1 entry session_tracking par élève par séance                        ║
-- ║     (présence, participation, discipline, attitude, devoirs, comportement)║
-- ║                                                                          ║
-- ║  Données réalistes alignées sur le profil de chaque élève (forts/moy/faibles)║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
  v_class_id     UUID;
  v_school_id    UUID;
  v_teacher_id   UUID;
  v_subject_id   UUID;
  v_session_id   UUID;
  r_subject      RECORD;
  r_student      RECORD;
  v_dates        DATE[];
  v_dt           DATE;
  i              INT;
  v_rand         INT;
  v_profile      INT;            -- 1=fort, 2=moyen, 3=faible
  v_presence     TEXT;
  v_participation TEXT;
  v_discipline   TEXT;
  v_attitude     TEXT;
  v_homework     TEXT;
  v_work         TEXT;
BEGIN
  -- ─── 1. Trouver la classe TEST ───────────────────────────────────────────
  SELECT id, school_id INTO v_class_id, v_school_id
    FROM classes WHERE name = 'TEST 2BAC PC BIOF' LIMIT 1;
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Classe TEST 2BAC PC BIOF introuvable. Exécute d''abord SEED_TEST_2BAC_PC_BIOF.sql.';
  END IF;

  -- ─── 2. Nettoyer les anciennes séances de test ───────────────────────────
  DELETE FROM session_tracking
   WHERE session_id IN (SELECT id FROM sessions WHERE class_id = v_class_id);
  DELETE FROM sessions WHERE class_id = v_class_id;

  -- ─── 3. Dates des séances : 8 par semestre, espacées d'environ 2 semaines ─
  v_dates := ARRAY[
    -- Semestre 1
    DATE '2025-09-15', DATE '2025-09-29', DATE '2025-10-13', DATE '2025-10-27',
    DATE '2025-11-10', DATE '2025-11-24', DATE '2025-12-08', DATE '2026-01-12',
    -- Semestre 2
    DATE '2026-02-02', DATE '2026-02-16', DATE '2026-03-02', DATE '2026-03-16',
    DATE '2026-04-06', DATE '2026-04-27', DATE '2026-05-11', DATE '2026-05-25'
  ];

  -- ─── 4. Pour chaque matière (= chaque prof factice de la classe) ─────────
  FOR r_subject IN
    SELECT DISTINCT cp.teacher_id, ts.subject_id
    FROM controls_plan cp
    JOIN teacher_subjects ts ON ts.teacher_id = cp.teacher_id
    WHERE cp.class_id = v_class_id
  LOOP
    v_teacher_id := r_subject.teacher_id;
    v_subject_id := r_subject.subject_id;

    -- ─── 5. Créer 16 séances pour cette matière ─────────────────────────────
    FOR i IN 1 .. array_length(v_dates, 1) LOOP
      v_dt := v_dates[i];

      INSERT INTO sessions (class_id, teacher_id, subject_id, date, start_time, end_time, topic)
      VALUES (
        v_class_id, v_teacher_id, v_subject_id, v_dt,
        TIME '08:00', TIME '09:00',
        'Séance ' || (CASE WHEN i <= 8 THEN 'S1' ELSE 'S2' END) || ' #' || i::text
      ) RETURNING id INTO v_session_id;

      -- ─── 6. Insérer un suivi par élève ─────────────────────────────────────
      FOR r_student IN
        SELECT id, massar_code FROM profiles
         WHERE class_id = v_class_id AND role = 'student'
         ORDER BY massar_code
      LOOP
        -- Profil élève selon le code Massar (les 6 premiers = forts, etc.)
        v_profile := CASE
          WHEN r_student.massar_code IN ('M2025001','M2025002','M2025003','M2025004','M2025005','M2025006') THEN 1
          WHEN r_student.massar_code IN ('M2025007','M2025008','M2025009','M2025010','M2025011','M2025012') THEN 2
          ELSE 3
        END;

        v_rand := floor(random() * 100)::int;

        -- ─── Présence : forts ~95%, moyens ~85%, faibles ~70% ────────
        v_presence := CASE
          WHEN v_profile = 1 THEN (CASE WHEN v_rand < 95 THEN 'present' WHEN v_rand < 98 THEN 'late' ELSE 'absent' END)
          WHEN v_profile = 2 THEN (CASE WHEN v_rand < 85 THEN 'present' WHEN v_rand < 92 THEN 'late' ELSE 'absent' END)
          ELSE                    (CASE WHEN v_rand < 70 THEN 'present' WHEN v_rand < 80 THEN 'late' ELSE 'absent' END)
        END;

        -- ─── Participation ────────────────────────────────────────────
        v_rand := floor(random() * 100)::int;
        v_participation := CASE
          WHEN v_profile = 1 THEN (CASE WHEN v_rand < 70 THEN 'excellent' WHEN v_rand < 95 THEN 'bon' ELSE 'faible' END)
          WHEN v_profile = 2 THEN (CASE WHEN v_rand < 25 THEN 'excellent' WHEN v_rand < 80 THEN 'bon' ELSE 'faible' END)
          ELSE                    (CASE WHEN v_rand < 5  THEN 'excellent' WHEN v_rand < 35 THEN 'bon' ELSE 'faible' END)
        END;

        -- ─── Discipline (vigilance) ──────────────────────────────────
        v_rand := floor(random() * 100)::int;
        v_discipline := CASE
          WHEN v_profile = 1 THEN (CASE WHEN v_rand < 80 THEN 'concentre' WHEN v_rand < 95 THEN 'moyen' ELSE 'distrait' END)
          WHEN v_profile = 2 THEN (CASE WHEN v_rand < 40 THEN 'concentre' WHEN v_rand < 80 THEN 'moyen' ELSE 'distrait' END)
          ELSE                    (CASE WHEN v_rand < 15 THEN 'concentre' WHEN v_rand < 50 THEN 'moyen' ELSE 'distrait' END)
        END;

        -- ─── Attitude ────────────────────────────────────────────────
        v_rand := floor(random() * 100)::int;
        v_attitude := CASE
          WHEN v_profile = 1 THEN (CASE WHEN v_rand < 95 THEN 'correct' WHEN v_rand < 98 THEN 'bavarre' ELSE 'perturbateur' END)
          WHEN v_profile = 2 THEN (CASE WHEN v_rand < 80 THEN 'correct' WHEN v_rand < 92 THEN 'bavarre' ELSE 'perturbateur' END)
          ELSE                    (CASE WHEN v_rand < 55 THEN 'correct' WHEN v_rand < 80 THEN 'bavarre' ELSE 'perturbateur' END)
        END;

        -- ─── Devoirs ────────────────────────────────────────────────
        v_rand := floor(random() * 100)::int;
        v_homework := CASE
          WHEN v_profile = 1 THEN (CASE WHEN v_rand < 90 THEN 'done' WHEN v_rand < 97 THEN 'partial' ELSE 'not_done' END)
          WHEN v_profile = 2 THEN (CASE WHEN v_rand < 65 THEN 'done' WHEN v_rand < 88 THEN 'partial' ELSE 'not_done' END)
          ELSE                    (CASE WHEN v_rand < 30 THEN 'done' WHEN v_rand < 60 THEN 'partial' ELSE 'not_done' END)
        END;

        -- ─── Statut de travail (lié à l'engagement) ──────────────────
        v_rand := floor(random() * 100)::int;
        v_work := CASE
          WHEN v_profile = 1 THEN (CASE WHEN v_rand < 70 THEN 'excellent' WHEN v_rand < 95 THEN 'good' ELSE 'average' END)
          WHEN v_profile = 2 THEN (CASE WHEN v_rand < 20 THEN 'excellent' WHEN v_rand < 75 THEN 'good' WHEN v_rand < 95 THEN 'average' ELSE 'poor' END)
          ELSE                    (CASE WHEN v_rand < 5  THEN 'excellent' WHEN v_rand < 30 THEN 'good' WHEN v_rand < 70 THEN 'average' ELSE 'poor' END)
        END;

        INSERT INTO session_tracking (
          session_id, student_id,
          presence, participation, discipline, attitude, homework, work_status,
          phone_use
        ) VALUES (
          v_session_id, r_student.id,
          v_presence, v_participation, v_discipline, v_attitude, v_homework, v_work,
          (random() < 0.05)  -- 5% phone usage
        );
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE '✅ SEED TRACKING TERMINÉ';
  RAISE NOTICE '   Classe : TEST 2BAC PC BIOF';
  RAISE NOTICE '   16 séances × 9 matières × 18 élèves';
  RAISE NOTICE '   = % entrées de suivi rapide créées',
    (SELECT COUNT(*) FROM session_tracking st
       JOIN sessions s ON s.id = st.session_id
      WHERE s.class_id = v_class_id);
  RAISE NOTICE '════════════════════════════════════════════';
END $$;
