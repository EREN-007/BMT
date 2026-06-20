import { CitizenRoute, CitizenStop } from './aggregation/types'
import { supabase } from './supabase'
import { getOrCreateUserId } from './auth'

// ─── Soumission citoyenne ───────────────────────────────────────────────────
// Un appel = une visite citoyenne (les dessins + arrêts du formulaire en cours).
// Crée une ligne `submissions` (numérotée automatiquement par trigger Postgres,
// cf. supabase/migrations/0001_init.sql), puis les routes/stops qui s'y rattachent.
// RLS empêche d'écrire dans la soumission de quelqu'un d'autre.

export async function saveSubmission(input: {
  routes: Array<{ points: [number, number][]; color: string }>
  stops:  Array<{ pos: [number, number]; type: 'busstop' | 'station'; label: string }>
}): Promise<void> {
  const userId = await getOrCreateUserId()

  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .insert({ user_id: userId })
    .select('id')
    .single()
  if (subErr || !submission) throw subErr ?? new Error('Échec de création de la soumission')

  if (input.routes.length > 0) {
    const { error } = await supabase.from('routes').insert(
      input.routes.map(r => ({ submission_id: submission.id, points: r.points, color: r.color })),
    )
    if (error) throw error
  }

  if (input.stops.length > 0) {
    const { error } = await supabase.from('stops').insert(
      input.stops.map(s => ({ submission_id: submission.id, pos: s.pos, type: s.type, label: s.label })),
    )
    if (error) throw error
  }
}

// ─── Lecture ─────────────────────────────────────────────────────────────────
// Sous RLS : un citoyen ne voit que ses propres soumissions, un admin (présent
// dans la table `admins`) voit tout. Pas de distinction de code ici — c'est la
// policy Postgres qui décide ce qui revient.

export async function getRoutes(): Promise<CitizenRoute[]> {
  const { data, error } = await supabase
    .from('routes')
    .select('id, submission_id, color, points, created_at')
  if (error) throw error

  return (data ?? []).map(r => ({
    id:        r.id,
    timestamp: new Date(r.created_at).getTime(),
    sessionId: r.submission_id,
    color:     r.color,
    points:    r.points as [number, number][],
  }))
}

export async function getRouteCount(): Promise<number> {
  const { count, error } = await supabase
    .from('routes')
    .select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

export async function getStops(): Promise<CitizenStop[]> {
  const { data, error } = await supabase
    .from('stops')
    .select('id, submission_id, type, pos, label, created_at')
  if (error) throw error

  return (data ?? []).map(s => ({
    id:        s.id,
    timestamp: new Date(s.created_at).getTime(),
    sessionId: s.submission_id,
    type:      s.type as 'busstop' | 'station',
    pos:       s.pos as [number, number],
    label:     s.label,
  }))
}
