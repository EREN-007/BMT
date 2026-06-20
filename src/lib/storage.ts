import { CitizenRoute, CitizenStop } from './aggregation/types'

const KEY_ROUTES  = 'bmt_citizen_routes'
const KEY_STOPS   = 'bmt_citizen_stops'
const KEY_SEEDED  = 'bmt_seeded_v1'

// ─── CRUD Routes ───────────────────────────────────────────────────────────

export function saveRoutes(
  routes: Array<{ points: [number, number][]; color: string }>,
  sessionId: string,
): void {
  const existing = getRoutes()
  const now = Date.now()

  const newRoutes: CitizenRoute[] = routes.map((r, i) => ({
    id:        `r-${now}-${sessionId}-${i}`,
    timestamp: now,
    sessionId,
    color:     r.color,
    points:    r.points,
  }))

  localStorage.setItem(KEY_ROUTES, JSON.stringify([...existing, ...newRoutes]))
}

export function getRoutes(): CitizenRoute[] {
  try {
    const raw = localStorage.getItem(KEY_ROUTES)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function getRouteCount(): number {
  return getRoutes().length
}

// ─── CRUD Stops ────────────────────────────────────────────────────────────

export function saveStops(
  stops: Array<{ pos: [number, number]; type: 'busstop' | 'station'; label: string }>,
  sessionId: string,
): void {
  const existing = getStops()
  const now = Date.now()

  const newStops: CitizenStop[] = stops.map((s, i) => ({
    id:        `s-${now}-${sessionId}-${i}`,
    timestamp: now,
    sessionId,
    type:      s.type,
    pos:       s.pos,
    label:     s.label,
  }))

  localStorage.setItem(KEY_STOPS, JSON.stringify([...existing, ...newStops]))
}

export function getStops(): CitizenStop[] {
  try {
    const raw = localStorage.getItem(KEY_STOPS)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

// ─── Reset ─────────────────────────────────────────────────────────────────

export function clearAll(): void {
  localStorage.removeItem(KEY_ROUTES)
  localStorage.removeItem(KEY_STOPS)
  localStorage.removeItem(KEY_SEEDED)
}

// ─── Nettoyage des anciennes données de démonstration ──────────────────────
// L'app injectait auparavant ~171 soumissions citoyennes simulées (flag
// bmt_seeded_v1) pour visualiser la carte avant le lancement réel. Cette
// fonction retire ces entrées factices (id préfixé "seed-") sans toucher
// aux vraies soumissions citoyennes, puis efface le flag définitivement.
// Idempotente — ne fait rien si l'amorçage n'a jamais eu lieu sur cet appareil.

export function purgeSeedData(): void {
  if (!localStorage.getItem(KEY_SEEDED)) return

  const routes = getRoutes().filter(r => !r.id.startsWith('seed-'))
  const stops  = getStops().filter(s => !s.id.startsWith('seed-'))
  localStorage.setItem(KEY_ROUTES, JSON.stringify(routes))
  localStorage.setItem(KEY_STOPS,  JSON.stringify(stops))
  localStorage.removeItem(KEY_SEEDED)
}
