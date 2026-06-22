// ─── Contrat de transfert AdminSimulator → AdminFinalMap ──────────────────────
// AdminSimulator écrit ce format dans localStorage['bmt_final_state'] au clic sur
// "Générer la carte finale" ; AdminFinalMap le relit. Partagé entre les deux pour
// que le schéma ne diverge pas silencieusement de part et d'autre.

export type RouteType = 'Principal' | 'Secondaire' | 'Express'
export type StopType  = 'terminus' | 'transfer' | 'station' | 'regular'

export interface FinalRoute {
  id: string
  number: string
  labelFR: string
  labelEN: string
  color: string
  type: RouteType
  frequency: string
  ridership: number
  points: [number, number][]
  midpoint: [number, number]
  stops: string[]
}

export interface FinalStop {
  id: string
  label: string
  labelEN: string
  type: StopType
  pos: [number, number]
  accessible: boolean
  routes: string[]
}

export interface FinalState {
  routes: FinalRoute[]
  stops: FinalStop[]
  isRealData: boolean
  generatedAt: number
}

export const FINAL_STATE_KEY = 'bmt_final_state'
