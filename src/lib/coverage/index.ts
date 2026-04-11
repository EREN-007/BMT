import { PopPoint, CoverageStop, DeadZone, StopContribution, CoverageResult } from './types'

export type { PopPoint, CoverageStop, DeadZone, StopContribution, CoverageResult }

// ═══════════════════════════════════════════════════════════════════════════
// 1 — DISTANCE (approximation rapide, précision < 0.2 % pour d < 2 km)
// ═══════════════════════════════════════════════════════════════════════════
// À 46°N :
//   1° lat ≈ 111 320 m
//   1° lng ≈ 111 320 × cos(46°) ≈ 77 340 m
// On évite les fonctions trigonométriques coûteuses pour chaque paire.

const M_PER_LAT = 111_320
const M_PER_LNG = 77_340   // cos(46° × π/180) × 111 320

export function distMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dy = (lat2 - lat1) * M_PER_LAT
  const dx = (lng2 - lng1) * M_PER_LNG
  return Math.sqrt(dx * dx + dy * dy)
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 — GRILLE DE POPULATION (générée une seule fois, mise en cache)
// ═══════════════════════════════════════════════════════════════════════════
// Couvre Grand Moncton avec un pas de ~200 m.
// Chaque point porte un poids de densité relative (0.5 – 2.0).
// Total : ~2 700 points — assez fin pour l'analyse, assez léger pour le browser.

const BBOX = {
  minLat:  46.045,  maxLat:  46.125,
  minLng: -64.845,  maxLng: -64.690,
}
const LAT_STEP = 0.00180   // ≈ 200 m
const LNG_STEP = 0.00259   // ≈ 200 m à 46°N

// Centres urbains et leur portée d'influence
const URBAN_CORES = [
  { lat: 46.088, lng: -64.778, name: 'Moncton Centre' },
  { lat: 46.097, lng: -64.744, name: 'Dieppe Centre'  },
  { lat: 46.063, lng: -64.797, name: 'Riverview'      },
]

function populationWeight(lat: number, lng: number): number {
  // Distance (en degrés) au centre urbain le plus proche
  let minDist = Infinity
  for (const core of URBAN_CORES) {
    const d = Math.sqrt((lat - core.lat) ** 2 + (lng - core.lng) ** 2)
    if (d < minDist) minDist = d
  }
  // Poids décroissant avec la distance au cœur urbain
  if (minDist < 0.008) return 2.0    // cœur dense     (< ~800 m)
  if (minDist < 0.020) return 1.6    // urbain proche   (< ~2 km)
  if (minDist < 0.035) return 1.2    // urbain étendu   (< ~3.5 km)
  if (minDist < 0.055) return 0.8    // suburbain        (< ~5.5 km)
  return 0.4                          // périphérie
}

let _grid: PopPoint[] | null = null

