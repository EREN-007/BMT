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

// ─── Données d'amorçage ────────────────────────────────────────────────────
// Simule ~171 soumissions citoyennes réalistes sur Grand Moncton.
// Chaque "citoyen" trace une route légèrement différente le long des corridors réels.
// Appelée une seule fois au premier chargement de l'app admin (flag bmt_seeded_v1).

export function ensureSeedData(): void {
  if (localStorage.getItem(KEY_SEEDED)) return  // déjà amorcé

  const routes: CitizenRoute[] = []
  const stops:  CitizenStop[]  = []
  const now = Date.now()
  const DAY = 86_400_000

  // Variation aléatoire autour d'un point (±amount degrés)
  const j = (v: number, amount = 0.0015) =>
    v + (Math.random() - 0.5) * 2 * amount

  // ── Corridors de base (tracés idéaux) ───────────────────────────────────
  // count = nombre de citoyens simulés pour ce corridor
  const BASE = [
    {
      count: 38,
      pts: [[46.0972,-64.7901],[46.0931,-64.7830],[46.0878,-64.7782],[46.0840,-64.7740],[46.0821,-64.7720]] as [number,number][],
    },
    {
      count: 34,
      pts: [[46.1020,-64.7600],[46.0980,-64.7680],[46.0930,-64.7750],[46.0878,-64.7782],[46.0830,-64.7820]] as [number,number][],
    },
    {
      count: 29,
      pts: [[46.0988,-64.7350],[46.0960,-64.7440],[46.0935,-64.7530],[46.0910,-64.7640],[46.0878,-64.7782]] as [number,number][],
    },
    {
      count: 18,
      pts: [[46.1080,-64.7820],[46.1040,-64.7790],[46.0998,-64.7760],[46.0960,-64.7740],[46.0920,-64.7720]] as [number,number][],
    },
    {
      count: 14,
      pts: [[46.0878,-64.7782],[46.0820,-64.7800],[46.0760,-64.7830],[46.0700,-64.7900],[46.0630,-64.7970]] as [number,number][],
    },
    {
      count: 12,
      pts: [[46.0940,-64.7200],[46.0960,-64.7300],[46.0970,-64.7400],[46.0975,-64.7480],[46.0970,-64.7560]] as [number,number][],
    },
    {
      count: 11,
      pts: [[46.1020,-64.7600],[46.0990,-64.7650],[46.0960,-64.7700],[46.0920,-64.7740],[46.0878,-64.7782]] as [number,number][],
    },
    {
      count: 6,
      pts: [[46.0562,-64.8022],[46.0600,-64.7970],[46.0640,-64.7920],[46.0680,-64.7870],[46.0720,-64.7830]] as [number,number][],
    },
    {
      count: 5,
      pts: [[46.0878,-64.7782],[46.0850,-64.7900],[46.0820,-64.8020],[46.0790,-64.8130],[46.0760,-64.8220]] as [number,number][],
    },
    {
      count: 4,
      pts: [[46.1050,-64.7300],[46.1020,-64.7380],[46.0990,-64.7440],[46.0960,-64.7490],[46.0940,-64.7540]] as [number,number][],
    },
  ]

  // Générer les routes simulées (avec variations aléatoires)
  let routeIdx = 0
  for (const base of BASE) {
    for (let c = 0; c < base.count; c++) {
      const JITTER = 0.0008 + Math.random() * 0.001  // 80–180m de variation
      const sessionId = `seed-session-${routeIdx}`
      const points = base.pts.map(([lat, lng]) => [j(lat, JITTER), j(lng, JITTER)] as [number, number])

      // Certains citoyens tracent une version partielle du corridor (réaliste)
      const startOffset = Math.random() < 0.3 ? 1 : 0
      const endOffset   = Math.random() < 0.3 ? 1 : 0
      const pts = points.slice(startOffset, points.length - endOffset)
      if (pts.length < 2) pts.push(...points.slice(-2))

      routes.push({
        id:        `seed-r-${routeIdx}`,
        timestamp: now - Math.floor(Math.random() * 30 * DAY),
        sessionId,
        color:     '#3498db',
        points:    pts,
      })
      routeIdx++
    }
  }

  // ── Arrêts de bus simulés ───────────────────────────────────────────────
  const BASE_STOPS: Array<{ type: 'busstop' | 'station'; pos: [number,number]; label: string; count: number }> = [
    { type:'busstop',  pos:[46.0878,-64.7782], label:'Centre-ville',                 count: 42 },
    { type:'busstop',  pos:[46.0821,-64.7720], label:'Champlain Place',              count: 35 },
    { type:'busstop',  pos:[46.1020,-64.7600], label:'Université de Moncton',        count: 30 },
    { type:'busstop',  pos:[46.0960,-64.7440], label:'Dieppe Centre Commercial',     count: 28 },
    { type:'busstop',  pos:[46.0931,-64.7830], label:'Highfield Square',             count: 22 },
    { type:'busstop',  pos:[46.0980,-64.7700], label:'Wheeler Blvd & Mountain Rd',   count: 18 },
    { type:'busstop',  pos:[46.0620,-64.7950], label:'Riverview Civic Centre',       count: 14 },
    { type:'busstop',  pos:[46.0988,-64.7350], label:'Dieppe Rue Acadie',            count: 12 },
    { type:'busstop',  pos:[46.0960,-64.7740], label:'Moncton Hospital',             count:  9 },
    { type:'busstop',  pos:[46.0562,-64.8022], label:'Riverview Plaza',              count:  7 },
    { type:'busstop',  pos:[46.0820,-64.8100], label:'Moncton Ouest — Trinity Dr',   count:  5 },
    { type:'busstop',  pos:[46.0940,-64.7200], label:'Dieppe Est — Champlain',       count:  4 },
    { type:'station',  pos:[46.0920,-64.7750], label:'Gare centrale Moncton',        count: 38 },
    { type:'station',  pos:[46.0975,-64.7400], label:'Station Dieppe — Pôle Acadie', count: 24 },
    { type:'station',  pos:[46.0630,-64.7970], label:'Station Riverview',            count: 15 },
    { type:'station',  pos:[46.1020,-64.7610], label:'Station Université',           count: 11 },
    { type:'station',  pos:[46.0790,-64.8130], label:'Station Moncton Ouest',        count:  6 },
  ]

  const STOP_JITTER = 0.0003  // ~30m — plus précis que les routes
  let stopIdx = 0

  for (const base of BASE_STOPS) {
    for (let c = 0; c < base.count; c++) {
      stops.push({
        id:        `seed-s-${stopIdx}`,
        timestamp: now - Math.floor(Math.random() * 30 * DAY),
        sessionId: `seed-session-stop-${stopIdx}`,
        type:      base.type,
        pos:       [j(base.pos[0], STOP_JITTER), j(base.pos[1], STOP_JITTER)],
        label:     base.label,
      })
      stopIdx++
    }
  }

  localStorage.setItem(KEY_ROUTES, JSON.stringify(routes))
  localStorage.setItem(KEY_STOPS,  JSON.stringify(stops))
  localStorage.setItem(KEY_SEEDED, '1')
}
