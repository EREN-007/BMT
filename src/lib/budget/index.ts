import { UnitCost, BudgetLineItem, BudgetResult } from './types'

export type { UnitCost, BudgetLineItem, BudgetResult } from './types'

// ─── Coûts unitaires de départ ─────────────────────────────────────────────
// Valeurs illustratives (ordre de grandeur municipal canadien) — PAS des
// références validées pour Moncton/N.-B. L'admin doit les ajuster avant toute
// présentation officielle (cf. handoff.md, section Risques : "Coûts unitaires
// réels"). Servent de point de départ pour que le moteur produise un chiffre
// dès aujourd'hui plutôt que d'attendre des données externes.

export const DEFAULT_UNIT_COSTS: UnitCost[] = [
  { id: 'cost_per_km',           label: 'Infrastructure / km de ligne',          value: 150_000, unit: '$/km' },
  { id: 'cost_per_busstop',      label: 'Arrêt de bus (abribus, signalisation)', value: 8_000,   unit: '$/arrêt' },
  { id: 'cost_per_station',      label: "Station / pôle d'échange",              value: 250_000, unit: '$/station' },
  { id: 'cost_per_bus',          label: 'Véhicule (autobus conventionnel)',      value: 650_000, unit: '$/véhicule' },
  { id: 'cost_per_vehicle_hour', label: 'Exploitation (heure-véhicule)',         value: 120,     unit: '$/heure' },
]

const M_PER_LAT = 111_320
const M_PER_LNG =  77_340

// Amplitude de service typique d'un réseau urbain (6h-22h) et nombre de jours
// d'exploitation par an (6 jours/semaine) — hypothèses documentées, pas mesurées,
// servent à convertir la flotte requise en heures-véhicule annuelles.
const OPERATING_HOURS_PER_DAY  = 16
const OPERATING_DAYS_PER_YEAR  = 312

function routeLengthKm(points: [number, number][]): number {
  let meters = 0
  for (let i = 1; i < points.length; i++) {
    const [lat1, lng1] = points[i - 1]
    const [lat2, lng2] = points[i]
    const dy = (lat2 - lat1) * M_PER_LAT
    const dx = (lng2 - lng1) * M_PER_LNG
    meters += Math.sqrt(dx * dx + dy * dy)
  }
  return meters / 1000
}

// ─── Moteur de calcul du budget ────────────────────────────────────────────
// Déterministe — aucune génération IA. Applique les coûts unitaires aux
// quantités dérivées du réseau actif (longueur de ligne, arrêts, stations,
// flotte nécessaire selon le moteur d'achalandage).

export function computeBudget(
  routes: Array<{ points: [number, number][]; active: boolean }>,
  stops: Array<{ type: 'busstop' | 'station'; active: boolean }>,
  busesRequired: number,
  costs: UnitCost[],
): BudgetResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const cost = (id: string) => costs.find(c => c.id === id)?.value ?? 0

  const totalKm   = routes.filter(r => r.active).reduce((a, r) => a + routeLengthKm(r.points), 0)
  const active    = stops.filter(s => s.active)
  const busstops  = active.filter(s => s.type === 'busstop').length
  const stations  = active.filter(s => s.type === 'station').length

  const capitalItems: BudgetLineItem[] = [
    {
      id: 'route_km', label: 'Infrastructure de ligne',
      quantity: Math.round(totalKm * 10) / 10, quantityUnit: 'km',
      unitCost: cost('cost_per_km'), total: totalKm * cost('cost_per_km'),
    },
    {
      id: 'busstops', label: 'Arrêts',
      quantity: busstops, quantityUnit: 'arrêts',
      unitCost: cost('cost_per_busstop'), total: busstops * cost('cost_per_busstop'),
    },
    {
      id: 'stations', label: 'Stations',
      quantity: stations, quantityUnit: 'stations',
      unitCost: cost('cost_per_station'), total: stations * cost('cost_per_station'),
    },
    {
      id: 'fleet', label: 'Flotte de véhicules',
      quantity: busesRequired, quantityUnit: 'véhicules',
      unitCost: cost('cost_per_bus'), total: busesRequired * cost('cost_per_bus'),
    },
  ]
  const capitalTotal = capitalItems.reduce((a, i) => a + i.total, 0)

  const vehicleHoursYear = busesRequired * OPERATING_HOURS_PER_DAY * OPERATING_DAYS_PER_YEAR
  const operatingAnnual: BudgetLineItem[] = [
    {
      id: 'vehicle_hours', label: 'Heures-véhicule (exploitation)',
      quantity: vehicleHoursYear, quantityUnit: 'h/an',
      unitCost: cost('cost_per_vehicle_hour'), total: vehicleHoursYear * cost('cost_per_vehicle_hour'),
    },
  ]
  const operatingAnnualTotal = operatingAnnual.reduce((a, i) => a + i.total, 0)

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()

  return {
    capitalItems, capitalTotal,
    operatingAnnual, operatingAnnualTotal,
    grandTotalYear1: capitalTotal + operatingAnnualTotal,
    computeTimeMs: Math.round(t1 - t0),
  }
}
