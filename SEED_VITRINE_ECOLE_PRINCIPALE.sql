-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  VITRINE — École Principale (école de démonstration)                      ║
-- ║                                                                           ║
-- ║  Remplit ce que le chatbot IA sert aux NUMÉROS INCONNUS (futurs parents,  ║
-- ║  visiteurs) et aux parents rattachés :                                    ║
-- ║   • school_profile         → présentation, résultats, atouts, filières,   ║
-- ║                              contacts et réseaux sociaux                  ║
-- ║   • school_showcase_items  → rubriques illustrées (cantine, salles,       ║
-- ║                              équipements, sport, transport, activités)    ║
-- ║     créées SANS photo : vous ajoutez l'image depuis                       ║
-- ║     Communication → Vitrine école → « Remplacer l'image »                 ║
-- ║   • public_chatbot_enabled = true → le chatbot répond aux inconnus        ║
-- ║                                                                           ║
-- ║  Prérequis : ADD_SCHOOL_SHOWCASE.sql et ADD_CHATBOT_KNOWLEDGE.sql exécutés.║
-- ║                                                                           ║
-- ║  ⚠️ CONTENU DE DÉMONSTRATION : les textes ci-dessous sont un modèle        ║
-- ║  réaliste, PAS les chiffres réels de l'établissement. Le chatbot les       ║
-- ║  enverra tels quels à de vraies personnes → relisez et corrigez           ║
-- ║  (taux de réussite, effectifs, équipements) avant tout usage public.      ║
-- ║                                                                           ║
-- ║  Idempotent : ré-exécutable. Ne supprime QUE les rubriques semées ici et   ║
-- ║  encore sans photo (vos photos et vos propres rubriques sont préservées).  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
  -- ────────────────────────── PARAMÈTRES À AJUSTER ──────────────────────────
  v_school_id   UUID := '6d3292a5-848a-4b84-9dd5-3b59525459f9'; -- École Principale
  v_school_name TEXT;
  -- Coordonnées réellement connues de l'établissement.
  -- Laissez NULL tout ce que vous n'avez pas encore : le chatbot n'affiche que
  -- les lignes renseignées, alors qu'une URL inventée serait envoyée aux parents.
  v_phone       TEXT := NULL;                    -- ex. '+212 5 22 00 00 00'
  v_whatsapp    TEXT := '+212 641 998 700';      -- numéro WhatsApp de l'école (Baileys)
  v_email       TEXT := NULL;                    -- ex. 'contact@ecole-principale.ma'
  v_website     TEXT := NULL;
  v_facebook    TEXT := NULL;
  v_instagram   TEXT := NULL;
  v_tiktok      TEXT := NULL;
  v_youtube     TEXT := NULL;
  v_maps        TEXT := NULL;                    -- calculé plus bas depuis lat/lng
  -- ───────────────────────────────────────────────────────────────────────────

  v_lat NUMERIC;
  v_lng NUMERIC;
  v_seeded INT;