export function getPopulationGrid(): PopPoint[] {
  if (_grid) return _grid

  const pts: PopPoint[] = []
  for (let lat = BBOX.minLat; lat <= BBOX.maxLat + 1e-9; lat += LAT_STEP) {
    for (let lng = BBOX.minLng; lng <= BBOX.maxLng + 1e-9; lng += LNG_STEP) {
      const rLat = Math.round(lat * 1e5) / 1e5
      const rLng = Math.round(lng * 1e5) / 1e5
      pts.push({ lat: rLat, lng: rLng, weight: populationWeight(rLat, rLng) })
    }
  }

  _grid = pts
  return pts
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 — DÉTECTION DES ZONES MORTES
// ═══════════════════════════════════════════════════════════════════════════
// Utilise un BFS sur la grille régulière (8-voisins) pour regrouper
// les points non couverts adjacents en clusters = zones mortes.
// Complexité : O(n) grâce aux lookups par clé de grille.

function gridKey(lat: number, lng: number): string {
  const row = Math.round((lat - BBOX.minLat) / LAT_STEP)
  const col = Math.round((lng - BBOX.minLng) / LNG_STEP)
  return `${row}|${col}`
}

function neighborKeys(key: string): string[] {
  const [r, c] = key.split('|').map(Number)
  return [
    `${r-1}|${c-1}`, `${r-1}|${c}`, `${r-1}|${c+1}`,
    `${r  }|${c-1}`,                  `${r  }|${c+1}`,
    `${r+1}|${c-1}`, `${r+1}|${c}`, `${r+1}|${c+1}`,
  ]
}

function detectDeadZones(uncoveredPoints: PopPoint[]): DeadZone[] {
  if (uncoveredPoints.length === 0) return []

  // Index spatial : clé de grille → point
  const index = new Map<string, PopPoint>()
  for (const p of uncoveredPoints) index.set(gridKey(p.lat, p.lng), p)

  const visited = new Set<string>()
  const zones: DeadZone[] = []
  let zoneId = 0

  for (const [startKey, startPt] of index) {
    if (visited.has(startKey)) continue

    // BFS depuis ce point non couvert
    const cluster: PopPoint[] = []
    const queue: string[] = [startKey]
    visited.add(startKey)

    while (queue.length > 0) {
      const key = queue.shift()!
      cluster.push(index.get(key)!)

      for (const nk of neighborKeys(key)) {
        if (!visited.has(nk) && index.has(nk)) {
          visited.add(nk)
          queue.push(nk)
        }
      }
    }

    // Filtrer les clusters trop petits (bruit)
    if (cluster.length < 3) continue

    // Calcul des bornes (bounding box) du cluster
    let minLat = Infinity, maxLat = -Infinity
    let minLng = Infinity, maxLng = -Infinity
    for (const p of cluster) {
      if (p.lat < minLat) minLat = p.lat
      if (p.lat > maxLat) maxLat = p.lat
      if (p.lng < minLng) minLng = p.lng
      if (p.lng > maxLng) maxLng = p.lng
    }

    // Ajouter une marge d'une demi-cellule pour que le rectangle englobe bien
    minLat -= LAT_STEP / 2; maxLat += LAT_STEP / 2
    minLng -= LNG_STEP / 2; maxLng += LNG_STEP / 2

    const urgency: DeadZone['urgency'] =
      cluster.length >= 15 ? 'high' :
      cluster.length >=  6 ? 'medium' : 'low'

    zones.push({
      id:         `dz-${zoneId++}`,
      center:     [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
      bounds:     [[minLat, minLng], [maxLat, maxLng]],
      pointCount: cluster.length,
      urgency,
    })
  }

  // Trier : zones les plus grandes en premier
  return zones.sort((a, b) => b.pointCount - a.pointCount)
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 — CONTRIBUTION PAR ARRÊT (impact de chaque arrêt sur la couverture)
// ═══════════════════════════════════════════════════════════════════════════
// Pour chaque point couvert, on identifie l'arrêt le plus proche.
// La contribution d'un arrêt = nb de points dont il est le plus proche voisin.
// coverageDelta ≈ % perdu si cet arrêt est désactivé.

function computeContributions(
  coveredPoints: Array<{ point: PopPoint; closestStopId: string }>,
  totalWeight: number,
): StopContribution[] {
  const contribMap = new Map<string, { points: number; weight: number }>()

  for (const { point, closestStopId } of coveredPoints) {
    const existing = contribMap.get(closestStopId) ?? { points: 0, weight: 0 }
    contribMap.set(closestStopId, {
      points: existing.points + 1,
      weight: existing.weight + point.weight,
    })
  }

  const result: StopContribution[] = []
  contribMap.forEach(({ points, weight }, stopId) => {
    result.push({
      stopId,
      coveredPoints:  points,
      coverageDelta: Math.round((weight / totalWeight) * 100 * 10) / 10,
    })
  })

  return result.sort((a, b) => b.coverageDelta - a.coverageDelta)
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 — FONCTION PRINCIPALE : computeCoverage()
// ═══════════════════════════════════════════════════════════════════════════
//
// Paramètres :
//   stops        : liste des arrêts (actifs et inactifs)
//   busRadius    : rayon de marche autour d'un arrêt de bus (défaut 400 m)
//   stationRadius: rayon de marche autour d'une station     (défaut 800 m)
//
// Algorithme :
//   Pour chaque point de population :
//     1. Trouver l'arrêt actif le plus proche
//     2. Si dist ≤ radius → couvert + mémoriser l'arrêt (pour contribution)
//   Puis :
//     3. Détecter les zones mortes (clusters de points non couverts)
//     4. Calculer les contributions individuelles

export function computeCoverage(
  stops: CoverageStop[],
  busRadius    = 400,   // mètres
  stationRadius = 800,  // mètres
): CoverageResult {
  const t0 = performance.now()

  const grid        = getPopulationGrid()
  const activeStops = stops.filter(s => s.active)

  let coveredPoints  = 0
  let totalPoints    = 0
  let coveredWeight  = 0
  let totalWeight    = 0

  const uncovered: PopPoint[] = []
  const coveredWithStop: Array<{ point: PopPoint; closestStopId: string }> = []

  for (const pt of grid) {
    totalPoints += 1
    totalWeight += pt.weight

    if (activeStops.length === 0) {
      uncovered.push(pt)
      continue
    }

    // Trouver l'arrêt actif le plus proche et sa distance
    let minDist      = Infinity
    let closestId    = ''
    let closestRadius = 0

    for (const stop of activeStops) {
      const d = distMeters(pt.lat, pt.lng, stop.pos[0], stop.pos[1])
      if (d < minDist) {
        minDist       = d
        closestId     = stop.id
        closestRadius = stop.type === 'station' ? stationRadius : busRadius
      }
    }

    if (minDist <= closestRadius) {
      coveredPoints += 1
      coveredWeight += pt.weight
      coveredWithStop.push({ point: pt, closestStopId: closestId })
    } else {
      uncovered.push(pt)
    }
  }

  const coveragePct  = totalWeight > 0
    ? Math.round((coveredWeight / totalWeight) * 100)
    : 0

  const deadZones    = detectDeadZones(uncovered)
  const contributions = computeContributions(coveredWithStop, totalWeight)

  return {
    coveragePct,
    coveredPoints,
    totalPoints,
    coveredWeight,
    totalWeight,
    deadZones,
    contributions,
    computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
  }
}
