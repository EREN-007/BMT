import { CitizenRoute, CitizenStop, AggregationResult } from './types'
import { buildGrid, aggregateStops, BBOX, CELL_SIZE } from './grid'
import { extractCorridors } from './corridors'

export { BBOX, CELL_SIZE }
export type { CitizenRoute, CitizenStop, AggregatedCorridor, AggregatedStop, AggregationResult } from './types'

// ─── Fonction principale d'agrégation ─────────────────────────────────────
//
// Prend en entrée les données brutes citoyennes et retourne :
//   - Des corridors agrégés (pour Page 5 heatmap)
//   - Des arrêts agrégés   (pour Page 5 stops)
//   - Des statistiques de grille
//
// minCount : nombre minimum de citoyens pour qu'une cellule soit prise en compte
// minCells : nombre minimum de cellules pour qu'un corridor soit conservé

export function aggregate(
  routes: CitizenRoute[],
  stops: CitizenStop[] = [],
  options: { minCount?: number; minCells?: number } = {},
): AggregationResult {
  const { minCount = 1, minCells = 3 } = options

  if (routes.length === 0) {
    return {
      corridors: [],
      stops: aggregateStops(stops),
      totalRoutes: 0,
      totalStops: stops.length,
      processedAt: Date.now(),
      gridStats: { activeCells: 0, maxCellCount: 0, coverage: 0 },
    }
  }

  // 1 — Construire la grille de densité
  const grid = buildGrid(routes)

  // 2 — Statistiques de grille
  const activeCells = grid.cells.size
  const totalCells  = Math.ceil((BBOX.maxLat - BBOX.minLat) / CELL_SIZE)
                    * Math.ceil((BBOX.maxLng - BBOX.minLng) / CELL_SIZE)

  let maxCellCount = 0
  grid.cells.forEach(c => { if (c.count > maxCellCount) maxCellCount = c.count })

  const coverage = Math.round((activeCells / totalCells) * 100 * 10) / 10

  // 3 — Extraire les corridors depuis la grille
  const corridors = extractCorridors(grid, minCount, minCells)

  // 4 — Agréger les arrêts
  const aggregatedStops = aggregateStops(stops)

  return {
    corridors,
    stops: aggregatedStops,
    totalRoutes: routes.length,
    totalStops:  stops.length,
    processedAt: Date.now(),
    gridStats: { activeCells, maxCellCount, coverage },
  }
}