BEGIN
  SELECT name, lat, lng INTO v_school_name, v_lat, v_lng
  FROM schools WHERE id = v_school_id;

  IF v_school_name IS NULL THEN
    RAISE EXCEPTION 'École % introuvable. Vérifie v_school_id.', v_school_id;
  END IF;

  -- Lien Google Maps construit depuis la position enregistrée de l'école
  IF v_maps IS NULL AND v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
    v_maps := 'https://www.google.com/maps?q=' || v_lat || ',' || v_lng;
  END IF;

  -- ─── 1. Informations générales ─────────────────────────────────────────────
  INSERT INTO school_profile (
    school_id, about, success_rate, success_rate_year, success_rate_note,
    languages, advantages, filieres,
    contact_phone, contact_whatsapp, contact_email, website_url,
    facebook_url, instagram_url, tiktok_url, youtube_url, maps_url, updated_at
  ) VALUES (
    v_school_id,
    v_school_name || ' est un établissement privé marocain qui accueille les élèves de la maternelle '
      || 'au baccalauréat. Notre projet éducatif repose sur trois piliers : la maîtrise des langues, '
      || 'l''accompagnement individuel de chaque élève et une communication permanente avec les familles. '
      || 'Les parents suivent en temps réel les notes, les absences, les devoirs et les paiements depuis '
      || 'leur téléphone.',
    96.5,                              -- ⚠️ taux de démonstration : à remplacer
    '2025-2026',
    'Baccalauréat — session de juin, toutes filières confondues',
    ARRAY['Arabe', 'Français', 'Anglais'],
    ARRAY[
      'Enseignement trilingue dès la maternelle (arabe, français, anglais)',
      'Effectifs limités à 25 élèves par classe',
      'Suivi quotidien des parents sur application mobile et WhatsApp',
      'Séances de soutien et de remise à niveau incluses',
      'Cantine préparée sur place et transport scolaire géolocalisé',
      'Salles équipées de tableaux interactifs et laboratoires de sciences',
      'Clubs et activités parascolaires tous les samedis matin'
    ],
    ARRAY[
      'Préscolaire : PS, MS, GS',
      'Primaire : 1AP à 6AP',
      'Collège : 1AC, 2AC, 3AC',
      'Tronc commun scientifique',
      '1ère et 2ème année baccalauréat — Sciences Mathématiques',
      '1ère et 2ème année baccalauréat — Sciences Physiques (PC)',
      '1ère et 2ème année baccalauréat — Sciences de la Vie et de la Terre (SVT)',
      '1ère et 2ème année baccalauréat — Lettres et Sciences Humaines'
    ],
    v_phone, v_whatsapp, v_email, v_website,
    v_facebook, v_instagram, v_tiktok, v_youtube, v_maps, NOW()
  )
  ON CONFLICT (school_id) DO UPDATE SET
    about             = EXCLUDED.about,
    success_rate      = EXCLUDED.success_rate,
    success_rate_year = EXCLUDED.success_rate_year,
    success_rate_note = EXCLUDED.success_rate_note,
    languages         = EXCLUDED.languages,
    advantages        = EXCLUDED.advantages,
    filieres          = EXCLUDED.filieres,
    -- Les coordonnées déjà saisies dans l'interface priment sur les valeurs du script
    contact_phone     = COALESCE(school_profile.contact_phone, EXCLUDED.contact_phone),
    contact_whatsapp  = COALESCE(school_profile.contact_whatsapp, EXCLUDED.contact_whatsapp),
    contact_email     = COALESCE(school_profile.contact_email, EXCLUDED.contact_email),
    website_url       = COALESCE(school_profile.website_url, EXCLUDED.website_url),
    facebook_url      = COALESCE(school_profile.facebook_url, EXCLUDED.facebook_url),
    instagram_url     = COALESCE(school_profile.instagram_url, EXCLUDED.instagram_url),
    tiktok_url        = COALESCE(school_profile.tiktok_url, EXCLUDED.tiktok_url),
    youtube_url       = COALESCE(school_profile.youtube_url, EXCLUDED.youtube_url),
    maps_url          = COALESCE(school_profile.maps_url, EXCLUDED.maps_url),
    updated_at        = NOW();

  RAISE NOTICE '✓ Fiche générale enregistrée pour %', v_school_name;

  -- ─── 2. Rubriques illustrées (photos à ajouter dans l'interface) ───────────
  -- On ne retire que les rubriques semées par ce script ET encore sans image :
  -- dès que vous avez mis une photo, la rubrique est à vous, le script n'y touche plus.
  DELETE FROM school_showcase_items
  WHERE school_id = v_school_id
    AND extra->>'seed' = 'vitrine-demo'
    AND image_url IS NULL;

  INSERT INTO school_showcase_items
    (school_id, category, title, description, sort_order, is_published, is_public, extra)
  VALUES
    -- 🍽️ Cantine
    (v_school_id, 'cantine', 'Réfectoire de l''école',
     'Un réfectoire lumineux, en deux services : primaire puis collège et lycée.',
     1, true, true, '{"seed":"vitrine-demo"}'::jsonb),
    (v_school_id, 'cantine', 'Cuisine préparée sur place',
     'Les repas sont cuisinés chaque jour sur place, avec des produits frais et un contrôle d''hygiène régulier.',
     2, true, true, '{"seed":"vitrine-demo"}'::jsonb),
    (v_school_id, 'cantine', 'Menus équilibrés de la semaine',
     'Le menu est communiqué chaque semaine aux familles ; les régimes particuliers signalés sont pris en compte.',
     3, true, true, '{"seed":"vitrine-demo"}'::jsonb),

    -- 🏫 Salles & locaux (les « compartiments » de l'école)
    (v_school_id, 'salle', 'Salles de classe',
     'Salles claires et spacieuses, 25 élèves au maximum par classe.',
     1, true, true, '{"seed":"vitrine-demo"}'::jsonb),
    (v_school_id, 'salle', 'Bibliothèque',
     'Un espace de lecture et de travail ouvert aux élèves pendant les heures libres.',
     2, true, true, '{"seed":"vitrine-demo"}'::jsonb),
    (v_school_id, 'salle', 'Cour de récréation',
     'Une cour sécurisée et surveillée, séparée pour les petits et les grands.',
     3, true, true, '{"seed":"vitrine-demo"}'::jsonb),
    (v_school_id, 'salle', 'Infirmerie',
     'Un espace de premiers soins ; les parents sont prévenus immédiatement en cas de malaise.',
     4, true, true, '{"seed":"vitrine-demo"}'::jsonb),
    (v_school_id, 'salle', 'Espace maternelle',
     'Un bâtiment dédié aux tout-petits, avec coin jeux et matériel adapté.',
     5, true, true, '{"seed":"vitrine-demo"}'::jsonb),

    -- 🖥️ Équipements pédagogiques
    (v_school_id, 'equipement', 'Tableaux interactifs',
     'Les classes sont équipées de tableaux interactifs pour des cours plus visuels.',
     1, true, true, '{"seed":"vitrine-demo"}'::jsonb),
    (v_school_id, 'equipement', 'Salle informatique',
     'Postes individuels et connexion internet filtrée pour les cours d''informatique.',
     2, true, true, '{"seed":"vitrine-demo"}'::jsonb),
    (v_school_id, 'equipement', 'Laboratoire de sciences',
     'Travaux pratiques de physique-chimie et de SVT en blouse, dès le collège.',
     3, true, true, '{"seed":"vitrine-demo"}'::jsonb),

    -- ⚽ Sport
    (v_school_id, 'sport', 'Terrain multisports',
     'Football, basket et handball pendant les séances d''EPS et les activités du samedi.',
     1, true, true, '{"seed":"vitrine-demo"}'::jsonb),
    (v_school_id, 'sport', 'Salle de sport couverte',
     'Une salle couverte permet de maintenir les séances toute l''année.',
     2, true, true, '{"seed":"vitrine-demo"}'::jsonb),

    -- ✨ Activités parascolaires
    (v_school_id, 'activite', 'Clubs du samedi',
     'Théâtre, robotique, lecture, arts plastiques et club d''anglais.',
     1, true, true, '{"seed":"vitrine-demo"}'::jsonb),
    (v_school_id, 'activite', 'Sorties pédagogiques',
     'Sorties et visites encadrées durant l''année, avec autorisation parentale.',
     2, true, true, '{"seed":"vitrine-demo"}'::jsonb),

    -- 🚌 Transport
    (v_school_id, 'transport', 'Bus scolaire géolocalisé',
     'Ramassage matin et soir ; les parents suivent la position du bus depuis l''application.',
     1, true, true, '{"seed":"vitrine-demo"}'::jsonb);

  GET DIAGNOSTICS v_seeded = ROW_COUNT;
  RAISE NOTICE '✓ % rubriques créées (sans photo) — ajoutez les images dans Communication → Vitrine école', v_seeded;

  -- ─── 3. Le chatbot répond aux numéros inconnus ─────────────────────────────
  UPDATE whatsapp_school_sessions
  SET public_chatbot_enabled = true
  WHERE school_id = v_school_id;

  IF NOT FOUND THEN
    RAISE NOTICE '⚠ Aucune session WhatsApp pour cette école : activez le chatbot visiteur depuis Communication → Documents chatbot.';
  ELSE
    RAISE NOTICE '✓ Chatbot visiteur activé (numéros inconnus)';
  END IF;
END $$;

-- ── Vérification ────────────────────────────────────────────────────────────
-- SELECT about, success_rate, array_length(advantages,1) AS atouts FROM school_profile
--   WHERE school_id = '6d3292a5-848a-4b84-9dd5-3b59525459f9';
-- SELECT category, title, image_url IS NOT NULL AS a_une_photo
--   FROM school_showcase_items
--   WHERE school_id = '6d3292a5-848a-4b84-9dd5-3b59525459f9'
--   ORDER BY category, sort_order;
