import { RidershipRoute, RidershipResult } from './types'
import { EquityScore, EquityZone } from '@/lib/equity'
import { ODMatrix, ODZone } from '@/lib/od'

export type { RidershipRoute, RidershipResult } from './types'

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES DE CALIBRATION — Grand Moncton
// ═══════════════════════════════════════════════════════════════════════════
//
// BASE_TRIPS_PER_RESIDENT : déplacements TC / résident / jour
//   Codiac Transpo 2019 (pré-COVID) : ~1,8M montées / an
//   Population desservie estimée    : ~85 000 personnes
//   → 1 800 000 / (85 000 × 365) ≈ 0,058 ≈ 0,06
//
// PEAK_HOUR_FACTOR : % des déplacements quotidiens concentrés
//                   sur l'heure de pointe AM (typique Canada : 12–14 %)
//
// EFFECTIVE_FARE : tarif moyen pondéré (65 % adulte 2,75 $ + 35 % concession 2,00 $)
//
// OPERATING_COST_RIDER : coût d'exploitation / montée (petite ville canadienne)
//
// BUS_CAPACITY : capacité de confort d'un autobus 40 pi (taux de charge 72 %)

const BASE_TRIPS_PER_RESIDENT = 0.060
const PEAK_HOUR_FACTOR        = 0.120
const EFFECTIVE_FARE          = 2.49
const OPERATING_COST_RIDER    = 8.50
const BUS_CAPACITY            = 52

// Projection planaire identique au moteur de couverture (46°N)
const M_PER_LAT = 111_320
const M_PER_LNG =  77_340

// ═══════════════════════════════════════════════════════════════════════════
// 1 — AFFECTATION POINT → ZONE D'ÉQUITÉ
// ═══════════════════════════════════════════════════════════════════════════
// Priorité : contenance dans les limites → centroïde le plus proche.
// Garantit qu'aucun point de route n'est laissé sans zone.

