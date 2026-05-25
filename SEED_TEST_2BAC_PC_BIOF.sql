-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  SEED TEST : Classe 2BAC PC BIOF avec données complètes                  ║
-- ║                                                                          ║
-- ║  Crée :                                                                  ║
-- ║   • 1 classe "2BAC PC BIOF Test" (filiere = pc)                          ║
-- ║   • 9 professeurs factices (1 par matière)                               ║
-- ║   • 18 élèves avec noms marocains réalistes + codes Massar               ║
-- ║   • 3 contrôles/matière/semestre × 2 semestres × 9 matières = 54 ctrls   ║
-- ║   • Notes pour tous les élèves sur tous les contrôles                    ║
-- ║                                                                          ║
-- ║  L'école choisie est celle qui a une session WhatsApp 'connected'.       ║
-- ║  Si plusieurs, prend la plus récemment connectée.                        ║
-- ║                                                                          ║
-- ║  Idempotent : on tag la classe avec le préfixe "TEST_" et on supprime    ║
-- ║  d'abord les anciennes données de test.                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
  v_school_id    UUID;
  v_class_id     UUID;
  v_year         TEXT := '2025/2026';
  v_password     TEXT := '$2a$10$abcdefghijklmnopqrstuv'; -- bcrypt placeholder, l'auth ne sert pas pour les calculs
  v_subjects     TEXT[] := ARRAY[
                    'Mathématiques','PC','SVT','Français','Anglais',
                    'Arabe','Philosophie','Éducation islamique','EPS'
                  ];
  v_subject      TEXT;
  v_subject_id   UUID;
  v_teacher_id   UUID;
  v_teacher_email TEXT;
  v_student_id   UUID;
  v_control_id   UUID;
  v_dates        DATE[];
  v_dt           DATE;
  v_kind         TEXT;
  i              INT;
  j              INT;

  -- Élèves marocains réalistes (Massar code, prénom, nom)
  v_students     TEXT[][] := ARRAY[
    ARRAY['M2025001','Youssef','El Amrani'],
    ARRAY['M2025002','Salma','Bennis'],
    ARRAY['M2025003','Mehdi','Tazi'],
    ARRAY['M2025004','Imane','Cherkaoui'],
    ARRAY['M2025005','Anas','Berrada'],
    ARRAY['M2025006','Hajar','El Fassi'],
    ARRAY['M2025007','Othmane','Lahlou'],
    ARRAY['M2025008','Nour','Sebti'],
    ARRAY['M2025009','Reda','Benjelloun'],
    ARRAY['M2025010','Aya','Idrissi'],
    ARRAY['M2025011','Ayoub','Naciri'],
    ARRAY['M2025012','Sara','Alaoui'],
    ARRAY['M2025013','Hamza','El Khayat'],
    ARRAY['M2025014','Lina','Belmekki'],
    ARRAY['M2025015','Ilyas','Ouazzani'],
    ARRAY['M2025016','Yasmine','Sqalli'],
    ARRAY['M2025017','Adam','Filali'],
    ARRAY['M2025018','Maryam','Bouhlal']
  ];

