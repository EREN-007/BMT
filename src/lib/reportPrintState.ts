// ─── Contrat de transfert AdminSimulator → AdminReportPrint ───────────────────
// AdminSimulator écrit ce format dans localStorage['bmt_report_print_state'] au clic
// sur "Exporter / Imprimer" (onglet Rapport IA) ; AdminReportPrint le relit. Partagé
// entre les deux pour que le schéma ne diverge pas silencieusement de part et d'autre.
// Même convention que src/lib/finalState.ts (déjà utilisé pour AdminFinalMap).

import { ReportResult } from '@/lib/report/types'
import { FinalRoute, FinalStop } from '@/lib/finalState'

export interface ReportPrintState {
  report: ReportResult
  routes: FinalRoute[]
  stops:  FinalStop[]
}

export const REPORT_PRINT_STATE_KEY = 'bmt_report_print_state'