function findEqZone(lat: number, lng: number, eqZones: EquityZone[]): EquityZone {
  for (const z of eqZones) {
    const [[swLat, swLng], [neLat, neLng]] = z.bounds
    if (lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng) return z
  }
  // Fallback : centroïde le plus proche
  let best     = eqZones[0]
  let bestDist = Infinity
  for (const z of eqZones) {
    const cLat = (z.bounds[0][0] + z.bounds[1][0]) / 2
    const cLng = (z.bounds[0][1] + z.bounds[1][1]) / 2
    const dy = (lat - cLat) * M_PER_LAT
    const dx = (lng - cLng) * M_PER_LNG
    const d2 = dx * dx + dy * dy
    if (d2 < bestDist) { bestDist = d2; best = z }
  }
  return best
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 — FACTEUR DE PART MODALE
// ═══════════════════════════════════════════════════════════════════════════
// Ajuste la propension à utiliser le TC selon le profil socio-économique.
// Plage : 0,85 (zone aisée, forte possession automobile) →
//         1,35 (zone défavorisée, forte dépendance au TC)
//
// needScore provient du moteur d'équité (revenu 50 % + aînés 35 % + densité 15 %).

function modeSplitFactor(needScore: number): number {
  return 0.85 + 0.50 * (needScore / 100)
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 — FACTEUR D'AJUSTEMENT O-D
// ═══════════════════════════════════════════════════════════════════════════
// Compare la demande moyenne dans les corridors O-D servis par la ligne
// à la moyenne système. Une ligne sur un corridor très demandé gagne
// jusqu'à +15 % ; sur un corridor peu demandé, elle perd jusqu'à −15 %.

function odAdjustmentFactor(
  eqZonesOfRoute: Set<string>,
  equityScores:   EquityScore[],
  odMatrix:       ODMatrix | null,
  odZones:        ODZone[],
): number {
  if (!odMatrix || odMatrix.cells.length === 0) return 1.0

  // Mapper chaque zone d'équité vers la zone O-D la plus proche
  const routeOdZones = new Set<string>()
  for (const eqId of eqZonesOfRoute) {
    const eq = equityScores.find(s => s.zone.id === eqId)
    if (!eq) continue
    const cLat = (eq.zone.bounds[0][0] + eq.zone.bounds[1][0]) / 2
    const cLng = (eq.zone.bounds[0][1] + eq.zone.bounds[1][1]) / 2

    let bestOd   = odZones[0]
    let bestDist = Infinity
    for (const oz of odZones) {
      const dy = (cLat - oz.center[0]) * M_PER_LAT
      const dx = (cLng - oz.center[1]) * M_PER_LNG
      const d2 = dx * dx + dy * dy
      if (d2 < bestDist) { bestDist = d2; bestOd = oz }
    }
    routeOdZones.add(bestOd.id)
  }

  // Cellules O-D desservies par la ligne
  const servedCells = odMatrix.cells.filter(c =>
    routeOdZones.has(c.fromZoneId) && routeOdZones.has(c.toZoneId),
  )
  if (servedCells.length === 0) return 0.85

  const avgSystem = odMatrix.totalTrips / odMatrix.cells.length
  const avgRoute  = servedCells.reduce((s, c) => s + c.trips, 0) / servedCells.length

  // Facteur ∈ [0,85 ; 1,15]
  return Math.min(1.15, Math.max(0.85, 0.85 + 0.30 * (avgRoute / avgSystem)))
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 — FONCTION PRINCIPALE : computeRidership()
// ═══════════════════════════════════════════════════════════════════════════
//
// Modèle en trois étapes :
//   A. Génération : population servie × taux de base × facteur socio-éco.
//   B. Ajustement O-D : correction selon la demande réelle des citoyens.
//   C. Affectation proportionnelle : quand plusieurs lignes couvrent la
//      même zone, la population est répartie équitablement.
//
// Paramètres :
//   simRoutes     : lignes du simulateur (actives/inactives)
//   equityScores  : résultats du moteur d'équité (needScore par zone)
//   odMatrix      : matrice O-D (peut être null si non calculée)
//   odZones       : 10 zones O-D (pour le mapping EQ → OD)
//   eqZones       : 7 zones d'équité (données démo + bounds)

export function computeRidership(
  simRoutes: Array<{
    id:     string
    label:  string
    color:  string
    points: [number, number][]
    active: boolean
  }>,
  equityScores: EquityScore[],
  odMatrix:     ODMatrix | null,
  odZones:      ODZone[],
  eqZones:      EquityZone[],
): RidershipResult {
  const t0 = performance.now()

  const eqScoreMap = new Map(equityScores.map(s => [s.zone.id, s]))

  // ── Étape A : zones d'équité par ligne ───────────────────────────────────
  const routeEqZones = new Map<string, Set<string>>()
  for (const route of simRoutes) {
    const zones = new Set<string>()
    for (const [lat, lng] of route.points) {
      zones.add(findEqZone(lat, lng, eqZones).id)
    }
    routeEqZones.set(route.id, zones)
  }

  // ── Étape B : nombre de lignes actives par zone (pour allocation) ─────────
  const zoneRouteCount = new Map<string, number>()
  for (const route of simRoutes) {
    if (!route.active) continue
    for (const zId of routeEqZones.get(route.id) ?? new Set()) {
      zoneRouteCount.set(zId, (zoneRouteCount.get(zId) ?? 0) + 1)
    }
  }

  // ── Étape C : achalandage par ligne ───────────────────────────────────────
  const ridershipRoutes: RidershipRoute[] = simRoutes.map(route => {
    if (!route.active) {
      return {
        routeId: route.id, label: route.label, color: route.color,
        active: false, dailyRiders: 0, peakRiders: 0,
        avgModeSplit: 0, revenuePerDay: 0,
      }
    }

    const zones    = routeEqZones.get(route.id) ?? new Set<string>()
    const odFactor = odAdjustmentFactor(zones, equityScores, odMatrix, odZones)

    let rawRiders  = 0
    let wMsf       = 0   // moyenne pondérée du facteur de part modale
    let totalPop   = 0

    for (const eqId of zones) {
      const score = eqScoreMap.get(eqId)
      if (!score) continue

      // Répartition proportionnelle entre lignes concurrentes
      const nRoutes = zoneRouteCount.get(eqId) ?? 1
      const pop     = score.zone.pop / nRoutes
      const msf     = modeSplitFactor(score.needScore)

      rawRiders += pop * BASE_TRIPS_PER_RESIDENT * msf
      wMsf      += msf * pop
      totalPop  += pop
    }

    const daily   = Math.round(rawRiders * odFactor)
    const avgMsf  = totalPop > 0 ? wMsf / totalPop : BASE_TRIPS_PER_RESIDENT

    return {
      routeId:       route.id,
      label:         route.label,
      color:         route.color,
      active:        true,
      dailyRiders:   daily,
      peakRiders:    Math.round(daily * PEAK_HOUR_FACTOR),
      avgModeSplit:  Math.round(avgMsf * 1000) / 10,   // %, 1 décimale
      revenuePerDay: Math.round(daily * EFFECTIVE_FARE),
    }
  })

  // ── Indicateurs système ───────────────────────────────────────────────────
  const totalDailyRiders = ridershipRoutes.reduce((s, r) => s + r.dailyRiders,   0)
  const totalPeakRiders  = ridershipRoutes.reduce((s, r) => s + r.peakRiders,    0)
  const systemRevenue    = ridershipRoutes.reduce((s, r) => s + r.revenuePerDay, 0)
  const operatingCost    = totalDailyRiders * OPERATING_COST_RIDER
  const fareboxRecovery  = operatingCost > 0
    ? Math.round((systemRevenue / operatingCost) * 100)
    : 0

  const active  = ridershipRoutes.filter(r => r.active && r.dailyRiders > 0)
  const topRoute = active.length > 0
    ? active.reduce((best, r) => r.dailyRiders > best.dailyRiders ? r : best)
    : null

  return {
    routes:           ridershipRoutes,
    totalDailyRiders,
    totalPeakRiders,
    systemRevenue,
    fareboxRecovery,
    busesRequired:    Math.ceil(totalPeakRiders / BUS_CAPACITY),
    topRoute,
    computeTimeMs:    Math.round((performance.now() - t0) * 10) / 10,
  }
}
