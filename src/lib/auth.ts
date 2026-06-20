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
