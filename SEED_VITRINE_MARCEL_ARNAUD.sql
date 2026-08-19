-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  VITRINE — GROUPE SCOLAIRE MARCEL ARNAUD (Casablanca)                    ║
-- ║                                                                           ║
-- ║  Remplit school_profile à partir des informations PUBLIQUES de l'école :  ║
-- ║   • Instagram  @marcel_arnaud21                                           ║
-- ║   • Facebook   GS Marcel Arnaud (id 100069353120031)                      ║
-- ║   • Telecontact.ma (fiche annuaire) + Google Maps (lien de la bio Insta)  ║
-- ║                                                                           ║
-- ║  Prérequis : ADD_SCHOOL_SHOWCASE.sql exécuté.                             ║
-- ║  Idempotent : ré-exécutable sans effet de bord.                           ║
-- ║                                                                           ║
-- ║  ⚠️ À FAIRE VALIDER PAR L'ÉCOLE avant diffusion par le chatbot :          ║
-- ║     e-mail, filières exactes du lycée, langues, atouts.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
  v_school_id   UUID := '56b3fb1d-5b37-44be-b1d8-2f62e99c5621'; -- MARCEL ARNAUD
  v_school_name TEXT;
BEGIN
  SELECT name INTO v_school_name FROM schools WHERE id = v_school_id;
  IF v_school_name IS NULL THEN
    RAISE EXCEPTION 'École % introuvable. Vérifie v_school_id.', v_school_id;
  END IF;

  -- Adresse de l'établissement (fiche annuaire + Google Maps)
  UPDATE schools
  SET address = COALESCE(address, '246, Bd du Fouarat, lot n°5, Hay Mohammadi, Casablanca 20250'),
      phone   = COALESCE(phone, '+212 5 22 60 45 15')
  WHERE id = v_school_id;

  INSERT INTO school_profile (
    school_id, about, success_rate, success_rate_year, success_rate_note,
    languages, advantages, filieres,
    contact_phone, contact_whatsapp, contact_email, website_url,
    facebook_url, instagram_url, tiktok_url, youtube_url, maps_url, updated_at
  ) VALUES (
    v_school_id,
    'Le Groupe Scolaire Marcel Arnaud est un établissement scolaire privé situé au 246, boulevard '
      || 'du Fouarat, lot n°5, Hay Mohammadi à Casablanca. Il accueille les élèves du préscolaire '
      || 'jusqu''au baccalauréat. Sa devise : « نحو التميز » — vers l''excellence. '
      || 'L''établissement a obtenu 100 % de réussite aux examens de fin de cycle de l''année '
      || 'scolaire 2025-2026 (6ème année primaire, 3ème année collège et 2ème année baccalauréat).',
    100.00,
    '2025-2026',
    'Examens de fin de cycle : 6ème année primaire, 3ème année collège et 2ème année baccalauréat (résultats publiés par l''école en juillet 2026)',
    ARRAY['Arabe', 'Français'],
    ARRAY[
      'Devise de l''établissement : « نحو التميز » — vers l''excellence',
      '100 % de réussite aux examens de fin de cycle 2025-2026 (6AP, 3AC, 2BAC)',
      'Un seul groupe scolaire du préscolaire au baccalauréat : pas de changement d''établissement entre les cycles',
      'Cérémonie de fin d''année, sorties et activités parascolaires tout au long de l''année',
      'Suivi des parents en temps réel (notes, absences, devoirs, paiements) sur l''application et WhatsApp'
    ],
    ARRAY[
      'Préscolaire (maternelle)',
      'Primaire : 1AP à 6AP',
      'Collège : 1AC, 2AC, 3AC',
      'Lycée : tronc commun, 1ère et 2ème année baccalauréat'
    ],
    '+212 5 22 60 45 15',                                   -- contact_phone (Telecontact)
    NULL,                                                    -- contact_whatsapp : à renseigner
    'ecolemarcelarnaud@gmail.com',                           -- à faire confirmer par l'école
    NULL,                                                    -- site web : marcelarnaud.com ne répond plus
    'https://www.facebook.com/profile.php?id=100069353120031',
    'https://www.instagram.com/marcel_arnaud21',
    NULL,
    NULL,
    'https://maps.app.goo.gl/2UsJWCrrLk3EFq3g8',
    NOW()
  )
  ON CONFLICT (school_id) DO UPDATE SET
    about             = EXCLUDED.about,
    success_rate      = EXCLUDED.success_rate,
    success_rate_year = EXCLUDED.success_rate_year,
    success_rate_note = EXCLUDED.success_rate_note,
    languages         = EXCLUDED.languages,
    advantages        = EXCLUDED.advantages,
    filieres          = EXCLUDED.filieres,
    -- Ce qui a déjà été saisi dans l'interface prime sur le script
    contact_phone     = COALESCE(school_profile.contact_phone,    EXCLUDED.contact_phone),
    contact_whatsapp  = COALESCE(school_profile.contact_whatsapp, EXCLUDED.contact_whatsapp),
    contact_email     = COALESCE(school_profile.contact_email,    EXCLUDED.contact_email),
    website_url       = COALESCE(school_profile.website_url,      EXCLUDED.website_url),
    facebook_url      = COALESCE(school_profile.facebook_url,     EXCLUDED.facebook_url),
    instagram_url     = COALESCE(school_profile.instagram_url,    EXCLUDED.instagram_url),
    maps_url          = COALESCE(school_profile.maps_url,         EXCLUDED.maps_url),
    updated_at        = NOW();

  RAISE NOTICE '✓ Vitrine enregistrée pour %', v_school_name;
END $$;

-- ── Vérification ────────────────────────────────────────────────────────────
-- SELECT * FROM school_profile WHERE school_id = '56b3fb1d-5b37-44be-b1d8-2f62e99c5621';
