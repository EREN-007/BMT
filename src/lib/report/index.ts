import { supabase } from '@/lib/supabase'
import type { RidershipResult } from '@/lib/ridership/types'
import type { EquityResult } from '@/lib/equity/types'
import type { ODMatrix } from '@/lib/od/types'
import type { BudgetResult } from '@/lib/budget/types'
import type { AggregationResult } from '@/lib/aggregation/types'
import { ReportSummary, ReportResult, AssistantAnswer } from './types'

export type { ReportSummary, ReportNarrative, ReportSource, ReportResult, AssistantAnswer } from './types'

function zoneName(zones: ODMatrix['zones'], id: string): string {
  return zones.find(z => z.id === id)?.name ?? id
}

// Condense les résultats déjà calculés (moteurs déterministes) en un résumé
// compact destiné à l'agent — cf. supabase/functions/generate-report.
export function buildReportSummary(input: {
  ridership:   RidershipResult
  equity:      EquityResult
  od:          ODMatrix
  budget:      BudgetResult
  aggregation: AggregationResult
}): ReportSummary {
  const { ridership, equity, od, budget, aggregation } = input

  return {
    ridership: {
      totalDailyRiders: ridership.totalDailyRiders,
      totalPeakRiders:  ridership.totalPeakRiders,
      systemRevenue:    ridership.systemRevenue,
      fareboxRecovery:  ridership.fareboxRecovery,
      busesRequired:    ridership.busesRequired,
      routes: ridership.routes
        .filter(r => r.active)
        .map(r => ({ label: r.label, dailyRiders: r.dailyRiders, revenuePerDay: r.revenuePerDay })),
    },
    equity: {
      weightedGap:     equity.weightedGap,
      avgNeedScore:    equity.avgNeedScore,
      avgServiceScore: equity.avgServiceScore,
      criticalZones: equity.criticalZones.map(z => ({
        name: z.zone.name, gap: z.gap, needScore: z.needScore, serviceScore: z.serviceScore,
      })),
      moderateZones: equity.moderateZones.map(z => ({ name: z.zone.name, gap: z.gap })),
    },
    od: {
      totalTrips:   od.totalTrips,
      coveredTrips: od.coveredTrips,
      coveragePct:  od.coveragePct,
      topCorridors: od.topCorridors.map(c => ({
        from: zoneName(od.zones, c.fromZoneId), to: zoneName(od.zones, c.toZoneId), trips: c.trips, covered: c.covered,
      })),
      unmetDemand: od.unmetDemand.map(c => ({
        from: zoneName(od.zones, c.fromZoneId), to: zoneName(od.zones, c.toZoneId), trips: c.trips,
      })),
    },
    budget: {
      capitalTotal:         budget.capitalTotal,
      operatingAnnualTotal: budget.operatingAnnualTotal,
      grandTotalYear1:      budget.grandTotalYear1,
      capitalItems:    budget.capitalItems.map(i => ({ label: i.label, total: i.total })),
      operatingAnnual: budget.operatingAnnual.map(i => ({ label: i.label, total: i.total })),
    },
    network: {
      totalRoutes:   aggregation.totalRoutes,
      totalStops:    aggregation.totalStops,
      coverage:      aggregation.gridStats.coverage,
      corridorCount: aggregation.corridors.length,
      stopCount:     aggregation.stops.length,
    },
  }
}

export async function generateReport(summary: ReportSummary): Promise<ReportResult> {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: { mode: 'report', data: summary },
  })
  if (error) throw error
  return data as ReportResult
}

export async function askAssistant(summary: ReportSummary, question: string): Promise<AssistantAnswer> {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: { mode: 'question', question, data: summary },
  })
  if (error) throw error
  return data as AssistantAnswer
}
