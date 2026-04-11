import { ODZone, ODCell, ODMatrix } from './types'

export { OD_ZONES } from './zones'
export type { ODZone, ODCell, ODMatrix } from './types'

// ─── Facteur d'expansion enquête ──────────────────────────────────────────
// 1 tracé citoyen ≈ 50 voyages/jour représentés dans la population générale.
// Hypothèse conservatrice pour une ville de ~170 000 habitants.
const EXPANSION_FACTOR = 50

// ═══════════════════════════════════════════════════════════════════════════
// 1 — AFFECTATION DE ZONE
// ═══════════════════════════════════════════════════════════════════════════
// Chaque point est assigné à la zone dont le centroïde est le plus proche.
// On compare les distances au carré (économise sqrt, correct pour comparer).
// Constantes de projection à 46°N — mêmes que le moteur de couverture.

const M_PER_LAT = 111_320
const M_PER_LNG =  77_340

export function assignZone(lat: number, lng: number, zones: ODZone[]): ODZone {
  let best     = zones[0]
  let bestDist = Infinity

  for (const z of zones) {
    const dy = (lat - z.center[0]) * M_PER_LAT
    const dx = (lng - z.center[1]) * M_PER_LNG
    const d2 = dx * dx + dy * dy
    if (d2 < bestDist) { bestDist = d2; best = z }
  }

  return best
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 — CLÉ CANONIQUE D'UNE PAIRE DE ZONES
// ═══════════════════════════════════════════════════════════════════════════
// Toujours "ID_min|ID_max" — évite les doublons (A|B = B|A).

export function pairKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 — PAIRES DE ZONES COUVERTES PAR LES LIGNES ACTIVES
// ═══════════════════════════════════════════════════════════════════════════
// Pour chaque ligne active, on identifie toutes les zones traversées.
// Toutes les combinaisons de zones dans la même ligne sont "couvertes".
//
// Signature flexible : `active` optionnel → traité comme true si absent.
// Compatible avec AggregatedCorridor[] (pas de champ active)
// et SimRoute[] (champ active présent).

export function computeCoveredPairs(
  routes: Array<{ points: [number, number][]; active?: boolean }>,
  zones: ODZone[],
): Set<string> {
  const covered = new Set<string>()

  for (const route of routes) {
    if (route.active === false) continue      // skip inactif
    if (route.points.length < 2) continue

    // Zones traversées par cette ligne (dédupliquées)
    const zonesInRoute = new Set<string>()
    for (const [lat, lng] of route.points) {
      zonesInRoute.add(assignZone(lat, lng, zones).id)
    }

    // Toutes les paires = couvertes
    const arr = Array.from(zonesInRoute)
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        covered.add(pairKey(arr[i], arr[j]))
      }
    }
  }

  return covered
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 — CONSTRUCTION DE LA MATRICE O-D
// ═══════════════════════════════════════════════════════════════════════════
//
// Paramètres :
//   citizenRoutes  : tracés bruts de l'app mobile (Array<{points}>)
//   zones          : définitions des zones (OD_ZONES par défaut)
//   coveredPairs   : pairKey des couples de zones desservis par des lignes actives
//
// Algorithme :
//   Pour chaque tracé citoyen :
//     1. Affecter le premier point → zone origine
//     2. Affecter le dernier point → zone destination
//     3. Si origine ≠ destination : incrémenter la cellule (O, D)
//   Puis appliquer EXPANSION_FACTOR et annoter chaque cellule avec covered.

export function buildODMatrix(
  citizenRoutes: Array<{ points: [number, number][] }>,
  zones: ODZone[],
  coveredPairs?: Set<string>,
): ODMatrix {
  const t0 = performance.now()

  // ── Comptage brut ─────────────────────────────────────────────────────
  const rawMap = new Map<string, { from: string; to: string; count: number }>()

  for (const route of citizenRoutes) {
    if (route.points.length < 2) continue

    const origin = assignZone(
      route.points[0][0], route.points[0][1], zones,
    )
    const dest = assignZone(
      route.points[route.points.length - 1][0],
      route.points[route.points.length - 1][1],
      zones,
    )

    if (origin.id === dest.id) continue   // trajet intra-zone — ignoré

    const key      = pairKey(origin.id, dest.id)
    const existing = rawMap.get(key) ?? { from: origin.id, to: dest.id, count: 0 }
    rawMap.set(key, { ...existing, count: existing.count + 1 })
  }

  // ── Construction des cellules ─────────────────────────────────────────
  const cells: ODCell[] = []
  let totalTrips   = 0
  let coveredTrips = 0

  for (const [key, { from, to, count }] of rawMap) {
    const trips   = count * EXPANSION_FACTOR
    const covered = coveredPairs ? coveredPairs.has(key) : false

    cells.push({ fromZoneId: from, toZoneId: to, rawCount: count, trips, covered })
    totalTrips += trips
    if (covered) coveredTrips += trips
  }

  // Tri par demande décroissante
  cells.sort((a, b) => b.trips - a.trips)

  const coveragePct = totalTrips > 0
    ? Math.round((coveredTrips / totalTrips) * 100)
    : 0

  return {
    zones,
    cells,
    totalTrips,
    coveredTrips,
    coveragePct,
    topCorridors:  cells.slice(0, 5),
    unmetDemand:   cells.filter(c => !c.covered).slice(0, 5),
    computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
  }
}
