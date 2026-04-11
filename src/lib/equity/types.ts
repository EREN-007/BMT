// ─── Zone démographique ────────────────────────────────────────────────────
// Chaque zone est définie par ses limites géographiques et ses données
// socio-économiques issues des recensements Statistics Canada.
export interface EquityZone {
  id:      string
  name:    string
  bounds:  [[number, number], [number, number]]   // [SW, NE]
  // Données démographiques (Recensement 2021, Grand Moncton)
  pop:     number    // population totale
  income:  number    // revenu médian annuel des ménages ($)
  seniors: number    // % de personnes âgées 65+ ans
}

// ─── Score d'équité d'une zone ────────────────────────────────────────────
export interface EquityScore {
  zone:         EquityZone
  needScore:    number    // 0–100 : besoin de transit (score démographique)
  serviceScore: number    // 0–100 : niveau de service réel (couverture géospatiale)
  gap:          number    // needScore − serviceScore (+= zone sous-desservie)
  gapLevel:     'critical' | 'moderate' | 'adequate' | 'surplus'
  //   critical  gap ≥ 20  — zone à forte demande, très peu desservie
  //   moderate  gap ≥ 10  — déséquilibre notable
  //   adequate  gap ≥ −10 — approximativement équitable
  //   surplus   gap < −10 — service supérieur au besoin
}

// ─── Résultat complet de l'analyse d'équité ──────────────────────────────
export interface EquityResult {
  scores:          EquityScore[]    // toutes les zones, triées gap décroissant
  criticalZones:   EquityScore[]    // gap ≥ 20
  moderateZones:   EquityScore[]    // 10 ≤ gap < 20
  weightedGap:     number           // Σ(pop_i × gap_i) / Σ(pop_i) — inégalité pop.
  avgNeedScore:    number
  avgServiceScore: number
  computeTimeMs:   number
}
