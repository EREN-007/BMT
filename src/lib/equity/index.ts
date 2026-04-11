import { EquityZone, EquityScore, EquityResult } from './types'
import { CoverageStop, getPopulationGrid, distMeters } from '@/lib/coverage'

export { EQ_ZONES }   from './data'
export type { EquityZone, EquityScore, EquityResult } from './types'

// ═══════════════════════════════════════════════════════════════════════════
// 1 — SCORE DE BESOIN (données démographiques)
// ═══════════════════════════════════════════════════════════════════════════
//
// Trois composantes, pondérées selon leur corrélation avec la dépendance
// au transport en commun (littérature transit-equity) :
//
//   Revenu     50% — faible revenu → forte dépendance au TC
//   Aînés      35% — personnes âgées 65+ → mobilité réduite / pas de voiture
//   Densité    15% — zone dense → TC rentable ET plus nécessaire
//
// Plages de référence calibrées sur Grand Moncton (Recensement 2021) :
//   Revenu médian : 30 000 $ (centile bas) — 75 000 $ (centile haut)
//   Seniors (%)   : 0 % — 30 %
//   Population    : 5 000 — 15 000 hab. par zone (~2 km²)

const INCOME_MIN = 30_000
const INCOME_MAX = 75_000
const SENIOR_MAX = 30
const POP_MIN    =  5_000
const POP_MAX    = 15_000

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function computeNeedScore(zone: EquityZone): number {
  const incomeScore  = clamp((INCOME_MAX - zone.income) / (INCOME_MAX - INCOME_MIN), 0, 1) * 100
  const seniorScore  = clamp(zone.seniors / SENIOR_MAX,                              0, 1) * 100
  const densityScore = clamp((zone.pop - POP_MIN) / (POP_MAX - POP_MIN),             0, 1) * 100

  return Math.round(0.50 * incomeScore + 0.35 * seniorScore + 0.15 * densityScore)
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 — SCORE DE SERVICE (couverture géospatiale réelle)
// ═══════════════════════════════════════════════════════════════════════════
//
// Pour chaque zone, on filtre les points de la grille de population
// (singleton ~2 700 pts) dont les coordonnées tombent dans les limites
// de la zone. Puis, pour chaque point filtré, on cherche l'arrêt actif
// le plus proche et on vérifie s'il est dans le rayon de marche.
//
// serviceScore = Σ(poids points couverts) / Σ(poids points zone) × 100
//
// Complexité : O(zones × pts_zone × arrêts_actifs)
// Avec 7 zones × ~150 pts × ~10 arrêts ≈ 10 500 comparaisons → < 2 ms.

const BUS_RADIUS     = 400   // mètres
const STATION_RADIUS = 800   // mètres

function computeServiceScore(
  zone:        EquityZone,
  activeStops: CoverageStop[],
): number {
  const grid = getPopulationGrid()

  const [[swLat, swLng], [neLat, neLng]] = zone.bounds

  let totalWeight   = 0
  let coveredWeight = 0

  for (const pt of grid) {
    if (pt.lat < swLat || pt.lat > neLat) continue
    if (pt.lng < swLng || pt.lng > neLng) continue

    totalWeight += pt.weight

    if (activeStops.length === 0) continue

    let minDist      = Infinity
    let closestRadius = BUS_RADIUS

    for (const stop of activeStops) {
      const d = distMeters(pt.lat, pt.lng, stop.pos[0], stop.pos[1])
      if (d < minDist) {
        minDist       = d
        closestRadius = stop.type === 'station' ? STATION_RADIUS : BUS_RADIUS
      }
    }

    if (minDist <= closestRadius) coveredWeight += pt.weight
  }

  return totalWeight > 0
    ? Math.round((coveredWeight / totalWeight) * 100)
    : 0
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 — HELPERS D'AFFICHAGE (réexportés pour les composants UI)
// ═══════════════════════════════════════════════════════════════════════════

export function gapLevelColor(level: EquityScore['gapLevel']): string {
  if (level === 'critical') return '#e74c3c'
  if (level === 'moderate') return '#f39c12'
  if (level === 'adequate') return '#f1c40f'
  return '#2ecc71'
}

export function gapLevelLabel(level: EquityScore['gapLevel']): string {
  if (level === 'critical') return 'Critique'
  if (level === 'moderate') return 'Modéré'
  if (level === 'adequate') return 'Adéquat'
  return 'Surplus'
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 — FONCTION PRINCIPALE : computeEquity()
// ═══════════════════════════════════════════════════════════════════════════
//
// Paramètres :
//   stops : liste des arrêts (actifs et inactifs) — compatible SimStop[]
//   zones : zones d'équité à analyser (EQ_ZONES par défaut)
//
// Retourne un EquityResult avec :
//   scores         — toutes les zones triées par écart décroissant
//   criticalZones  — zones en déficit critique (gap ≥ 20)
//   moderateZones  — zones à déséquilibre notable (gap ≥ 10)
//   weightedGap    — inégalité globale pondérée par population

export function computeEquity(
  stops: CoverageStop[],
  zones: EquityZone[],
): EquityResult {
  const t0          = performance.now()
  const activeStops = stops.filter(s => s.active)

  const scores: EquityScore[] = zones.map(zone => {
    const needScore    = computeNeedScore(zone)
    const serviceScore = computeServiceScore(zone, activeStops)
    const gap          = needScore - serviceScore

    const gapLevel: EquityScore['gapLevel'] =
      gap >= 20 ? 'critical' :
      gap >= 10 ? 'moderate' :
      gap >= -10 ? 'adequate' : 'surplus'

    return { zone, needScore, serviceScore, gap, gapLevel }
  })

  // Tri : zones les plus déficitaires en premier
  scores.sort((a, b) => b.gap - a.gap)

  // Métriques globales
  const totalPop      = zones.reduce((s, z) => s + z.pop, 0)
  const weightedGap   = Math.round(
    scores.reduce((s, e) => s + e.zone.pop * e.gap, 0) / totalPop * 10,
  ) / 10

  const n = scores.length
  const avgNeedScore    = Math.round(scores.reduce((s, e) => s + e.needScore,    0) / n)
  const avgServiceScore = Math.round(scores.reduce((s, e) => s + e.serviceScore, 0) / n)

  return {
    scores,
    criticalZones: scores.filter(e => e.gapLevel === 'critical'),
    moderateZones: scores.filter(e => e.gapLevel === 'moderate'),
    weightedGap,
    avgNeedScore,
    avgServiceScore,
    computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
  }
}
