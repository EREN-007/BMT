// ─── Données brutes citoyennes ─────────────────────────────────────────────
// Sauvegardées par MapPage (application mobile) dans localStorage

export interface CitizenRoute {
  id: string
  timestamp: number          // epoch ms
  sessionId: string          // une session = une soumission citoyenne
  color: string
  points: [number, number][] // [lat, lng]
}

export interface CitizenStop {
  id: string
  timestamp: number
  sessionId: string
  type: 'busstop' | 'station'
  pos: [number, number]
  label: string
}

// ─── Grille spatiale ───────────────────────────────────────────────────────
// Chaque cellule agrège tous les tracés citoyens qui la traversent

export interface GridCell {
  row: number
  col: number
  count: number        // nb de routes DISTINCTES passant par cette cellule
  lat: number          // latitude du centre de la cellule
  lng: number          // longitude du centre de la cellule
  sumBearingX: number  // composante X de la somme des bearings (pour moyenne circulaire)
  sumBearingY: number  // composante Y
}

export interface RawGrid {
  cells: Map<string, GridCell>
  rows: number
  cols: number
  minLat: number
  minLng: number
  cellSize: number
}

// ─── Résultat de l'agrégation ─────────────────────────────────────────────

export interface AggregatedCorridor {
  id: string
  points: [number, number][]
  count: number        // nb de citoyens ayant tracé ce corridor
  maxCellCount: number // pic de densité dans ce corridor
  label: string
}

export interface AggregatedStop {
  id: string
  pos: [number, number]
  type: 'busstop' | 'station'
  count: number
  label: string
}

export interface AggregationResult {
  corridors: AggregatedCorridor[]
  stops: AggregatedStop[]
  totalRoutes: number
  totalStops: number
  processedAt: number
  gridStats: {
    activeCells: number
    maxCellCount: number
    coverage: number  // % de la zone avec au moins 1 tracé
  }
}
