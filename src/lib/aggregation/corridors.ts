import { RawGrid, GridCell, AggregatedCorridor } from './types'
import { cellKey, cellToLatLng } from './grid'

// ─── Simplification RDP (Ramer-Douglas-Peucker) ───────────────────────────
// Réduit le nombre de points d'une polyligne en conservant la forme générale.
// epsilon : distance maximale (degrés) qu'un point peut s'écarter de la ligne simplifiée.

export function rdp(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points

  // Trouver le point le plus éloigné de la droite p[0]-p[n-1]
  const [x1, y1] = points[0]
  const [x2, y2] = points[points.length - 1]
  const lineLen   = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

  let maxDist = 0
  let maxIdx  = 0

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]
    // Distance perpendiculaire du point à la droite
    const dist = lineLen === 0
      ? Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
      : Math.abs((y2 - y1) * px - (x2 - x1) * py + x2 * y1 - y2 * x1) / lineLen

    if (dist > maxDist) { maxDist = dist; maxIdx = i }
  }

  if (maxDist > epsilon) {
    const left  = rdp(points.slice(0, maxIdx + 1), epsilon)
    const right = rdp(points.slice(maxIdx),        epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [points[0], points[points.length - 1]]
}

// ─── Composantes connexes (BFS) ───────────────────────────────────────────
// Regroupe les cellules actives en composantes connexes (connectivité 8-voisins).

function getNeighborKeys(row: number, col: number, cells: Map<string, GridCell>): string[] {
  const neighbors: string[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const key = cellKey(row + dr, col + dc)
      if (cells.has(key)) neighbors.push(key)
    }
  }
  return neighbors
}

function findConnectedComponents(
  cells: Map<string, GridCell>,
  minCount: number,
): GridCell[][] {
  const eligible = new Map<string, GridCell>()
  cells.forEach((cell, key) => {
    if (cell.count >= minCount) eligible.set(key, cell)
  })

  const visited  = new Set<string>()
  const components: GridCell[][] = []

  for (const [startKey, startCell] of eligible) {
    if (visited.has(startKey)) continue

    const component: GridCell[] = []
    const queue: GridCell[] = [startCell]
    visited.add(startKey)

    while (queue.length > 0) {
      const current = queue.shift()!
      component.push(current)

      for (const nKey of getNeighborKeys(current.row, current.col, eligible)) {
        if (!visited.has(nKey)) {
          visited.add(nKey)
          queue.push(eligible.get(nKey)!)
        }
      }
    }

    components.push(component)
  }

  return components
}

// ─── Ordonnancement d'une composante ─────────────────────────────────────
// Transforme un ensemble non-ordonné de cellules en séquence linéaire.
//
// Une traversée nearest-neighbor pure se fait piéger dans les virages : dès
// qu'un voisin à distance 1 existe, l'ancienne version s'arrêtait d'en
// chercher d'autres et prenait le premier trouvé (ordre d'itération de la
// Map, pas forcément le bon) — au niveau d'un virage serré, deux cellules
// "avant" et "après" le tournant peuvent être à distance 1 l'une de l'autre
// sans être réellement consécutives sur le tracé, ce qui produit un zigzag.
// On compare maintenant tous les candidats proches et on privilégie celui
// qui prolonge le mieux la direction courante (continuité de cap), pas
// seulement le plus proche.

