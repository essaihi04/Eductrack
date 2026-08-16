// Vérification LOCALE du JWT + cache court du profil.
//
// Avant, chaque requête API payait deux allers-retours avant la moindre logique
// métier : supabase.auth.getUser(token) (appel réseau au service Auth, le plus
// contraint en débit) puis un SELECT sur profiles. Avec 1000 utilisateurs
// connectés, la seule cloche de notifications (2 requêtes / 30 s / utilisateur)
// génère ~67 req/s, soit ~200 appels Supabase/s alors que personne ne fait rien.
//
// Un JWT est signé : on peut le vérifier sur place, sans réseau.
//
// ---------------------------------------------------------------------------
// Portabilité Supabase Cloud → Supabase self-hosted (Docker)
// ---------------------------------------------------------------------------
// GoTrue signe en HS256 avec un secret partagé, aussi bien sur le Cloud (JWT
// Secret du projet) qu'en auto-hébergé (JWT_SECRET du docker-compose, le même
// qui a servi à générer les clés anon/service). Le code ci-dessous marche donc
// à l'identique des deux côtés : à la migration, il n'y a que la VALEUR de
// SUPABASE_JWT_SECRET à changer.
//
// L'émetteur (iss), lui, CHANGE à la migration : https://xxx.supabase.co/auth/v1
// devient https://votre-domaine/auth/v1. Il n'est donc vérifié que s'il est
// explicitement configuré, pour ne pas transformer la migration en panne
// d'authentification totale.
//
// Si le secret n'est pas configuré, ou si le jeton est signé par un algorithme
// asymétrique (projets Cloud récents à clés ECC/RSA), on retombe sur l'appel
// distant : aucune régression, le gain est simplement absent.

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';
const JWT_ISSUER = process.env.SUPABASE_JWT_ISSUER || '';
// Jamais d'algorithme asymétrique ni 'none' ici : avec un secret partagé, ce
// serait la faille classique de confusion d'algorithme.
const HMAC_ALGS = ['HS256', 'HS384', 'HS512'];

export const localVerificationEnabled = () => Boolean(JWT_SECRET);

// Renvoie :
//   { user }            jeton valide, vérifié localement
//   { expired: true }   signature bonne mais jeton expiré → refus immédiat,
//                       inutile d'aller le redemander au serveur
//   null                impossible de trancher localement → repli distant
export function verifyAccessTokenLocally(token) {
  if (!JWT_SECRET || !token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: HMAC_ALGS,
      audience: 'authenticated',
      ...(JWT_ISSUER ? { issuer: JWT_ISSUER } : {}),
    });

    if (!payload?.sub) return null;

    return {
      user: {
        id: payload.sub,
        email: payload.email || null,
        // ATTENTION : payload.role est le rôle POSTGRES ('authenticated'), pas
        // le rôle applicatif. Celui-ci vit dans profiles.role et reste lu en
        // base — d'où le cache ci-dessous.
        aud: payload.aud,
        app_metadata: payload.app_metadata || {},
        user_metadata: payload.user_metadata || {},
      },
    };
  } catch (e) {
    if (e.name === 'TokenExpiredError') return { expired: true };
    // Signature invalide, audience inattendue, algorithme asymétrique… : on ne
    // tranche pas ici, le repli distant fera autorité.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache du profil
// ---------------------------------------------------------------------------
// Le rôle applicatif et le school_id viennent de profiles, relus à CHAQUE
// requête. Un TTL court suffit à effondrer cette charge.
//
// Contrepartie assumée : un changement de rôle, un archivage ou un retrait
// d'accès met jusqu'à TTL secondes à prendre effet pour une session déjà
// ouverte. D'où un TTL volontairement bas (30 s par défaut), et
// invalidateProfileCache() pour forcer la prise en compte immédiate.

const PROFILE_TTL_MS = Number(process.env.PROFILE_CACHE_TTL_MS || 30_000);
const PROFILE_CACHE_MAX = 5_000;
const profileCache = new Map();

export function getCachedProfile(userId) {
  if (PROFILE_TTL_MS <= 0) return null;
  const hit = profileCache.get(userId);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    profileCache.delete(userId);
    return null;
  }
  return hit.profile;
}

export function setCachedProfile(userId, profile) {
  if (PROFILE_TTL_MS <= 0 || !profile) return;
  // Map conserve l'ordre d'insertion : la plus ancienne entrée est en tête.
  if (profileCache.size >= PROFILE_CACHE_MAX) {
    const oldest = profileCache.keys().next().value;
    if (oldest !== undefined) profileCache.delete(oldest);
  }
  profileCache.set(userId, { profile, expiresAt: Date.now() + PROFILE_TTL_MS });
}

// À appeler après toute modification de rôle, d'école ou d'archivage pour que
// le changement s'applique sans attendre l'expiration.
export function invalidateProfileCache(userId) {
  if (userId) profileCache.delete(userId);
  else profileCache.clear();
}
