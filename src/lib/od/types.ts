// ─── Zone géographique du Grand Moncton ───────────────────────────────────
// Chaque zone représente un quartier ou pôle d'activité.
// Le centroïde sert de point d'ancrage pour les lignes de désir (desire lines).
export interface ODZone {
  id:     string
  name:   string
  center: [number, number]   // [lat, lng]
}

// ─── Cellule de la matrice O-D ────────────────────────────────────────────
// Triangle supérieur seulement — le trafic est symétrique (A→B = B→A).
export interface ODCell {
  fromZoneId: string
  toZoneId:   string
  rawCount:   number    // tracés citoyens reliant ces deux zones
  trips:      number    // voyages/jour estimés (rawCount × EXPANSION_FACTOR)
  covered:    boolean   // au moins un corridor actif dessert cette paire?
}

// ─── Résultat complet de la matrice ──────────────────────────────────────
export interface ODMatrix {
  zones:         ODZone[]
  cells:         ODCell[]      // triangle supérieur, triés par trips décroissant
  totalTrips:    number        // somme de tous les voyages estimés
  coveredTrips:  number        // voyages avec desserte directe
  coveragePct:   number        // % voyages avec desserte (pondéré par trips)
  topCorridors:  ODCell[]      // 5 paires à plus forte demande
  unmetDemand:   ODCell[]      // 5 paires les plus demandées sans desserte
  computeTimeMs: number
}
