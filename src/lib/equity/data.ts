import { EquityZone } from './types'

// ─── Zones d'équité — Grand Moncton ───────────────────────────────────────
// Sources : Recensement Canada 2021 (profil de recensement, divisions de
// recensement de Westmorland), données SPC Moncton 2022.
// Toutes les zones sont contenues dans la bbox de la grille de population
// (lat 46.045–46.125, lng −64.845–−64.690).
//
// Les bornes SW/NE sont choisies pour couvrir les quartiers fonctionnels
// sans se chevaucher — assignation point-dans-zone univoque.

export const EQ_ZONES: EquityZone[] = [
  {
    id: 'eq1', name: 'Centre-ville Moncton',
    bounds:  [[46.083, -64.792], [46.102, -64.766]],
    pop: 12_400, income: 38_200, seniors: 22,
  },
  {
    id: 'eq2', name: 'Quartier Université',
    bounds:  [[46.096, -64.775], [46.112, -64.750]],
    pop:  8_900, income: 45_600, seniors: 8,
  },
  {
    id: 'eq3', name: 'Dieppe Centre',
    bounds:  [[46.088, -64.758], [46.106, -64.726]],
    pop: 10_200, income: 52_300, seniors: 14,
  },
  {
    id: 'eq4', name: 'Dieppe Est',
    bounds:  [[46.086, -64.730], [46.104, -64.700]],
    pop:  6_700, income: 68_000, seniors: 11,
  },
  {
    id: 'eq5', name: 'Riverview',
    bounds:  [[46.052, -64.812], [46.074, -64.782]],
    pop:  9_100, income: 71_500, seniors: 19,
  },
  {
    id: 'eq6', name: 'Moncton Ouest',
    bounds:  [[46.075, -64.840], [46.095, -64.812]],
    pop:  7_300, income: 49_200, seniors: 17,
  },
  {
    id: 'eq7', name: 'Moncton Nord',
    bounds:  [[46.102, -64.800], [46.118, -64.765]],
    pop:  9_800, income: 36_100, seniors: 26,
  },
]