BEGIN
  -- ─── 1. Trouver l'école avec WhatsApp connecté ────────────────────────────
  SELECT school_id INTO v_school_id
  FROM whatsapp_school_sessions
  WHERE status = 'connected'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_school_id IS NULL THEN
    -- fallback : on prend la première école active
    SELECT id INTO v_school_id FROM schools WHERE status = 'active' OR status IS NULL ORDER BY created_at LIMIT 1;
  END IF;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Aucune école trouvée. Crée d''abord une école.';
  END IF;

  RAISE NOTICE '✓ École cible : %', v_school_id;

  -- ─── 2. Nettoyer les anciennes données de test (si re-seed) ──────────────
  DELETE FROM classes WHERE school_id = v_school_id AND name = 'TEST 2BAC PC BIOF';
  DELETE FROM profiles WHERE email LIKE 'test.bulletin.%@eductrack.test';
  DELETE FROM auth.users WHERE email LIKE 'test.bulletin.%@eductrack.test';

  -- ─── 3. Créer la classe ───────────────────────────────────────────────────
  INSERT INTO classes (school_id, name, level, filiere, academic_year)
  VALUES (v_school_id, 'TEST 2BAC PC BIOF', '2BAC', 'pc', v_year)
  RETURNING id INTO v_class_id;

  RAISE NOTICE '✓ Classe créée : %', v_class_id;

  -- ─── 4. Créer / récupérer les matières puis créer un prof par matière ────
  FOREACH v_subject IN ARRAY v_subjects LOOP
    -- Subject : créer si manquant pour cette école
    SELECT id INTO v_subject_id FROM subjects
      WHERE school_id = v_school_id AND name = v_subject LIMIT 1;
    IF v_subject_id IS NULL THEN
      INSERT INTO subjects (school_id, name, code)
      VALUES (
        v_school_id,
        v_subject,
        upper(substr(regexp_replace(v_subject, '[^a-zA-Z]', '', 'g'), 1, 6))
          || '_' || substr(md5(random()::text), 1, 4)
      )
      RETURNING id INTO v_subject_id;
    END IF;

    -- Prof factice : auth.users + profiles
    v_teacher_id := gen_random_uuid();
    v_teacher_email := 'test.bulletin.prof.' || lower(regexp_replace(v_subject, '[^a-zA-Z]', '', 'g')) || '@eductrack.test';

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      aud, role, raw_app_meta_data, raw_user_meta_data
    ) VALUES (
      v_teacher_id, '00000000-0000-0000-0000-000000000000', v_teacher_email, v_password,
      now(), now(), now(),
      'authenticated', 'authenticated',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('first_name','Prof Test','last_name',v_subject,'role','teacher')
    );

    INSERT INTO profiles (id, email, first_name, last_name, role, school_id)
    VALUES (v_teacher_id, v_teacher_email, 'Prof Test', v_subject, 'teacher', v_school_id);

    -- Mapping prof → matière
    INSERT INTO teacher_subjects (teacher_id, subject_id) VALUES (v_teacher_id, v_subject_id);

    -- ─── 5. Créer 3 contrôles + 1 activité par semestre ─────────────────
    -- S1 : oct, nov, déc 2025 (control), déc 2025 (activity)
    -- S2 : fév, mars, avr 2026 (control), mai 2026 (activity)
    v_dates := ARRAY[
      DATE '2025-10-15', DATE '2025-11-20', DATE '2025-12-18', DATE '2025-12-22',
      DATE '2026-02-12', DATE '2026-03-19', DATE '2026-04-16', DATE '2026-05-21'
    ];

    FOR i IN 1 .. array_length(v_dates, 1) LOOP
      v_dt := v_dates[i];
      -- Le 4e et le 8e date = activity, le reste = control
      IF i = 4 OR i = 8 THEN v_kind := 'activity'; ELSE v_kind := 'control'; END IF;

      INSERT INTO controls_plan (teacher_id, class_id, name, date, kind, status)
      VALUES (
        v_teacher_id, v_class_id,
        v_subject || ' — ' || (CASE WHEN v_kind='control' THEN 'Contrôle ' ELSE 'Activité ' END)
                  || (CASE WHEN i <= 4 THEN 'S1' ELSE 'S2' END) || ' #'
                  || (CASE WHEN v_kind='control' THEN i % 4 + 1 ELSE 1 END)::text,
        v_dt, v_kind, 'completed'
      );
    END LOOP;
  END LOOP;

  RAISE NOTICE '✓ Profs et contrôles créés';

  -- ─── 7. Créer les élèves ─────────────────────────────────────────────────
  FOR j IN 1 .. array_length(v_students, 1) LOOP
    v_student_id := gen_random_uuid();
    v_teacher_email := 'test.bulletin.eleve.' || v_students[j][1] || '@eductrack.test';

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      aud, role, raw_app_meta_data, raw_user_meta_data
    ) VALUES (
      v_student_id, '00000000-0000-0000-0000-000000000000', v_teacher_email, v_password,
      now(), now(), now(),
      'authenticated', 'authenticated',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'first_name', v_students[j][2],
        'last_name',  v_students[j][3],
        'role',       'student',
        'massar_code', v_students[j][1]
      )
    );

    INSERT INTO profiles (
      id, email, first_name, last_name, role,
      school_id, class_id, massar_code
    ) VALUES (
      v_student_id, v_teacher_email, v_students[j][2], v_students[j][3], 'student',
      v_school_id, v_class_id, v_students[j][1]
    );
  END LOOP;

  RAISE NOTICE '✓ % élèves créés', array_length(v_students, 1);

  -- ─── 8. Insérer toutes les notes (passe 2) ───────────────────────────────
  INSERT INTO control_notes (control_id, student_id, note)
  SELECT
    cp.id,
    p.id,
    ROUND(
      (CASE
        WHEN p.massar_code IN ('M2025001','M2025002','M2025003','M2025004','M2025005','M2025006')
          THEN 13 + (random() * 6)
        WHEN p.massar_code IN ('M2025007','M2025008','M2025009','M2025010','M2025011','M2025012')
          THEN 10 + (random() * 5)
        ELSE
          6 + (random() * 6)
      END)::numeric, 2
    )
  FROM controls_plan cp
  CROSS JOIN profiles p
  WHERE cp.class_id = v_class_id
    AND p.class_id  = v_class_id
    AND p.role = 'student';

  RAISE NOTICE '✓ Notes générées';

  -- ─── 9. S'assurer que la config année scolaire existe pour cette école ──
  INSERT INTO school_year_config (
    school_id, academic_year,
    semester_1_start, semester_1_end,
    semester_2_start, semester_2_end
  ) VALUES (
    v_school_id, v_year,
    DATE '2025-09-08', DATE '2026-01-16',
    DATE '2026-01-19', DATE '2026-06-26'
  )
  ON CONFLICT (school_id, academic_year) DO NOTHING;

  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE '✅ SEED TERMINÉ';
  RAISE NOTICE '   École     : %', v_school_id;
  RAISE NOTICE '   Classe    : TEST 2BAC PC BIOF (id=%)', v_class_id;
  RAISE NOTICE '   Élèves    : %', array_length(v_students, 1);
  RAISE NOTICE '   Matières  : %', array_length(v_subjects, 1);
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE '👉 Prochaines étapes :';
  RAISE NOTICE '   1. /admin/coefficients  → vérifier que les défauts MEN sont chargés (sinon "Importer défauts MEN")';
  RAISE NOTICE '   2. /admin/bulletins     → choisir TEST 2BAC PC BIOF, S1 → Générer';
  RAISE NOTICE '   3. Cliquer sur l''œil pour voir le PDF, puis Publier, puis Envoyer WhatsApp';
END $$;
