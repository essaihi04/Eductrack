import { supabaseAdmin } from '../config/supabase.js';

export const initializeMissingTables = async () => {
  try {
    console.log('Vérification et création des tables manquantes...');

    // Vérifier si teacher_subjects existe
    const { data: teacherSubjectsExists } = await supabaseAdmin
      .from('teacher_subjects')
      .select('id')
      .limit(1);

    if (!teacherSubjectsExists) {
      console.log('Création de la table teacher_subjects...');
      await supabaseAdmin.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.teacher_subjects (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(teacher_id, subject_id)
          );
          CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher_id ON public.teacher_subjects(teacher_id);
          CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject_id ON public.teacher_subjects(subject_id);
        `
      });
    }

    // Vérifier si class_teachers existe
    const { data: classTeachersExists } = await supabaseAdmin
      .from('class_teachers')
      .select('id')
      .limit(1);

    if (!classTeachersExists) {
      console.log('Création de la table class_teachers...');
      await supabaseAdmin.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.class_teachers (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
            teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(class_id, teacher_id)
          );
          CREATE INDEX IF NOT EXISTS idx_class_teachers_class_id ON public.class_teachers(class_id);
          CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher_id ON public.class_teachers(teacher_id);
        `
      });
    }

    // Vérifier si control_notes existe
    const { data: controlNotesExists } = await supabaseAdmin
      .from('control_notes')
      .select('id')
      .limit(1);

    if (!controlNotesExists) {
      console.log('Création de la table control_notes...');
      await supabaseAdmin.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.control_notes (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            control_id UUID NOT NULL REFERENCES public.controls_plan(id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            note DECIMAL(5,2) NOT NULL CHECK (note >= 0 AND note <= 20),
            appreciation TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(control_id, student_id)
          );
          CREATE INDEX IF NOT EXISTS idx_control_notes_control_id ON public.control_notes(control_id);
          CREATE INDEX IF NOT EXISTS idx_control_notes_student_id ON public.control_notes(student_id);
        `
      });
    }

    // Vérifier si student_enrollments existe (historique d'inscription par année scolaire)
    const { data: enrollmentsExists } = await supabaseAdmin
      .from('student_enrollments')
      .select('id')
      .limit(1);

    if (!enrollmentsExists) {
      console.log('Création de la table student_enrollments...');
      await supabaseAdmin.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.student_enrollments (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
            academic_year TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'NI' CHECK (status IN ('RI', 'NI', 'NR')),
            previous_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
            created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(student_id, academic_year)
          );
          CREATE INDEX IF NOT EXISTS idx_student_enrollments_school ON public.student_enrollments(school_id);
          CREATE INDEX IF NOT EXISTS idx_student_enrollments_student ON public.student_enrollments(student_id);
          CREATE INDEX IF NOT EXISTS idx_student_enrollments_class ON public.student_enrollments(class_id);
          CREATE INDEX IF NOT EXISTS idx_student_enrollments_year ON public.student_enrollments(academic_year);

          -- Backfill : créer une inscription pour chaque élève déjà rattaché à une classe.
          -- Aucune historique antérieur connu → status 'NI' (première inscription enregistrée).
          INSERT INTO public.student_enrollments (school_id, student_id, class_id, academic_year, status)
          SELECT p.school_id, p.id, p.class_id, c.academic_year, 'NI'
          FROM public.profiles p
          JOIN public.classes c ON c.id = p.class_id
          WHERE p.role = 'student'
            AND p.class_id IS NOT NULL
            AND c.academic_year IS NOT NULL
          ON CONFLICT (student_id, academic_year) DO NOTHING;
        `
      });
      console.log('✓ Table student_enrollments créée + backfill effectué');
    }

    // Vérifier si account_schools existe (écoles pilotables par un compte admin)
    const { data: accountSchoolsExists } = await supabaseAdmin
      .from('account_schools')
      .select('id')
      .limit(1);

    if (!accountSchoolsExists) {
      console.log('Création de la table account_schools...');
      await supabaseAdmin.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.account_schools (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, school_id)
          );
          CREATE INDEX IF NOT EXISTS idx_account_schools_user ON public.account_schools(user_id);
          CREATE INDEX IF NOT EXISTS idx_account_schools_school ON public.account_schools(school_id);

          -- Backfill : chaque admin existant a accès à son école courante.
          INSERT INTO public.account_schools (user_id, school_id)
          SELECT id, school_id FROM public.profiles
          WHERE role IN ('admin', 'school_admin', 'pedagogical_director')
            AND school_id IS NOT NULL
          ON CONFLICT (user_id, school_id) DO NOTHING;
        `
      });
      console.log('✓ Table account_schools créée + backfill effectué');
    }

    console.log('✓ Vérification des tables terminée');
  } catch (error) {
    console.error('Erreur lors de l\'initialisation des tables:', error);
    // Ne pas arrêter le serveur si l'initialisation échoue
  }
};
