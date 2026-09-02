// Le statut est relu en base à chaque contrôle : un profil en cache ou un JWT
// encore valide ne doit pas prolonger l'accès après une suspension.
export async function getSchoolAccess(profile, db) {
  if (profile?.role === 'super_admin' || !profile?.school_id) {
    return { school: null, denial: null };
  }

  const { data: school, error } = await db
    .from('schools')
    .select('id, name, code, logo_url, status')
    .eq('id', profile.school_id)
    .maybeSingle();

  if (error) {
    return {
      school: null,
      denial: {
        status: 503,
        body: { code: 'SCHOOL_ACCESS_UNAVAILABLE', error: 'Impossible de vérifier l’accès à votre école. Réessayez dans quelques instants.' },
      },
    };
  }

  if (school?.status === 'suspended') {
    return {
      school,
      denial: {
        status: 403,
        body: { code: 'SCHOOL_SUSPENDED', error: 'L’accès à votre école a été suspendu. Veuillez contacter l’administration.' },
      },
    };
  }

  if (!school || school.status !== 'active') {
    return {
      school: null,
      denial: {
        status: 403,
        body: { code: 'SCHOOL_UNAVAILABLE', error: 'Votre école n’est pas accessible. Veuillez contacter l’administration.' },
      },
    };
  }

  return { school, denial: null };
}
