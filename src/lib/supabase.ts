import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes — voir .env.local')
}

// Client public : utilise uniquement la clé anon, contrainte par les policies RLS
// (supabase/migrations/0001_init.sql). La clé service_role ne doit jamais
// apparaître ici ni dans aucun code exécuté côté navigateur.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
