import { CitizenRoute, CitizenStop, GridCell, RawGrid, AggregatedStop } from './types'

// ─── Emprise Grand Moncton ─────────────────────────────────────────────────
// Couvre Moncton + Dieppe + Riverview avec une marge

export const BBOX = {
  minLat:  46.040,
  maxLat:  46.130,
  minLng: -64.860,
  maxLng: -64.680,
}

// Taille d'une cellule en degrés
// 0.0004° lat ≈ 44 m   /   0.0004° lng ≈ 31 m à 46°N
// Affinée (était 0.001°/~111m) pour réduire la distorsion entre le tracé
// citoyen original et le corridor reconstruit — l'écart se voit à l'œil sur
// la carte admin et fausse aussi la longueur utilisée par le futur moteur
// de budget (coût/km de ligne, semaine 3 du plan).
export const CELL_SIZE = 0.0004

// ─── Utilitaires de grille ─────────────────────────────────────────────────

export function latLngToCell(lat: number, lng: number): [number, number] {
  const row = Math.floor((lat - BBOX.minLat) / CELL_SIZE)
  const col = Math.floor((lng - BBOX.minLng) / CELL_SIZE)
  return [row, col]
}

export function cellToLatLng(row: number, col: number): [number, number] {
  return [
    BBOX.minLat + (row + 0.5) * CELL_SIZE,
    BBOX.minLng + (col + 0.5) * CELL_SIZE,
  ]
}

export function cellKey(row: number, col: number): string {
  return `${row}|${col}`
}

function inBounds(lat: number, lng: number): boolean {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat
      && lng >= BBOX.minLng && lng <= BBOX.maxLng
}

// ─── Interpolation de segment ──────────────────────────────────────────────
// Génère des points intermédiaires entre p1 et p2 tous les `step` degrés.
// On utilise step = CELL_SIZE / 2 pour garantir qu'aucune cellule n'est sautée.

function interpolateSegment(
  p1: [number, number],
  p2: [number, number],
  step: number,
): [number, number][] {
  const dLat = p2[0] - p1[0]
  const dLng = p2[1] - p1[1]
  const dist  = Math.sqrt(dLat * dLat + dLng * dLng)
  if (dist === 0) return [p1]

  const n = Math.ceil(dist / step)
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push([p1[0] + t * dLat, p1[1] + t * dLng])
  }
  return pts
}

// ─── Bearing circulaire ────────────────────────────────────────────────────
// Retourne [sin(θ), cos(θ)] pour une moyenne circulaire correcte

function bearingComponents(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): [number, number] {
  const dLat = lat2 - lat1
  const dLng = lng2 - lng1
  const angle = Math.atan2(dLng, dLat)
  return [Math.sin(angle), Math.cos(angle)]
}

// ─── Construction de la grille ─────────────────────────────────────────────
// Complexité : O(routes × points_par_route × 1/step)
// Pour 200 routes × 5 pts × 2 steps ≈ 2 000 opérations — quasi-instantané.

export function buildGrid(routes: CitizenRoute[]): RawGrid {
  const cells = new Map<string, GridCell>()
  const rows  = Math.ceil((BBOX.maxLat - BBOX.minLat) / CELL_SIZE)
  const cols  = Math.ceil((BBOX.maxLng - BBOX.minLng) / CELL_SIZE)
  const step  = CELL_SIZE / 2  // pas d'interpolation = demi-cellule

  for (const route of routes) {
    // Ensemble des cellules visitées PAR CETTE ROUTE (évite de compter 2× la même)
    const visited = new Set<string>()

    for (let i = 0; i < route.points.length - 1; i++) {
      const p1 = route.points[i]
      const p2 = route.points[i + 1]
      const [bx, by] = bearingComponents(p1[0], p1[1], p2[0], p2[1])
      const interpolated = interpolateSegment(p1, p2, step)

      for (const [lat, lng] of interpolated) {
        if (!inBounds(lat, lng)) continue

        const [row, col] = latLngToCell(lat, lng)
        const key = cellKey(row, col)

        if (!visited.has(key)) {
          visited.add(key)

          if (!cells.has(key)) {
            const [cLat, cLng] = cellToLatLng(row, col)
            cells.set(key, {
              row, col,
              count: 0,
              lat: cLat, lng: cLng,
              sumBearingX: 0, sumBearingY: 0,
            })
          }

          const cell = cells.get(key)!
          cell.count      += 1
          cell.sumBearingX += bx
          cell.sumBearingY += by
        }
      }
    }
  }

  return { cells, rows, cols, ...BBOX, cellSize: CELL_SIZE }
}

// ─── Agrégation des arrêts de bus ─────────────────────────────────────────
// Groupe les arrêts proches (< 2 cellules) et compte les votes par cluster.

export function aggregateStops(stops: CitizenStop[]): AggregatedStop[] {
  if (stops.length === 0) return []

  const clusters: { stops: CitizenStop[]; centroid: [number, number] }[] = []
  const CLUSTER_RADIUS = CELL_SIZE * 2  // ~200m de rayon de regroupement

  for (const stop of stops) {
    let bestCluster: typeof clusters[0] | null = null
    let bestDist = Infinity

    for (const cluster of clusters) {
      if (cluster.stops[0].type !== stop.type) continue
      const dLat = cluster.centroid[0] - stop.pos[0]
      const dLng = cluster.centroid[1] - stop.pos[1]
      const dist = Math.sqrt(dLat * dLat + dLng * dLng)
      if (dist < CLUSTER_RADIUS && dist < bestDist) {
        bestDist = dist
        bestCluster = cluster
      }
    }

    if (bestCluster) {
      bestCluster.stops.push(stop)
      // Mise à jour du centroïde (moyenne mobile)
      const n = bestCluster.stops.length
      bestCluster.centroid = [
        bestCluster.centroid[0] + (stop.pos[0] - bestCluster.centroid[0]) / n,
        bestCluster.centroid[1] + (stop.pos[1] - bestCluster.centroid[1]) / n,
      ]
    } else {
      clusters.push({ stops: [stop], centroid: [stop.pos[0], stop.pos[1]] })
    }
  }

  return clusters.map((cluster, i) => ({
    id: `agg-stop-${i}`,
    pos: cluster.centroid,
    type: cluster.stops[0].type,
    count: cluster.stops.length,
    // Label le plus fréquent dans le cluster
    label: mostFrequent(cluster.stops.map(s => s.label)) || cluster.stops[0].label,
  }))
}

function mostFrequent(arr: string[]): string {
  const freq = new Map<string, number>()
  for (const s of arr) freq.set(s, (freq.get(s) ?? 0) + 1)
  let max = 0, best = arr[0]
  freq.forEach((v, k) => { if (v > max) { max = v; best = k } })
  return best
}
