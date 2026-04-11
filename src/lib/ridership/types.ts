// ─── Résultat par ligne ────────────────────────────────────────────────────
export interface RidershipRoute {
  routeId:       string
  label:         string
  color:         string
  active:        boolean
  dailyRiders:   number     // montées/jour estimées
  peakRiders:    number     // montées/h en heure de pointe
  avgModeSplit:  number     // part modale moyenne pour ce corridor (%)
  revenuePerDay: number     // recettes billetterie $/jour
}

// ─── Résultat système complet ──────────────────────────────────────────────
export interface RidershipResult {
  routes:            RidershipRoute[]
  totalDailyRiders:  number     // somme toutes lignes actives
  totalPeakRiders:   number     // montées/h en pointe, toutes lignes
  systemRevenue:     number     // recettes $/jour
  fareboxRecovery:   number     // % coût d'exploitation couvert par billetterie
  busesRequired:     number     // parc minimum pour l'heure de pointe
  topRoute:          RidershipRoute | null
  computeTimeMs:     number
}
