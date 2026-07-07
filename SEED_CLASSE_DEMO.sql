-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  SEED CLASSE DÉMO — école principale UNIQUEMENT                           ║
-- ║                                                                           ║
-- ║  Crée dans UNE seule école (v_school_name ci-dessous) :                   ║
-- ║   • 1 classe « CLASSE DÉMO » (5AEP) — 50 élèves marocains réalistes       ║
-- ║     (Massar D2026xxx + secret, genre, naissance, inscriptions 2025/2026)  ║
-- ║   • 3 profs démo (Math, Français, Arabe) + contrôles + notes              ║
-- ║   • 24 séances + suivi rapide complet (présence, participation…)          ║
-- ║   • Finance : modèle de frais + plans + factures sept→juin + paiements    ║
-- ║     variés (payé / partiel / impayé) pour simuler encaissement réel       ║
-- ║   • Transport : 1 bus démo + 20 élèves affectés + géolocalisation         ║
-- ║   • 1 directeur : +212641998700 / directeur.demo@… / Directeur2026        ║
-- ║   • Config « QR parent démo » (table demo_parent_configs) :               ║
-- ║     mot-clé WhatsApp « DEMO PARENT » → onboarding parent automatique      ║
-- ║                                                                           ║
-- ║  Idempotent : ré-exécutable, supprime d'abord les anciennes données démo. ║
-- ║  Tout est tagué : emails @eductrack.demo, factures DEMO-…, bus DEMO-BUS.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Table de configuration du mode démo (le backend la lit à chaque message
-- WhatsApp entrant : présence d'une ligne enabled = école démo).
CREATE TABLE IF NOT EXISTS public.demo_parent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL DEFAULT 'DEMO PARENT',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
DECLARE
  -- ────────────────────────── PARAMÈTRES À AJUSTER ──────────────────────────
  v_school_id   UUID := '6d3292a5-848a-4b84-9dd5-3b59525459f9'; -- École Principale (prioritaire sur le nom)
  v_school_name TEXT := NULL;            -- utilisé seulement si v_school_id est NULL ; NULL = école avec session WhatsApp connectée
  v_year        TEXT := '2025/2026';     -- année scolaire (format slash = classes/inscriptions)
  v_year_dash   TEXT := '2025-2026';     -- même année au format finance (tiret)
  v_level       TEXT := '5AEP';
  v_class_name  TEXT := 'CLASSE DÉMO';
  v_director_phone TEXT := '+212641998700';
  -- ───────────────────────────────────────────────────────────────────────────

  v_class_id    UUID;
  v_domain      TEXT;
  v_director_id UUID;
  v_teacher_id  UUID;
  v_subject_id  UUID;
  v_student_id  UUID;
  v_bus_id      UUID;
  v_plan_id     UUID;
  v_invoice_id  UUID;
  v_session_id  UUID;
  v_email       TEXT;
  v_first       TEXT;
  v_last        TEXT;
  v_gender      TEXT;
  v_massar      TEXT;
  v_pwd         TEXT;             -- hash bcrypt partagé (mot de passe « Demo2026 »)
  v_pwd_dir     TEXT;             -- hash du directeur (« Directeur2026 »)
  v_has_transport BOOLEAN;
  v_payer       INT;              -- 1 = payeur complet, 2 = partiel, 3 = en retard
  v_profile     INT;              -- 1 = fort, 2 = moyen, 3 = faible
  v_total       NUMERIC;
  v_paid        NUMERIC;
  v_inv_num     INT := 0;
  v_rec_num     INT := 0;
  v_month       INT;
  v_due         DATE;
  v_rand        INT;
  i             INT;
  m             INT;

  v_boys  TEXT[] := ARRAY['Youssef','Mehdi','Anas','Othmane','Reda','Ayoub','Hamza','Ilyas','Adam','Omar',
                          'Zakaria','Amine','Bilal','Karim','Nizar','Saad','Taha','Walid','Yassine','Ziyad',
                          'Ismail','Jad','Marouane','Nabil','Rayan'];
  v_girls TEXT[] := ARRAY['Salma','Imane','Hajar','Nour','Aya','Sara','Lina','Yasmine','Maryam','Douae',
                          'Ghita','Hiba','Ines','Jihane','Kenza','Lamia','Malak','Nada','Rim','Safae',
                          'Soundous','Wissal','Zineb','Chaima','Asmae'];
  v_lasts TEXT[] := ARRAY['El Amrani','Bennis','Tazi','Cherkaoui','Berrada','El Fassi','Lahlou','Sebti','Benjelloun','Idrissi',
                          'Naciri','Alaoui','El Khayat','Belmekki','Ouazzani','Sqalli','Filali','Bouhlal','Chraibi','Kettani',
                          'Benkirane','Lamrani','Skalli','Tahiri','Zniber','Bennani','Guessous','Mekouar','Benslimane','Andaloussi',
                          'Berrichi','Chami','Drissi','El Alami','Fassi Fihri','Hajji','Iraqi','Jamai','Kabbaj','Lazrak',
                          'Mernissi','Naji','Ouali','Rhoul','Saidi','Temsamani','Wahbi','Yacoubi','Zerouali','Benchekroun'];
  v_subjects TEXT[] := ARRAY['Mathématiques','Français','Arabe'];
  v_subject  TEXT;
BEGIN
  -- ─── 1. École cible ────────────────────────────────────────────────────────
  IF v_school_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM schools WHERE id = v_school_id) THEN
      RAISE EXCEPTION 'École id % introuvable. Vérifie v_school_id.', v_school_id;
    END IF;
  ELSIF v_school_name IS NOT NULL THEN
    SELECT id INTO v_school_id FROM schools WHERE name ILIKE v_school_name LIMIT 1;
    IF v_school_id IS NULL THEN
      RAISE EXCEPTION 'École « % » introuvable. Vérifie v_school_name.', v_school_name;
    END IF;
  ELSE
    SELECT school_id INTO v_school_id
    FROM whatsapp_school_sessions
    WHERE status = 'connected'
    ORDER BY last_connected_at DESC NULLS LAST
    LIMIT 1;
    IF v_school_id IS NULL THEN
      RAISE EXCEPTION 'Aucune session WhatsApp connectée. Renseigne v_school_name en haut du script.';
    END IF;
  END IF;

  SELECT lower(regexp_replace(coalesce(name, 'ecole'), '[^a-zA-Z0-9]', '', 'g')) || '.ma'
    INTO v_domain FROM schools WHERE id = v_school_id;

  RAISE NOTICE '✓ École cible : % (domaine %)', v_school_id, v_domain;

  -- Mots de passe réels (login possible) : élèves/profs « Demo2026 », directeur « Directeur2026 »
  v_pwd     := crypt('Demo2026', gen_salt('bf'));
  v_pwd_dir := crypt('Directeur2026', gen_salt('bf'));

  -- ─── 2. Nettoyage (re-seed) ────────────────────────────────────────────────
  -- Les FK ON DELETE CASCADE emportent : enrollments, factures, paiements,
  -- affectations bus, suivi, notes, liens parents…
  DELETE FROM demo_parent_configs WHERE school_id = v_school_id;
  DELETE FROM profiles   WHERE email LIKE '%@eductrack.demo';
  DELETE FROM auth.users WHERE email LIKE '%@eductrack.demo';
  DELETE FROM buses      WHERE school_id = v_school_id AND plate_number = 'DEMO-BUS';
  DELETE FROM fee_templates WHERE school_id = v_school_id AND name = 'Frais CLASSE DÉMO';
  DELETE FROM classes    WHERE school_id = v_school_id AND name = v_class_name;

  -- ─── 3. Classe ─────────────────────────────────────────────────────────────
  INSERT INTO classes (school_id, name, level, academic_year)
  VALUES (v_school_id, v_class_name, v_level, v_year)
  RETURNING id INTO v_class_id;
  RAISE NOTICE '✓ Classe créée : %', v_class_id;

  -- ─── 4. Directeur (+212641998700) ─────────────────────────────────────────
  v_director_id := gen_random_uuid();
  v_email := 'directeur.demo@eductrack.demo';
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current
  ) VALUES (
    v_director_id, '00000000-0000-0000-0000-000000000000', v_email, v_pwd_dir, now(),
    now(), now(), 'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('first_name','Directeur','last_name','Démo','role','pedagogical_director'),
    '', '', '', '', ''
  );
  INSERT INTO profiles (id, email, first_name, last_name, role, school_id, phone)
  VALUES (v_director_id, v_email, 'Directeur', 'Démo', 'pedagogical_director', v_school_id, v_director_phone);
  RAISE NOTICE '✓ Directeur créé : % / Directeur2026 (tél %)', v_email, v_director_phone;

  -- ─── 5. Bus démo ───────────────────────────────────────────────────────────
  INSERT INTO buses (school_id, plate_number, model, capacity, color, status, notes)
  VALUES (v_school_id, 'DEMO-BUS', 'Mercedes Sprinter', 30, '#F59E0B', 'active', 'Bus de démonstration')
  RETURNING id INTO v_bus_id;

  -- ─── 6. Modèle de frais (finance = année au format TIRET) ─────────────────
  INSERT INTO fee_templates (school_id, name, description, academic_year, level, is_active)
  VALUES (v_school_id, 'Frais CLASSE DÉMO', 'Modèle de démonstration', v_year_dash, v_level, true)
  RETURNING id INTO v_plan_id;  -- réutilisé temporairement comme template_id
  INSERT INTO fee_template_items (template_id, category, name, amount, recurrence, due_month, start_month, end_month, sort_order) VALUES
    (v_plan_id, 'registration', 'Frais d''inscription', 800, 'one_time', 9, 9, 9, 0),
    (v_plan_id, 'tuition',      'Scolarité mensuelle',  450, 'monthly', NULL, 9, 6, 1),
    (v_plan_id, 'transport',    'Transport scolaire',   200, 'monthly', NULL, 9, 6, 2);

  -- ─── 7. Les 50 élèves ──────────────────────────────────────────────────────
  FOR i IN 1..50 LOOP
    v_student_id := gen_random_uuid();
    IF i % 2 = 1 THEN
      v_first := v_boys[(i + 1) / 2]; v_gender := 'M';
    ELSE
      v_first := v_girls[i / 2]; v_gender := 'F';
    END IF;
    v_last   := v_lasts[i];
    v_massar := 'D2026' || lpad(i::text, 3, '0');
    v_email  := 'eleve.demo.' || lpad(i::text, 2, '0') || '@eductrack.demo';
    v_has_transport := (i <= 20);

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current
    ) VALUES (
      v_student_id, '00000000-0000-0000-0000-000000000000', v_email, v_pwd, now(),
      now(), now(), 'authenticated', 'authenticated',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('first_name', v_first, 'last_name', v_last, 'role', 'student', 'massar_code', v_massar),
      '', '', '', '', ''
    );

    INSERT INTO profiles (
      id, email, first_name, last_name, role, school_id, class_id,
      massar_code, date_of_birth, import_order
    ) VALUES (
      v_student_id, v_email, v_first, v_last, 'student', v_school_id, v_class_id,
      v_massar, (DATE '2014-01-01' + (floor(random() * 900))::int), i
    );

    -- Colonnes optionnelles (migrations récentes) — ignorées si absentes
    BEGIN
      UPDATE profiles SET gender = v_gender, birth_place = 'Casablanca' WHERE id = v_student_id;
    EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN
      UPDATE profiles SET massar_secret = upper(substr(md5(random()::text), 1, 8)) WHERE id = v_student_id;
    EXCEPTION WHEN undefined_column THEN NULL; END;
    IF v_has_transport THEN
      BEGIN
        UPDATE profiles SET
          home_lat = 33.5731 + (random() - 0.5) * 0.08,
          home_lng = -7.5898 + (random() - 0.5) * 0.08
        WHERE id = v_student_id;
      EXCEPTION WHEN undefined_column THEN NULL; END;
    END IF;

    -- Inscription année active (roster « Élèves » + finance)
    INSERT INTO student_enrollments (school_id, student_id, class_id, academic_year, status)
    VALUES (v_school_id, v_student_id, v_class_id, v_year, 'NI')
    ON CONFLICT (student_id, academic_year) DO NOTHING;

    -- Affectation bus (20 premiers élèves)
    IF v_has_transport THEN
      INSERT INTO bus_assignments (bus_id, student_id, school_id, direction, pickup_order)
      VALUES (v_bus_id, v_student_id, v_school_id, 'both', i);
    END IF;

    -- ── Plan de frais + factures sept→juin + paiements ──
    INSERT INTO student_fee_plans (school_id, student_id, template_id, academic_year, status)
    VALUES (v_school_id, v_student_id, v_plan_id, v_year_dash, 'active')
    RETURNING id INTO v_invoice_id;  -- réutilisé temporairement comme plan id

    -- Profil payeur : 1-30 complet, 31-42 partiel (payé → février), 43-50 en retard (sept seul)
    v_payer := CASE WHEN i <= 30 THEN 1 WHEN i <= 42 THEN 2 ELSE 3 END;

    FOR m IN 0..9 LOOP  -- m=0 → septembre … m=9 → juin
      v_month := CASE WHEN m <= 3 THEN 9 + m ELSE m - 3 END;
      v_due   := make_date(CASE WHEN m <= 3 THEN 2025 ELSE 2026 END, v_month, 5);
      v_total := 450 + (CASE WHEN v_has_transport THEN 200 ELSE 0 END)
                     + (CASE WHEN m = 0 THEN 800 ELSE 0 END);

      -- Payé ? complet : tout | partiel : sept→janv complet, févr moitié | retard : sept seulement
      v_paid := CASE
        WHEN v_payer = 1 THEN v_total
        WHEN v_payer = 2 AND m <= 4 THEN v_total
        WHEN v_payer = 2 AND m = 5 THEN round(v_total / 2)
        WHEN v_payer = 3 AND m = 0 THEN v_total
        ELSE 0
      END;

      v_inv_num := v_inv_num + 1;
      INSERT INTO invoices (
        school_id, invoice_number, student_id, plan_id, issue_date, due_date,
        period_label, subtotal, discount, total, amount_paid, status
      ) VALUES (
        v_school_id, 'DEMO-' || lpad(v_inv_num::text, 4, '0'), v_student_id, v_invoice_id,
        v_due - 10, v_due,
        trim(to_char(v_due, 'TMMonth YYYY')), v_total, 0, v_total, v_paid,
        CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial'
             WHEN v_due < CURRENT_DATE THEN 'overdue' ELSE 'issued' END
      ) RETURNING id INTO v_session_id;  -- réutilisé temporairement comme invoice id

      INSERT INTO invoice_lines (invoice_id, description, category, unit_price, amount, sort_order)
      VALUES (v_session_id, 'Scolarité mensuelle', 'tuition', 450, 450, 0);
      IF v_has_transport THEN
        INSERT INTO invoice_lines (invoice_id, description, category, unit_price, amount, sort_order)
        VALUES (v_session_id, 'Transport scolaire', 'transport', 200, 200, 1);
      END IF;
      IF m = 0 THEN
        INSERT INTO invoice_lines (invoice_id, description, category, unit_price, amount, sort_order)
        VALUES (v_session_id, 'Frais d''inscription', 'registration', 800, 800, 2);
      END IF;

      IF v_paid > 0 THEN
        v_rec_num := v_rec_num + 1;
        INSERT INTO payments (
          school_id, receipt_number, invoice_id, student_id, amount,
          payment_date, method, status
        ) VALUES (
          v_school_id, 'DEMO-R-' || lpad(v_rec_num::text, 4, '0'), v_session_id, v_student_id, v_paid,
          v_due + (floor(random() * 6))::int, (ARRAY['cash','transfer','check'])[1 + (i % 3)], 'confirmed'
        );
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE '✓ 50 élèves créés (inscriptions, finance, transport)';

  -- ─── 8. Profs + matières + contrôles + notes + séances + suivi ────────────
  FOREACH v_subject IN ARRAY v_subjects LOOP
    SELECT id INTO v_subject_id FROM subjects WHERE school_id = v_school_id AND name = v_subject LIMIT 1;
    IF v_subject_id IS NULL THEN
      INSERT INTO subjects (school_id, name, code)
      VALUES (v_school_id, v_subject,
              upper(substr(regexp_replace(v_subject, '[^a-zA-Z]', '', 'g'), 1, 6)) || '_' || substr(md5(random()::text), 1, 4))
      RETURNING id INTO v_subject_id;
    END IF;

    v_teacher_id := gen_random_uuid();
    v_email := 'prof.demo.' || lower(regexp_replace(v_subject, '[^a-zA-Z]', '', 'g')) || '@eductrack.demo';
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current
    ) VALUES (
      v_teacher_id, '00000000-0000-0000-0000-000000000000', v_email, v_pwd, now(),
      now(), now(), 'authenticated', 'authenticated',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('first_name','Prof Démo','last_name',v_subject,'role','teacher'),
      '', '', '', '', ''
    );
    INSERT INTO profiles (id, email, first_name, last_name, role, school_id)
    VALUES (v_teacher_id, v_email, 'Prof Démo', v_subject, 'teacher', v_school_id);
    INSERT INTO teacher_subjects (teacher_id, subject_id) VALUES (v_teacher_id, v_subject_id);

    -- 2 contrôles S1 + notes pour les 50 élèves
    FOR m IN 1..2 LOOP
      INSERT INTO controls_plan (teacher_id, class_id, name, date, kind, status)
      VALUES (v_teacher_id, v_class_id, v_subject || ' — Contrôle S1 #' || m,
              make_date(2025, 9 + m, 20), 'control', 'completed')
      RETURNING id INTO v_session_id;  -- réutilisé comme control id
      INSERT INTO control_notes (control_id, student_id, note)
      SELECT v_session_id, p.id,
        round((CASE WHEN p.import_order % 3 = 1 THEN 13 + random() * 6
                    WHEN p.import_order % 3 = 2 THEN 10 + random() * 5
                    ELSE 6 + random() * 6 END)::numeric, 2)
      FROM profiles p WHERE p.class_id = v_class_id AND p.role = 'student';
    END LOOP;

    -- 8 séances + suivi rapide par élève
    FOR m IN 1..8 LOOP
      INSERT INTO sessions (class_id, teacher_id, subject_id, date, start_time, end_time, topic)
      VALUES (v_class_id, v_teacher_id, v_subject_id,
              DATE '2025-09-08' + ((m - 1) * 7), TIME '08:00', TIME '09:00',
              v_subject || ' — Séance #' || m)
      RETURNING id INTO v_session_id;

      FOR v_student_id, v_profile IN
        SELECT p.id, 1 + (p.import_order % 3) FROM profiles p
        WHERE p.class_id = v_class_id AND p.role = 'student' ORDER BY p.import_order
      LOOP
        v_rand := floor(random() * 100)::int;
        INSERT INTO session_tracking (
          session_id, student_id, presence, participation, discipline, attitude, homework, work_status, phone_use
        ) VALUES (
          v_session_id, v_student_id,
          CASE WHEN v_profile = 1 THEN (CASE WHEN v_rand < 95 THEN 'present' WHEN v_rand < 98 THEN 'late' ELSE 'absent' END)
               WHEN v_profile = 2 THEN (CASE WHEN v_rand < 85 THEN 'present' WHEN v_rand < 92 THEN 'late' ELSE 'absent' END)
               ELSE                    (CASE WHEN v_rand < 70 THEN 'present' WHEN v_rand < 80 THEN 'late' ELSE 'absent' END) END,
          CASE WHEN v_profile = 1 THEN 'excellent' WHEN v_profile = 2 THEN 'bon' ELSE 'faible' END,
          CASE WHEN v_profile = 1 THEN 'concentre' WHEN v_profile = 2 THEN 'moyen' ELSE 'distrait' END,
          CASE WHEN v_profile = 3 AND v_rand < 30 THEN 'bavarre' ELSE 'correct' END,
          CASE WHEN v_profile = 1 THEN 'done' WHEN v_profile = 2 THEN 'partial' ELSE 'not_done' END,
          CASE WHEN v_profile = 1 THEN 'excellent' WHEN v_profile = 2 THEN 'good' ELSE 'average' END,
          (random() < 0.05)
        );
      END LOOP;
    END LOOP;
  END LOOP;
  RAISE NOTICE '✓ Profs, contrôles, notes, séances et suivi créés';

  -- ─── 9. Config année scolaire (si absente) ────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM school_year_config WHERE school_id = v_school_id AND academic_year = v_year) THEN
    INSERT INTO school_year_config (school_id, academic_year, semester_1_start, semester_1_end, semester_2_start, semester_2_end)
    VALUES (v_school_id, v_year, DATE '2025-09-01', DATE '2026-01-31', DATE '2026-02-01', DATE '2026-06-30');
  END IF;

  -- ─── 10. Activer le QR parent démo pour CETTE école uniquement ────────────
  INSERT INTO demo_parent_configs (school_id, class_id, keyword, enabled)
  VALUES (v_school_id, v_class_id, 'DEMO PARENT', TRUE)
  ON CONFLICT (school_id) DO UPDATE SET class_id = EXCLUDED.class_id, enabled = TRUE;

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE '✅ SEED CLASSE DÉMO TERMINÉ';
  RAISE NOTICE '   Classe : % (50 élèves, année %)', v_class_name, v_year;
  RAISE NOTICE '   Directeur : directeur.demo@eductrack.demo / Directeur2026';
  RAISE NOTICE '   Élèves/Profs : mot de passe Demo2026';
  RAISE NOTICE '   QR démo : mot-clé « DEMO PARENT » activé pour cette école';
  RAISE NOTICE '════════════════════════════════════════════════';
END $$;
