import { supabase } from './supabase'

// ─── Session citoyenne ──────────────────────────────────────────────────────
// Une session = un compte Supabase Auth anonyme, stable entre les pages tant
// que le navigateur garde sa session locale. Le filtrage par code postal
// (fsa_prefix) sera collecté en semaine 2 ; pour l'instant la ligne `users`
// est créée avec fsa_prefix vide, mise à jour plus tard sans tout recréer.

let pending: Promise<string> | null = null

export async function getOrCreateUserId(): Promise<string> {
  if (pending) return pending

  pending = (async () => {
    const { data: existing } = await supabase.auth.getSession()
    let userId = existing.session?.user.id

    if (!userId) {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error || !data.user) throw error ?? new Error('Échec de la connexion anonyme')
      userId = data.user.id
    }

    const { error: upsertError } = await supabase
      .from('users')
      .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
    if (upsertError) throw upsertError

    return userId
  })()

  return pending
}

export async function setPostalCode(fsaPrefix: string): Promise<void> {
  const userId = await getOrCreateUserId()
  const { error } = await supabase
    .from('users')
    .update({ fsa_prefix: fsaPrefix.toUpperCase() })
    .eq('id', userId)
  if (error) throw error
}

// ─── Session admin ────────────────────────────────────────────────────────────
// Compte Supabase Auth distinct de la session anonyme citoyenne — email/password
// réel, dont l'appartenance au panneau admin est vérifiée par une ligne dans la
// table `admins` (cf. 0001_init.sql). C'est cette ligne, pas le simple fait
// d'être connecté, qui ouvre l'accès en lecture totale via RLS.

async function isCurrentUserAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

export async function signInAdmin(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw error ?? new Error('Échec de connexion')

  const isAdmin = await isCurrentUserAdmin(data.user.id)
  if (!isAdmin) {
    await supabase.auth.signOut()
    throw new Error('NOT_ADMIN')
  }
}

export async function signOutAdmin(): Promise<void> {
  await supabase.auth.signOut()
}

// Utilisé au montage de AdminApp pour restaurer la session après un rafraîchissement
// de page — sans ça, F5 sur une route admin protégée renverrait au login à chaque fois.
export async function getAdminSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return false
  return isCurrentUserAdmin(userId)
}