function orderComponent(cells: GridCell[]): GridCell[] {
  if (cells.length <= 1) return cells

  const cellSet = new Set(cells.map(c => cellKey(c.row, c.col)))

  // Score d'extrémité : une cellule est une "extrémité" si elle a peu de voisins
  const endScore = (c: GridCell): number => {
    let n = 0
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        if (cellSet.has(cellKey(c.row + dr, c.col + dc))) n++
      }
    }
    return n  // plus n est petit, plus c'est une extrémité
  }

  // Démarrer depuis la cellule avec le moins de voisins (vraie extrémité)
  const sorted = [...cells].sort((a, b) => endScore(a) - endScore(b))
  const start  = sorted[0]

  const ordered   = [start]
  const remaining = new Map(cells.map(c => [cellKey(c.row, c.col), c]))
  remaining.delete(cellKey(start.row, start.col))

  let current     = start
  let prevBearing: number | null = null  // cap courant (radians), null tant qu'on n'a pas bougé

  const angularDiff = (a: number, b: number): number => {
    let d = Math.abs(a - b)
    if (d > Math.PI) d = 2 * Math.PI - d
    return d
  }

  while (remaining.size > 0) {
    // Tous les candidats à portée raisonnable (pas seulement le tout premier trouvé)
    let candidates: { key: string; cell: GridCell; dist: number }[] = []
    for (const [key, candidate] of remaining) {
      const dr   = Math.abs(candidate.row - current.row)
      const dc   = Math.abs(candidate.col - current.col)
      const dist = Math.max(dr, dc)  // distance de Chebyshev
      if (dist <= 2) candidates.push({ key, cell: candidate, dist })
    }

    // Repli : rien à portée 2, élargir jusqu'à 3 (bord du corridor)
    if (candidates.length === 0) {
      for (const [key, candidate] of remaining) {
        const dr   = Math.abs(candidate.row - current.row)
        const dc   = Math.abs(candidate.col - current.col)
        const dist = Math.max(dr, dc)
        if (dist <= 3) candidates.push({ key, cell: candidate, dist })
      }
    }

    if (candidates.length === 0) break  // plus rien à portée → fin du corridor

    // Score = distance + pénalité de virage (continuité de cap)
    let best: typeof candidates[0] | null = null
    let bestScore = Infinity

    for (const c of candidates) {
      const bearing = Math.atan2(c.cell.lng - current.lng, c.cell.lat - current.lat)
      const turnPenalty = prevBearing === null ? 0 : angularDiff(bearing, prevBearing) * 2.5
      const score = c.dist + turnPenalty
      if (score < bestScore) { bestScore = score; best = c }
    }

    // Au-delà de ce score, la "meilleure" option n'est plus une continuation
    // plausible (ex. cellule de bruit due au digitalisation en escalier de la
    // grille, ou repli d'extrémité) — mieux vaut arrêter le corridor ici que
    // de raccrocher une cellule hors-trajet et recréer un zigzag en bout de ligne.
    // Calibré pour accepter des virages jusqu'à ~100-110° (intersections de
    // rue plausibles) et rejeter les retours en arrière (> ~120°).
    const SCORE_CAP = 6.5
    if (!best || bestScore > SCORE_CAP) break

    prevBearing = Math.atan2(best.cell.lng - current.lng, best.cell.lat - current.lat)
    ordered.push(best.cell)
    remaining.delete(best.key)
    current = best.cell
  }

  return ordered
}

// ─── Extraction des corridors ─────────────────────────────────────────────
// Pipeline :
//   1. Trouver les composantes connexes
//   2. Filtrer les trop petites (bruit)
//   3. Ordonner chaque composante
//   4. Convertir en points lat/lng
//   5. Simplifier avec RDP
//   6. Calculer le count du corridor

export function extractCorridors(
  grid: RawGrid,
  minCount: number = 1,
  minCells: number = 3,
): AggregatedCorridor[] {
  const components = findConnectedComponents(grid.cells, minCount)

  const corridors: AggregatedCorridor[] = []
  let   id = 0

  for (const component of components) {
    // Filtrer les composantes trop petites (bruit ou tracés isolés)
    if (component.length < minCells) continue

    const ordered = orderComponent(component)
    if (ordered.length < 2) continue

    // Convertir les cellules ordonnées en coordonnées géographiques
    const rawPoints: [number, number][] = ordered.map(c => [c.lat, c.lng])

    // Simplification RDP : epsilon = 0.8× la taille d'une cellule
    const epsilon    = grid.cellSize * 0.8
    const simplified = rdp(rawPoints, epsilon)
    if (simplified.length < 2) continue

    // Count du corridor = moyenne des counts des cellules qui le composent
    const counts = component.map(c => c.count)
    const avgCount = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)
    const maxCount = Math.max(...counts)

    corridors.push({
      id:           `corridor-${id++}`,
      points:       simplified,
      count:        avgCount,
      maxCellCount: maxCount,
      label:        `Corridor ${id}`,
    })
  }

  // Trier par count décroissant (plus demandés en premier)
  return corridors.sort((a, b) => b.count - a.count)
}
