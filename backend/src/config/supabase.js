import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Client pour les opérations publiques
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Client admin pour les opérations privilégiées
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Client authentifié pour les opérations avec RLS
export const createAuthenticatedClient = (authHeader) => {
  // Extraire le token JWT du header Authorization
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token) {
    throw new Error('Token d\'authentification manquant');
  }
  
  // Créer un client avec le token JWT de l'utilisateur
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
};
