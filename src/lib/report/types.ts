// ─── Résumé agrégé envoyé à l'agent (Edge Function generate-report) ───────
// Volontairement compact : pas de géométrie brute (polylignes), pas de donnée
// par soumission individuelle — uniquement les chiffres déjà calculés par les
// moteurs déterministes (ridership/equity/od/budget/aggregation).

export interface ReportSummary {
  ridership: {
    totalDailyRiders: number
    totalPeakRiders:  number
    systemRevenue:    number
    fareboxRecovery:  number
    busesRequired:    number
    routes: { label: string; dailyRiders: number; revenuePerDay: number }[]
  }
  equity: {
    weightedGap:     number
    avgNeedScore:    number
    avgServiceScore: number
    criticalZones: { name: string; gap: number; needScore: number; serviceScore: number }[]
    moderateZones: { name: string; gap: number }[]
  }
  od: {
    totalTrips:   number
    coveredTrips: number
    coveragePct:  number
    topCorridors: { from: string; to: string; trips: number; covered: boolean }[]
    unmetDemand:  { from: string; to: string; trips: number }[]
  }
  budget: {
    capitalTotal:         number
    operatingAnnualTotal: number
    grandTotalYear1:      number
    capitalItems:    { label: string; total: number }[]
    operatingAnnual: { label: string; total: number }[]
  }
  network: {
    totalRoutes:   number
    totalStops:    number
    coverage:      number
    corridorCount: number
    stopCount:     number
  }
}

// ─── Sortie de l'agent ─────────────────────────────────────────────────────

export interface ReportNarrative {
  executive_summary:     string
  ridership_analysis:    string
  equity_analysis:       string
  connectivity_score:    number
  connectivity_analysis: string
  industry_comparison:   string
  budget_narrative:      string
  recommendations:       string[]
}

export interface ReportSource {
  document_title: string
  document_type:  string
  similarity:     number
}

export interface ReportResult {
  data:        ReportSummary
  narrative:   ReportNarrative
  sources:     ReportSource[]
  generatedAt: string
}

export interface AssistantAnswer {
  answer:  string
  sources: ReportSource[]
}
