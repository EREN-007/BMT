// ─── Entrée de la grille de population ────────────────────────────────────
export interface PopPoint {
  lat:    number
  lng:    number
  weight: number   // densité relative : 2.0 = cœur urbain, 0.5 = périphérie
}

// ─── Stop minimal requis par le moteur ────────────────────────────────────
export interface CoverageStop {
  id:     string
  type:   'busstop' | 'station'
  pos:    [number, number]    // [lat, lng]
  active: boolean
}

// ─── Zone morte ───────────────────────────────────────────────────────────
// Cluster de points de population non desservis par aucun arrêt actif
export interface DeadZone {
  id:         string
  center:     [number, number]
  bounds:     [[number, number], [number, number]]  // [SW, NE]
  pointCount: number
  urgency:    'high' | 'medium' | 'low'
  // high   ≥ 15 points ≈ > 1 km² sans desserte
  // medium ≥  6 points
  // low    ≥  3 points
}

// ─── Contribution individuelle d'un arrêt ────────────────────────────────
export interface StopContribution {
  stopId:         string
  coveredPoints:  number    // points couverts uniquement par cet arrêt
  coverageDelta:  number    // % de couverture perdu si on le désactive
}

// ─── Résultat complet du moteur ───────────────────────────────────────────
export interface CoverageResult {
  coveragePct:      number   // 0–100 (pondéré par population)
  coveredPoints:    number
  totalPoints:      number
  coveredWeight:    number
  totalWeight:      number
  deadZones:        DeadZone[]
  contributions:    StopContribution[]
  computeTimeMs:    number
}
