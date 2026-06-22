import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapContainer, TileLayer, Circle, Marker, Popup, Polyline, Rectangle, useMapEvents, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computeCoverage, CoverageResult } from '@/lib/coverage'
import {
  buildODMatrix, computeCoveredPairs, ODMatrix, OD_ZONES,
} from '@/lib/od'
import {
  computeEquity, gapLevelColor, gapLevelLabel, EquityResult, EQ_ZONES,
} from '@/lib/equity'
import { computeRidership, RidershipResult } from '@/lib/ridership'
import { computeBudget, BudgetResult, UnitCost, DEFAULT_UNIT_COSTS } from '@/lib/budget'
import { getBudgetCosts, saveBudgetCosts } from '@/lib/budget/storage'
import { aggregate, AggregatedCorridor, AggregatedStop, AggregationResult } from '@/lib/aggregation'
import { getRoutes, getStops } from '@/lib/storage'
import { getLang, ADMIN_T } from '@/lib/lang'
import { FinalRoute, FinalStop, FINAL_STATE_KEY } from '@/lib/finalState'
import { buildReportSummary, generateReport, askAssistant, ReportResult, AssistantAnswer } from '@/lib/report'

const MB_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
const MB_STYLE  = `https://api.mapbox.com/styles/v1/erenjager/cmo26m3v5004l01rufhpcgo8b/tiles/256/{z}/{x}/{y}@2x?access_token=${MB_TOKEN}`

delete (L.Icon.Default.prototype as any)._getIconUrl

function InvalidateSize() {
  const map = useMap()
  useEffect(() => { map.invalidateSize() }, [map])
  return null
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimStop {
  id: string
  label: string
  type: 'busstop' | 'station'
  pos: [number, number]
  active: boolean
  demand: number
}

interface SimRoute {
  id: string
  label: string
  points: [number, number][]
  active: boolean
  color: string
}

type TabId = 'simulation' | 'achalandage' | 'scenarios' | 'od' | 'equite' | 'budget' | 'rapport'

interface Scenario {
  id: string
  label: string
  stops: SimStop[]
  routes: SimRoute[]
  coveragePct: number
  ridership: number
  deadZones: number
  activeStops: number
  activeRoutes: number
}

// ─── Données initiales ────────────────────────────────────────────────────────

const INIT_STOPS: SimStop[] = [
  { id: 's1',  label: 'Centre-ville — Main & Highfield', type: 'busstop',  pos: [46.0878, -64.7782], active: true,  demand: 42 },
  { id: 's2',  label: 'Champlain Place',                  type: 'busstop',  pos: [46.0821, -64.7720], active: true,  demand: 35 },
  { id: 's3',  label: 'Université de Moncton',            type: 'busstop',  pos: [46.1020, -64.7600], active: true,  demand: 30 },
  { id: 's4',  label: 'Dieppe Centre Commercial',         type: 'busstop',  pos: [46.0960, -64.7440], active: true,  demand: 28 },
  { id: 's5',  label: 'Highfield Square',                 type: 'busstop',  pos: [46.0931, -64.7830], active: true,  demand: 22 },
  { id: 's6',  label: 'Wheeler Blvd & Mountain Rd',       type: 'busstop',  pos: [46.0980, -64.7700], active: true,  demand: 18 },
  { id: 's7',  label: 'Riverview Civic Centre',           type: 'busstop',  pos: [46.0620, -64.7950], active: true,  demand: 14 },
  { id: 's8',  label: 'Dieppe Rue Acadie',                type: 'busstop',  pos: [46.0988, -64.7350], active: false, demand: 12 },
  { id: 's9',  label: 'Moncton Hospital',                 type: 'busstop',  pos: [46.0960, -64.7740], active: false, demand: 9  },
  { id: 's10', label: 'Riverview Plaza',                  type: 'busstop',  pos: [46.0562, -64.8022], active: false, demand: 7  },
  { id: 'st1', label: 'Gare centrale Moncton',            type: 'station',  pos: [46.0920, -64.7750], active: true,  demand: 38 },
  { id: 'st2', label: 'Station Dieppe — Pôle Acadie',     type: 'station',  pos: [46.0975, -64.7400], active: true,  demand: 24 },
  { id: 'st3', label: 'Station Riverview',                type: 'station',  pos: [46.0630, -64.7970], active: false, demand: 15 },
]

const INIT_ROUTES: SimRoute[] = [
  { id: 'r1', label: 'Ligne A — Centre ↔ Champlain',  color: '#e74c3c',
    points: [[46.0972,-64.7901],[46.0931,-64.7830],[46.0878,-64.7782],[46.0840,-64.7740],[46.0821,-64.7720]], active: true },
  { id: 'r2', label: 'Ligne B — Wheeler Blvd',         color: '#3498db',
    points: [[46.1020,-64.7600],[46.0980,-64.7680],[46.0930,-64.7750],[46.0878,-64.7782],[46.0830,-64.7820]], active: true },
  { id: 'r3', label: 'Ligne C — Dieppe Acadie',        color: '#2ecc71',
    points: [[46.0988,-64.7350],[46.0960,-64.7440],[46.0935,-64.7530],[46.0910,-64.7640],[46.0878,-64.7782]], active: true },
  { id: 'r4', label: 'Ligne D — Pont Riverview',       color: '#f39c12',
    points: [[46.0878,-64.7782],[46.0820,-64.7800],[46.0760,-64.7830],[46.0700,-64.7900],[46.0630,-64.7970]], active: false },
]

const COVERAGE_RADIUS = 400
const STATION_RADIUS  = 800
const MONCTON_CENTER: [number, number] = [46.075, -64.760]
const M_PER_LAT = 111_320
const M_PER_LNG =  77_340

// ─── Seed à partir des vraies données citoyennes agrégées ────────────────────
// Quand l'agrégation produit assez de corridors/arrêts, le simulateur démarre
// sur ces données réelles plutôt que sur le jeu de démonstration — sinon
// "Générer la carte finale" produit un résultat fictif sans que l'admin le sache.

const SEED_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e']

function seedRoutesFromCorridors(corridors: AggregatedCorridor[]): SimRoute[] {
  return corridors.map((c, i) => ({
    id:     c.id,
    label:  `${c.label} (${c.count} citoyen${c.count > 1 ? 's' : ''})`,
    points: c.points,
    active: true,
    color:  SEED_COLORS[i % SEED_COLORS.length],
  }))
}

function seedStopsFromAggregated(stops: AggregatedStop[]): SimStop[] {
  return stops.map(s => ({
    id:     s.id,
    label:  `${s.label} (${s.count} citoyen${s.count > 1 ? 's' : ''})`,
    type:   s.type,
    pos:    s.pos,
    active: true,
    demand: s.count * 5,
  }))
}

// ─── Association route → arrêts pour modélisation d'achalandage ──────────────
// Dynamique (plutôt qu'une table statique) car les ids des routes/arrêts seedés
// depuis les vraies données n'ont aucun rapport avec ceux du jeu de démo.

function nearbyStopIds(route: SimRoute, stops: SimStop[], radiusM = 400): string[] {
  const ids: string[] = []
  for (const stop of stops) {
    const near = route.points.some(([lat, lng]) => {
      const dy = (lat - stop.pos[0]) * M_PER_LAT
      const dx = (lng - stop.pos[1]) * M_PER_LNG
      return Math.sqrt(dx * dx + dy * dy) <= radiusM
    })
    if (near) ids.push(stop.id)
  }
  return ids
}

// ─── Calcul des métriques de couverture ───────────────────────────────────────

function computeMetrics(stops: SimStop[]) {
  const active        = stops.filter(s => s.active)
  const buses         = active.filter(s => s.type === 'busstop').length
  const stations      = active.filter(s => s.type === 'station').length
  const totalDemand   = stops.reduce((a, s) => a + s.demand, 0)
  const coveredDemand = active.reduce((a, s) => a + s.demand, 0)
  const coveragePct   = Math.round((coveredDemand / totalDemand) * 100)
  const deadZones     = stops.filter(s => !s.active && s.demand >= 10).length
  const spread        = active.length >= 6 ? 'Optimale' : active.length >= 3 ? 'Moyenne' : 'Faible'
  return { buses, stations, coveragePct, deadZones, spread, active: active.length }
}

// ─── Modélisation d'achalandage ───────────────────────────────────────────────
// Formule : demande agrégée des arrêts actifs × fréquence journalière × facteur de charge
// En heure de pointe : × 1.8 (AM/PM rush)

const DAILY_TRIPS     = 10    // passages/jour par sens
const PEAK_FACTOR     = 1.8
const LOAD_FACTOR     = 0.72  // % d'occupation moyen

function computeRouteRidership(route: SimRoute, stops: SimStop[], peak: boolean): number {
  if (!route.active) return 0
  const ids        = nearbyStopIds(route, stops, COVERAGE_RADIUS)
  const stopObjs   = ids.map(id => stops.find(s => s.id === id)).filter(Boolean) as SimStop[]
  const demand     = stopObjs.filter(s => s.active).reduce((a, s) => a + s.demand, 0)
  const base       = demand * DAILY_TRIPS * LOAD_FACTOR
  return Math.round(peak ? base * PEAK_FACTOR : base)
}

function computeTotalRidership(routes: SimRoute[], stops: SimStop[], peak: boolean): number {
  return routes.reduce((a, r) => a + computeRouteRidership(r, stops, peak), 0)
}

// ─── Custom icons ─────────────────────────────────────────────────────────────

function makeIcon(type: 'busstop' | 'station', active: boolean) {
  const color   = active ? (type === 'busstop' ? '#1255a0' : '#e6b800') : '#555'
  const outline = active ? 'white' : '#888'
  return L.divIcon({
    html: `<div style="
      width:${type==='station'?20:16}px;height:${type==='station'?20:16}px;
      border-radius:50%;background:${color};border:2.5px solid ${outline};
      box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:grab;
    "></div>`,
    className: '', iconSize: [20, 20], iconAnchor: [10, 10],
  })
}

// ─── Composant arrêt draggable ─────────────────────────────────────────────────

interface DraggableStopProps {
  stop: SimStop
  onDragEnd: (id: string, pos: [number, number]) => void
  onToggle: (id: string) => void
  showCoverage: boolean
}

function DraggableStop({ stop, onDragEnd, onToggle, showCoverage }: DraggableStopProps) {
  const t      = ADMIN_T[getLang()]
  const radius = stop.type === 'station' ? STATION_RADIUS : COVERAGE_RADIUS
  const coverageColor = stop.active
    ? stop.demand >= 25 ? '#2ecc71' : stop.demand >= 12 ? '#f39c12' : '#ecf0f1'
    : 'transparent'

  return (
    <>
      {showCoverage && stop.active && (
        <Circle
          center={stop.pos}
          radius={radius}
          pathOptions={{ color: coverageColor, fillColor: coverageColor, fillOpacity: 0.12, weight: 1.5, opacity: 0.5 }}
        />
      )}
      <Marker
        position={stop.pos}
        icon={makeIcon(stop.type, stop.active)}
        draggable={true}
        eventHandlers={{
          dragend(e) {
            const ll = (e.target as L.Marker).getLatLng()
            onDragEnd(stop.id, [ll.lat, ll.lng])
          },
        }}
      >
        <Popup>
          <div style={{ minWidth: 200 }}>
            <strong>{stop.type === 'station' ? '🏢' : '🚏'} {stop.label}</strong>
            <br />
            <span style={{ color: '#555', fontSize: '0.82rem' }}>
              {stop.demand} citoyens · {stop.type === 'station' ? `${STATION_RADIUS}m` : `${COVERAGE_RADIUS}m`} de couverture
            </span>
            <br /><br />
            <button
              onClick={() => onToggle(stop.id)}
              style={{
                padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: stop.active ? '#e74c3c' : '#2ecc71', color: 'white',
                fontSize: '0.82rem', fontWeight: 700,
              }}
            >
              {stop.active ? t.stopDeact : t.stopActivate}
            </button>
          </div>
        </Popup>
      </Marker>
    </>
  )
}

// ─── Ajout d'arrêt par clic ───────────────────────────────────────────────────

function AddStopOnClick({ adding, onAdd }: { adding: boolean; onAdd: (pos: [number,number]) => void }) {
  useMapEvents({
    click(e) {
      if (adding) onAdd([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

// ─── Tab : Achalandage ────────────────────────────────────────────────────────

function TabAchalandage({
  ridershipResult,
}: {
  ridershipResult: RidershipResult | null
}) {
  const t    = ADMIN_T[getLang()]
  const [peak, setPeak] = useState(false)

  if (!ridershipResult) {
    return (
      <div className="sim-tab-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem' }}>{t.simLoadRid}</p>
      </div>
    )
  }

  const displayed  = peak ? ridershipResult.totalPeakRiders : ridershipResult.totalDailyRiders
  const maxRiders  = Math.max(...ridershipResult.routes.map(r => peak ? r.peakRiders : r.dailyRiders), 1)
  const fbrColor   = ridershipResult.fareboxRecovery >= 25 ? '#2ecc71'
    : ridershipResult.fareboxRecovery >= 12 ? '#f39c12' : '#e74c3c'

  return (
    <div className="sim-tab-content">

      {/* ── Total ── */}
      <div className="sim-total-card">
        <div className="sim-total-value">{displayed.toLocaleString()}</div>
        <div className="sim-total-label">
          {peak ? t.ridPeakUnit : t.ridDayUnit}
        </div>
      </div>

      {/* ── Toggle pointe ── */}
      <div className="sim-toggle-row" style={{ marginBottom: 10 }}>
        <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
          {t.ridPeakToggle}
        </span>
        <button className={`sim-toggle ${peak ? 'sim-toggle-on' : ''}`} onClick={() => setPeak(v => !v)}>
          {peak ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* ── Indicateurs financiers ── */}
      <div className="rid-fin-card">
        <div className="rid-fin-row">
          <span>{t.ridRevenue}</span>
          <strong>{ridershipResult.systemRevenue.toLocaleString()} $/j</strong>
        </div>
        <div className="rid-fin-row">
          <span>{t.ridFarebox}</span>
          <strong style={{ color: fbrColor }}>{ridershipResult.fareboxRecovery} %</strong>
        </div>
        <div className="rid-fin-row">
          <span>{t.ridBuses}</span>
          <strong>{ridershipResult.busesRequired} {t.ridBusUnit}</strong>
        </div>
      </div>

      {/* ── Barres par ligne ── */}
      <p className="sim-section-title">{t.ridByLine}</p>
      <div className="sim-ridership-list">
        {ridershipResult.routes.map(r => {
          const val   = peak ? r.peakRiders : r.dailyRiders
          const width = r.active ? Math.round((val / maxRiders) * 100) : 0
          return (
            <div key={r.routeId} className="sim-ridership-item">
              <div className="sim-ridership-header">
                <span className="sim-ridership-name">{r.label}</span>
                <span className="sim-ridership-count">
                  {r.active ? val.toLocaleString() : '—'}
                </span>
              </div>
              <div className="sim-ridership-bar-track">
                <div
                  className="sim-ridership-bar-fill"
                  style={{ width: `${width}%`, background: r.active ? r.color : '#333' }}
                />
              </div>
              {r.active && (
                <div className="rid-route-meta">
                  {t.ridModeSplit(r.avgModeSplit.toFixed(1), r.revenuePerDay)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Analyse ── */}
      {ridershipResult.topRoute && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.15)',
          fontSize: '0.73rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
        }}>
          <span style={{ color: '#FFD700', fontWeight: 700 }}>{t.ridAnalysis}</span>
          {t.ridTopRoute(ridershipResult.topRoute.label, ridershipResult.topRoute.dailyRiders)}
          {ridershipResult.fareboxRecovery < 20 && (
            <span style={{ color: '#f39c12' }}>
              {' '}{t.ridFbWarn(ridershipResult.fareboxRecovery)}
            </span>
          )}
        </div>
      )}

      <div style={{ fontSize: '0.60rem', color: 'rgba(255,255,255,0.18)', marginTop: 8 }}>
        calc. {ridershipResult.computeTimeMs} ms · base 0,06 voy/résident/j
      </div>
    </div>
  )
}

// ─── Tab : Scénarios ──────────────────────────────────────────────────────────

function TabScenarios({
  stops, routes,
  scenarios, onSave,
}: {
  stops: SimStop[]
  routes: SimRoute[]
  scenarios: { A: Scenario | null; B: Scenario | null }
  onSave: (slot: 'A' | 'B') => void
}) {
  const t       = ADMIN_T[getLang()]
  const m       = computeMetrics(stops)
  const current: Scenario = {
    id: 'current', label: t.scenCurrent,
    stops, routes,
    coveragePct:  m.coveragePct,
    ridership:    computeTotalRidership(routes, stops, false),
    deadZones:    m.deadZones,
    activeStops:  m.active,
    activeRoutes: routes.filter(r => r.active).length,
  }

  const rows: (Scenario | null)[] = [current, scenarios.A, scenarios.B]
  const defined = rows.filter(Boolean) as Scenario[]

  // highlight best value per metric
  const bestCov     = Math.max(...defined.map(s => s.coveragePct))
  const bestRide    = Math.max(...defined.map(s => s.ridership))
  const bestDead    = Math.min(...defined.map(s => s.deadZones))

  return (
    <div className="sim-tab-content">
      {/* Save slots */}
      <div className="sim-scenario-slots">
        {(['A', 'B'] as const).map(slot => (
          <div key={slot} className="sim-scenario-slot">
            <div className="sim-scenario-slot-header">
              <span className="sim-scenario-slot-label">{t.scenSlot(slot)}</span>
              <button className="sim-scenario-save-btn" onClick={() => onSave(slot)}>
                {t.scenSave}
              </button>
            </div>
            {scenarios[slot] ? (
              <div className="sim-scenario-metrics">
                <span className="sim-scenario-metric">{t.scenCov} <strong>{scenarios[slot]!.coveragePct}%</strong></span>
                <span className="sim-scenario-metric">{t.scenPass} <strong>{scenarios[slot]!.ridership.toLocaleString()}</strong></span>
                <span className="sim-scenario-metric">{t.scenDead} <strong>{scenarios[slot]!.deadZones}</strong></span>
                <span className="sim-scenario-metric">{t.scenActive} <strong>{scenarios[slot]!.activeStops}</strong></span>
              </div>
            ) : (
              <span className="sim-scenario-empty">{t.scenEmpty}</span>
            )}
          </div>
        ))}
      </div>

      {/* Tableau comparatif */}
      {defined.length > 1 && (
        <>
          <p className="sim-section-title">{t.scenCompare}</p>
          <table className="sim-compare-table">
            <thead>
              <tr>
                <th>{t.scenThScen}</th>
                <th>{t.scenThCov}</th>
                <th>{t.scenThPass}</th>
                <th>{t.scenThDead}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                if (!s) return null
                const isCurrent = s.id === 'current'
                return (
                  <tr key={s.id}>
                    <td className={isCurrent ? 'sim-compare-current' : ''}>
                      {isCurrent ? t.scenCurrent : t.scenSlot(s.id)}
                    </td>
                    <td className={
                      s.coveragePct === bestCov    ? 'sim-compare-best'
                        : defined.length > 1 && s.coveragePct === Math.min(...defined.map(x => x.coveragePct)) ? 'sim-compare-worst' : ''
                    }>
                      {s.coveragePct}%
                    </td>
                    <td className={
                      s.ridership === bestRide     ? 'sim-compare-best'
                        : defined.length > 1 && s.ridership === Math.min(...defined.map(x => x.ridership)) ? 'sim-compare-worst' : ''
                    }>
                      {s.ridership.toLocaleString()}
                    </td>
                    <td className={
                      s.deadZones === bestDead     ? 'sim-compare-best'
                        : defined.length > 1 && s.deadZones === Math.max(...defined.map(x => x.deadZones)) ? 'sim-compare-worst' : ''
                    }>
                      {s.deadZones}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginTop: 8, lineHeight: 1.5 }}>
            {t.scenNote}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab : Équité ────────────────────────────────────────────────────────────

function TabEquite({ equityResult }: { equityResult: EquityResult | null }) {
  const t = ADMIN_T[getLang()]
  if (!equityResult) {
    return (
      <div className="sim-tab-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem' }}>{t.simLoadEq}</p>
      </div>
    )
  }

  const wg       = equityResult.weightedGap
  const wgColor  = wg >= 15 ? '#e74c3c' : wg >= 5 ? '#f39c12' : '#2ecc71'

  return (
    <div className="sim-tab-content">

      {/* ── KPI ── */}
      <div className="eq-kpi-card">
        <div className="eq-kpi-row">
          <div className="eq-kpi">
            <span className="eq-kpi-value" style={{ color: wgColor }}>
              {wg > 0 ? '+' : ''}{wg}
            </span>
            <span className="eq-kpi-label">{t.eqWGap}</span>
          </div>
          <div className="eq-kpi">
            <span className="eq-kpi-value" style={{ color: equityResult.criticalZones.length > 0 ? '#e74c3c' : '#2ecc71' }}>
              {equityResult.criticalZones.length}
            </span>
            <span className="eq-kpi-label">{t.eqCritZones}</span>
          </div>
          <div className="eq-kpi">
            <span className="eq-kpi-value">{equityResult.avgServiceScore}%</span>
            <span className="eq-kpi-label">{t.eqAvgSvc}</span>
          </div>
        </div>

        {equityResult.criticalZones.length > 0 ? (
          <div style={{
            marginTop: 8, padding: '6px 10px', borderRadius: 6,
            background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)',
            fontSize: '0.70rem', color: '#e74c3c',
          }}>
            {t.eqCritWarn(equityResult.criticalZones[0].zone.name, equityResult.criticalZones[0].gap)}
          </div>
        ) : (
          <div style={{
            marginTop: 8, padding: '6px 10px', borderRadius: 6,
            background: 'rgba(46,204,113,0.07)', border: '1px solid rgba(46,204,113,0.2)',
            fontSize: '0.70rem', color: '#2ecc71',
          }}>
            {t.eqOk}
          </div>
        )}
      </div>

      {/* ── Zones triées par écart ── */}
      <p className="sim-section-title">{t.eqByZone}</p>
      <div className="eq-zone-list">
        {equityResult.scores.map(score => {
          const color = gapLevelColor(score.gapLevel)
          const label = gapLevelLabel(score.gapLevel)
          return (
            <div key={score.zone.id} className={`eq-zone-item eq-item-${score.gapLevel}`}>
              <div className="eq-zone-header">
                <span className="eq-zone-name">{score.zone.name}</span>
                <span className="eq-zone-badge" style={{ color, borderColor: `${color}55`, background: `${color}15` }}>
                  {label}
                </span>
              </div>

              {/* Need */}
              <div className="eq-bar-row">
                <span className="eq-bar-label">{t.eqNeed}</span>
                <div className="eq-bar-track">
                  <div className="eq-bar-fill" style={{ width: `${score.needScore}%`, background: '#c0392b' }} />
                </div>
                <span className="eq-bar-val">{score.needScore}</span>
              </div>
              {/* Service */}
              <div className="eq-bar-row">
                <span className="eq-bar-label">{t.eqService}</span>
                <div className="eq-bar-track">
                  <div className="eq-bar-fill" style={{ width: `${score.serviceScore}%`, background: color }} />
                </div>
                <span className="eq-bar-val">{score.serviceScore}</span>
              </div>

              <div className="eq-gap-line" style={{ color }}>
                {t.eqGap(score.gap)}
                <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 8 }}>
                  · {t.eqMeta(score.zone.income, score.zone.seniors)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: '0.60rem', color: 'rgba(255,255,255,0.18)', marginTop: 10 }}>
        calc. {equityResult.computeTimeMs} ms · {equityResult.scores.length} zones · besoin moy. {equityResult.avgNeedScore}
      </div>
    </div>
  )
}

// ─── Tab : Matrice O-D ───────────────────────────────────────────────────────

function TabOD({ odMatrix }: { odMatrix: ODMatrix | null }) {
  const t = ADMIN_T[getLang()]
  if (!odMatrix) {
    return (
      <div className="sim-tab-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem' }}>{t.simLoadOD}</p>
      </div>
    )
  }

  const zoneMap  = new Map(odMatrix.zones.map(z => [z.id, z.name]))
  const maxTrips = odMatrix.cells[0]?.trips ?? 1

  const covColor = odMatrix.coveragePct >= 60 ? '#2ecc71'
    : odMatrix.coveragePct >= 35 ? '#f39c12' : '#e74c3c'

  return (
    <div className="sim-tab-content">

      {/* ── KPI ── */}
      <div className="od-summary-card">
        <div className="od-kpi-row">
          <div className="od-kpi">
            <span className="od-kpi-value">{odMatrix.totalTrips.toLocaleString()}</span>
            <span className="od-kpi-label">{t.odTrips}</span>
          </div>
          <div className="od-kpi">
            <span className="od-kpi-value" style={{ color: covColor }}>{odMatrix.coveragePct}%</span>
            <span className="od-kpi-label">{t.odWithSvc}</span>
          </div>
        </div>

        {/* Barre couverture */}
        <div className="od-progress-track">
          <div className="od-progress-fill" style={{ width: `${odMatrix.coveragePct}%`, background: covColor }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
          <span>0</span>
          <span>{odMatrix.coveredTrips.toLocaleString()} desservis</span>
          <span>{odMatrix.totalTrips.toLocaleString()}</span>
        </div>
      </div>

      {/* ── Top corridors ── */}
      <p className="sim-section-title">{t.odTopCor}</p>
      <div className="od-corridor-list">
        {odMatrix.topCorridors.map(cell => {
          const from  = zoneMap.get(cell.fromZoneId) ?? cell.fromZoneId
          const to    = zoneMap.get(cell.toZoneId)   ?? cell.toZoneId
          const width = Math.round((cell.trips / maxTrips) * 100)
          return (
            <div key={`${cell.fromZoneId}|${cell.toZoneId}`} className="od-corridor-item">
              <div className="od-corridor-header">
                <span className="od-corridor-name">{from} → {to}</span>
                <span className={`od-corridor-badge ${cell.covered ? 'od-badge-ok' : 'od-badge-gap'}`}>
                  {cell.covered ? '✓' : '⚠'}
                </span>
              </div>
              <div className="od-bar-track">
                <div className="od-bar-fill" style={{
                  width: `${width}%`,
                  background: cell.covered ? '#3498db' : '#e74c3c',
                }} />
              </div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                {t.odCorTrips(cell.trips, cell.rawCount)}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Demande non desservie ── */}
      {odMatrix.unmetDemand.length > 0 && (
        <>
          <p className="sim-section-title" style={{ marginTop: 14 }}>{t.odUnmet}</p>
          <div className="od-corridor-list">
            {odMatrix.unmetDemand.map(cell => {
              const from = zoneMap.get(cell.fromZoneId) ?? cell.fromZoneId
              const to   = zoneMap.get(cell.toZoneId)   ?? cell.toZoneId
              return (
                <div key={`unmet-${cell.fromZoneId}|${cell.toZoneId}`} className="od-corridor-item od-item-gap">
                  <div className="od-corridor-header">
                    <span className="od-corridor-name">{from} → {to}</span>
                    <span className="od-corridor-trips">{cell.trips.toLocaleString()} voy/j</span>
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#e74c3c', marginTop: 2 }}>
                    {t.odUnmetDet(cell.rawCount)}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {odMatrix.unmetDemand.length === 0 && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(46,204,113,0.07)', border: '1px solid rgba(46,204,113,0.2)',
          fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)',
        }}>
          {t.odAllServed}
        </div>
      )}

      <div style={{ fontSize: '0.60rem', color: 'rgba(255,255,255,0.18)', marginTop: 10 }}>
        calc. {odMatrix.computeTimeMs} ms · {odMatrix.cells.length} paires · EXPANSION ×{50}
      </div>
    </div>
  )
}

// ─── Tab : Budget ─────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function TabBudget({
  budgetResult, costs, onCostChange, onSave, saving, saveError,
}: {
  budgetResult: BudgetResult | null
  costs: UnitCost[]
  onCostChange: (id: string, value: number) => void
  onSave: () => void
  saving: boolean
  saveError: boolean
}) {
  const t = ADMIN_T[getLang()]

  if (!budgetResult) {
    return (
      <div className="sim-tab-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem' }}>{t.simLoadBudget}</p>
      </div>
    )
  }

  return (
    <div className="sim-tab-content">

      {/* ── Total ── */}
      <div className="sim-total-card">
        <div className="sim-total-value">{fmtMoney(budgetResult.grandTotalYear1)} $</div>
        <div className="sim-total-label">{t.budgetYear1Total}</div>
      </div>

      <div style={{
        margin: '8px 0 12px', padding: '8px 10px', borderRadius: 8,
        background: 'rgba(243,156,18,0.08)', border: '1px solid rgba(243,156,18,0.2)',
        fontSize: '0.68rem', color: '#f39c12', lineHeight: 1.5,
      }}>
        {t.budgetEstimateWarn}
      </div>

      {/* ── Capital ── */}
      <p className="sim-section-title">{t.budgetCapital}</p>
      <div className="sim-ridership-list">
        {budgetResult.capitalItems.map(item => (
          <div key={item.id} className="sim-ridership-item">
            <div className="sim-ridership-header">
              <span className="sim-ridership-name">{item.label}</span>
              <span className="sim-ridership-count">{fmtMoney(item.total)} $</span>
            </div>
            <div className="rid-route-meta">
              {item.quantity.toLocaleString()} {item.quantityUnit} × {fmtMoney(item.unitCost)} $
            </div>
          </div>
        ))}
        <div className="sim-ridership-item">
          <div className="sim-ridership-header">
            <strong style={{ fontSize: '0.78rem' }}>{t.budgetCapitalTotal}</strong>
            <strong style={{ fontSize: '0.78rem' }}>{fmtMoney(budgetResult.capitalTotal)} $</strong>
          </div>
        </div>
      </div>

      {/* ── Exploitation annuelle ── */}
      <p className="sim-section-title" style={{ marginTop: 14 }}>{t.budgetOperating}</p>
      <div className="sim-ridership-list">
        {budgetResult.operatingAnnual.map(item => (
          <div key={item.id} className="sim-ridership-item">
            <div className="sim-ridership-header">
              <span className="sim-ridership-name">{item.label}</span>
              <span className="sim-ridership-count">{fmtMoney(item.total)} $</span>
            </div>
            <div className="rid-route-meta">
              {item.quantity.toLocaleString()} {item.quantityUnit} × {fmtMoney(item.unitCost)} $
            </div>
          </div>
        ))}
      </div>

      {/* ── Coûts unitaires éditables ── */}
      <p className="sim-section-title" style={{ marginTop: 14 }}>{t.budgetUnitCosts}</p>
      <div className="sim-ridership-list">
        {costs.map(c => (
          <div key={c.id} className="sim-item-row">
            <span className="sim-item-label" style={{ fontSize: '0.74rem' }}>{c.label}</span>
            <input
              type="number"
              value={c.value}
              onChange={e => onCostChange(c.id, Number(e.target.value))}
              style={{
                width: 90, padding: '4px 6px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)',
                color: 'white', fontSize: '0.74rem', textAlign: 'right',
              }}
            />
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', minWidth: 50 }}>{c.unit}</span>
          </div>
        ))}
      </div>

      {saveError && <span className="f4-error">{t.budgetSaveError}</span>}

      <button
        className="sim-btn"
        style={{
          width: '100%', marginTop: 10, background: 'rgba(255,215,0,0.1)',
          border: '1px solid rgba(255,215,0,0.4)', color: '#FFD700', fontWeight: 700,
        }}
        onClick={onSave}
        disabled={saving}
      >
        {saving ? t.budgetSaving : t.budgetSaveCosts}
      </button>

      <div style={{ fontSize: '0.60rem', color: 'rgba(255,255,255,0.18)', marginTop: 10 }}>
        calc. {budgetResult.computeTimeMs} ms
      </div>
    </div>
  )
}

// ─── Tab : Rapport IA (agent generate-report, semaine 4) ──────────────────────

function TabReport({
  canGenerate, report, reportLoading, reportError, onGenerate,
  question, onQuestionChange, answer, askLoading, askError, onAsk,
}: {
  canGenerate: boolean
  report: ReportResult | null
  reportLoading: boolean
  reportError: boolean
  onGenerate: () => void
  question: string
  onQuestionChange: (v: string) => void
  answer: AssistantAnswer | null
  askLoading: boolean
  askError: boolean
  onAsk: () => void
}) {
  const t = ADMIN_T[getLang()]

  return (
    <div className="sim-tab-content">

      <button
        className="sim-btn"
        style={{
          width: '100%', background: 'rgba(255,215,0,0.1)',
          border: '1px solid rgba(255,215,0,0.4)', color: '#FFD700', fontWeight: 700,
        }}
        onClick={onGenerate}
        disabled={!canGenerate || reportLoading}
      >
        {reportLoading ? t.reportGenerating : t.reportGenerate}
      </button>

      {reportError && (
        <div style={{
          marginTop: 8, padding: '6px 10px', borderRadius: 6,
          background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)',
          fontSize: '0.70rem', color: '#e74c3c',
        }}>
          {t.reportError}
        </div>
      )}

      {!report && !reportLoading && !reportError && (
        <p style={{ marginTop: 12, color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem' }}>{t.reportEmpty}</p>
      )}

      {report && (
        <>
          <div className="sim-total-card" style={{ marginTop: 12 }}>
            <div className="sim-total-value">{report.narrative.connectivity_score}/100</div>
            <div className="sim-total-label">{t.reportConnectivity}</div>
          </div>

          {([
            ['reportExecSummary',     report.narrative.executive_summary],
            ['reportRidership',       report.narrative.ridership_analysis],
            ['reportEquity',          report.narrative.equity_analysis],
            ['reportConnectivity',    report.narrative.connectivity_analysis],
            ['reportIndustry',        report.narrative.industry_comparison],
            ['reportBudgetNarrative', report.narrative.budget_narrative],
          ] as const).map(([key, text]) => (
            <div key={key} style={{ marginTop: 12 }}>
              <p className="sim-section-title">{t[key]}</p>
              <p style={{ fontSize: '0.78rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.8)' }}>{text}</p>
            </div>
          ))}

          <p className="sim-section-title" style={{ marginTop: 12 }}>{t.reportRecommendations}</p>
          <div className="sim-ridership-list">
            {report.narrative.recommendations.map((rec, i) => (
              <div key={i} className="sim-ridership-item">
                <span style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>{rec}</span>
              </div>
            ))}
          </div>

          <p className="sim-section-title" style={{ marginTop: 12 }}>{t.reportSources}</p>
          {report.sources.length === 0 ? (
            <p style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.35)' }}>{t.reportNoSources}</p>
          ) : (
            <div className="sim-ridership-list">
              {report.sources.map((s, i) => (
                <div key={i} className="sim-item-row">
                  <span className="sim-item-label" style={{ fontSize: '0.74rem' }}>{s.document_title}</span>
                  <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>{Math.round(s.similarity * 100)}%</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: '0.60rem', color: 'rgba(255,255,255,0.18)', marginTop: 10 }}>
            {new Date(report.generatedAt).toLocaleString()}
          </div>
        </>
      )}

      {/* ── Assistant IA — Q/R libre ── */}
      <p className="sim-section-title" style={{ marginTop: 18 }}>{t.reportAskTitle}</p>
      <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{t.reportAskSub}</p>
      <textarea
        className="f4-textarea"
        placeholder={t.reportAskPlaceholder}
        value={question}
        onChange={e => onQuestionChange(e.target.value)}
        rows={3}
      />
      <button
        className="sim-btn"
        style={{ width: '100%', marginTop: 8 }}
        onClick={onAsk}
        disabled={!canGenerate || askLoading || !question.trim()}
      >
        {askLoading ? t.reportAskLoading : t.reportAskButton}
      </button>
      {askError && <span className="f4-error">{t.reportAskError}</span>}
      {answer && (
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <p style={{ fontSize: '0.78rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.85)' }}>{answer.answer}</p>
          {answer.sources.length > 0 && (
            <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
              {t.reportSources} : {answer.sources.map(s => s.document_title).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Props {
  onLogout: () => void
}

function AdminSimulator({ onLogout }: Props) {
  const navigate = useNavigate()
  const lang     = getLang()
  const t        = ADMIN_T[lang]
  const [stops,        setStops]        = useState<SimStop[]>(INIT_STOPS)
  const [routes,       setRoutes]       = useState<SimRoute[]>(INIT_ROUTES)
  const [showCoverage, setShowCoverage] = useState(true)
  const [showRoutes,   setShowRoutes]   = useState(true)
  const [addingStop,   setAddingStop]   = useState(false)
  const [lastImpact,   setLastImpact]   = useState<{ id: string; type: 'gain'|'loss' } | null>(null)
  const [activeTab,      setActiveTab]      = useState<TabId>('simulation')
  const [scenarios,      setScenarios]      = useState<{ A: Scenario | null; B: Scenario | null }>({ A: null, B: null })
  const [coverageResult, setCoverageResult] = useState<CoverageResult | null>(null)
  const [showDeadZones,  setShowDeadZones]  = useState(true)
  const [odMatrix,       setOdMatrix]       = useState<ODMatrix | null>(null)
  const [equityResult,    setEquityResult]   = useState<EquityResult | null>(null)
  const [ridershipResult, setRidershipResult] = useState<RidershipResult | null>(null)
  const [usingRealData,   setUsingRealData]   = useState(false)
  const [budgetResult,    setBudgetResult]    = useState<BudgetResult | null>(null)
  const [unitCosts,       setUnitCosts]       = useState<UnitCost[]>(DEFAULT_UNIT_COSTS)
  const [savingCosts,     setSavingCosts]     = useState(false)
  const [saveCostsError,  setSaveCostsError]  = useState(false)
  const [aggResult,       setAggResult]       = useState<AggregationResult | null>(null)
  const [report,          setReport]          = useState<ReportResult | null>(null)
  const [reportLoading,   setReportLoading]   = useState(false)
  const [reportError,     setReportError]     = useState(false)
  const [question,        setQuestion]        = useState('')
  const [answer,          setAnswer]          = useState<AssistantAnswer | null>(null)
  const [askLoading,      setAskLoading]      = useState(false)
  const [askError,        setAskError]        = useState(false)
  const counterRef      = useRef(100)
  const citizenRoutesRef = useRef<Array<{ points: [number, number][] }>>([])
  const seedStopsRef     = useRef<SimStop[]>(INIT_STOPS)
  const seedRoutesRef    = useRef<SimRoute[]>(INIT_ROUTES)

  // ── Moteur de couverture — recalcul à chaque changement d'arrêts ──────────
  useEffect(() => {
    const result = computeCoverage(stops)
    setCoverageResult(result)
  }, [stops])

  // ── Moteur d'équité — recalcul à chaque changement d'arrêts ──────────────
  useEffect(() => {
    const result = computeEquity(stops, EQ_ZONES)
    setEquityResult(result)
  }, [stops])

  // ── Chargement + agrégation des données citoyennes (une seule fois au montage) ──
  // Si assez de tracés/arrêts réels existent, le simulateur démarre dessus plutôt
  // que sur le jeu de démonstration — sinon "Générer la carte finale" produirait
  // un résultat fictif que rien ne distingue de vraies données.
  useEffect(() => {
    Promise.all([getRoutes(), getStops()]).then(([citizenRoutes, citizenStops]) => {
      citizenRoutesRef.current = citizenRoutes
      const agg        = aggregate(citizenRoutes, citizenStops)
      setAggResult(agg)
      const realRoutes  = seedRoutesFromCorridors(agg.corridors)
      const realStops   = seedStopsFromAggregated(agg.stops)
      if (realRoutes.length === 0 && realStops.length === 0) return

      const seededRoutes = realRoutes.length > 0 ? realRoutes : INIT_ROUTES
      const seededStops  = realStops.length  > 0 ? realStops  : INIT_STOPS
      seedRoutesRef.current = seededRoutes
      seedStopsRef.current  = seededStops
      setRoutes(seededRoutes)
      setStops(seededStops)
      setUsingRealData(true)
    })
  }, [])

  // ── Matrice O-D — recalcul quand les lignes actives changent ─────────────
  useEffect(() => {
    const coveredPairs = computeCoveredPairs(routes, OD_ZONES)
    const matrix       = buildODMatrix(citizenRoutesRef.current, OD_ZONES, coveredPairs)
    setOdMatrix(matrix)
  }, [routes])

  // ── Achalandage — recalcul quand lignes OU résultats équité/OD changent ──
  useEffect(() => {
    if (!equityResult) return
    const result = computeRidership(routes, equityResult.scores, odMatrix, OD_ZONES, EQ_ZONES)
    setRidershipResult(result)
  }, [routes, equityResult, odMatrix])

  // ── Coûts unitaires — chargés une seule fois au montage ──────────────────
  useEffect(() => {
    getBudgetCosts().then(setUnitCosts)
  }, [])

  // ── Budget — recalcul quand le réseau, l'achalandage ou les coûts changent ──
  useEffect(() => {
    const result = computeBudget(routes, stops, ridershipResult?.busesRequired ?? 0, unitCosts)
    setBudgetResult(result)
  }, [routes, stops, ridershipResult, unitCosts])

  const metrics     = computeMetrics(stops)
  const pct         = coverageResult?.coveragePct ?? metrics.coveragePct
  const dzCount     = coverageResult?.deadZones.length ?? metrics.deadZones
  const impactColor = pct >= 70 ? '#2ecc71' : pct >= 45 ? '#f39c12' : '#e74c3c'
  const impactLabel = pct >= 70 ? t.simExcellent : pct >= 45 ? t.simAccept : t.simInsuff

  const handleDragEnd = useCallback((id: string, pos: [number, number]) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, pos } : s))
    setLastImpact(null)
  }, [])

  const handleToggle = useCallback((id: string) => {
    setStops(prev => prev.map(s => {
      if (s.id !== id) return s
      const next = { ...s, active: !s.active }
      setLastImpact({ id, type: next.active ? 'gain' : 'loss' })
      return next
    }))
  }, [])

  const handleToggleRoute = useCallback((id: string) => {
    setRoutes(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r))
  }, [])

  const handleAddStop = useCallback((pos: [number, number]) => {
    const id = `new-${++counterRef.current}`
    setStops(prev => [...prev, {
      id, label: t.simNewStop(counterRef.current),
      type: 'busstop', pos, active: true, demand: 5,
    }])
    setAddingStop(false)
    setLastImpact({ id, type: 'gain' })
  }, [])

  const handleReset = () => {
    setStops(seedStopsRef.current)
    setRoutes(seedRoutesRef.current)
    setLastImpact(null)
  }

  const handleGenerateFinal = useCallback(() => {
    const activeRoutes = routes.filter(r => r.active)
    const dailyRiders   = (id: string) => ridershipResult?.routes.find(x => x.routeId === id)?.dailyRiders ?? 0
    const topRidership  = activeRoutes.length > 0 ? Math.max(...activeRoutes.map(r => dailyRiders(r.id))) : 0

    const finalRoutes: FinalRoute[] = activeRoutes.map((r, i) => {
      const number   = String((i + 1) * 10)
      const rid      = dailyRiders(r.id)
      const servedIds = nearbyStopIds(r, stops, COVERAGE_RADIUS)
      const servedLbl = servedIds
        .map(id => stops.find(s => s.id === id)?.label)
        .filter((l): l is string => !!l)
      return {
        id: r.id, number,
        labelFR: `Ligne ${number} — ${r.label}`,
        labelEN: `Route ${number} — ${r.label}`,
        color: r.color,
        type: topRidership > 0 && rid === topRidership ? 'Principal' : 'Secondaire',
        frequency: rid >= 500 ? '15 min' : rid >= 250 ? '20 min' : '30 min',
        ridership: rid,
        points: r.points,
        midpoint: r.points[Math.floor(r.points.length / 2)],
        stops: servedLbl,
      }
    })

    const stopRouteNumbers = new Map<string, string[]>()
    activeRoutes.forEach((r, i) => {
      const number = String((i + 1) * 10)
      nearbyStopIds(r, stops, COVERAGE_RADIUS).forEach(stopId => {
        const list = stopRouteNumbers.get(stopId) ?? []
        list.push(number)
        stopRouteNumbers.set(stopId, list)
      })
    })

    const finalStops: FinalStop[] = stops
      .filter(s => stopRouteNumbers.has(s.id))
      .map(s => ({
        id: s.id, label: s.label, labelEN: s.label,
        type: s.type === 'station' ? 'station' : 'regular',
        pos: s.pos, accessible: true,
        routes: stopRouteNumbers.get(s.id) ?? [],
      }))

    localStorage.setItem(FINAL_STATE_KEY, JSON.stringify({
      routes: finalRoutes,
      stops: finalStops,
      isRealData: usingRealData,
      generatedAt: Date.now(),
    }))
    navigate('/carte-finale')
  }, [routes, stops, ridershipResult, usingRealData, navigate])

  const handleSaveScenario = useCallback((slot: 'A' | 'B') => {
    const m = computeMetrics(stops)
    setScenarios(prev => ({
      ...prev,
      [slot]: {
        id: slot, label: `Scénario ${slot}`,
        stops: JSON.parse(JSON.stringify(stops)),
        routes: JSON.parse(JSON.stringify(routes)),
        coveragePct:  coverageResult?.coveragePct ?? m.coveragePct,
        ridership:    ridershipResult?.totalDailyRiders ?? computeTotalRidership(routes, stops, false),
        deadZones:    coverageResult?.deadZones.length ?? m.deadZones,
        activeStops:  m.active,
        activeRoutes: routes.filter(r => r.active).length,
      },
    }))
  }, [stops, routes, coverageResult, ridershipResult])

  const handleCostChange = useCallback((id: string, value: number) => {
    setUnitCosts(prev => prev.map(c => c.id === id ? { ...c, value } : c))
  }, [])

  const handleSaveCosts = useCallback(() => {
    setSaveCostsError(false)
    setSavingCosts(true)
    saveBudgetCosts(unitCosts)
      .catch(err => { console.error('saveBudgetCosts failed', err); setSaveCostsError(true) })
      .finally(() => setSavingCosts(false))
  }, [unitCosts])

  const canGenerateReport = !!(equityResult && odMatrix && ridershipResult && budgetResult && aggResult)

  const handleGenerateReport = useCallback(() => {
    if (!equityResult || !odMatrix || !ridershipResult || !budgetResult || !aggResult) return
    setReportError(false)
    setReportLoading(true)
    const summary = buildReportSummary({
      ridership: ridershipResult, equity: equityResult, od: odMatrix,
      budget: budgetResult, aggregation: aggResult,
    })
    generateReport(summary)
      .then(setReport)
      .catch(err => { console.error('generateReport failed', err); setReportError(true) })
      .finally(() => setReportLoading(false))
  }, [equityResult, odMatrix, ridershipResult, budgetResult, aggResult])

  const handleAsk = useCallback(() => {
    if (!equityResult || !odMatrix || !ridershipResult || !budgetResult || !aggResult || !question.trim()) return
    setAskError(false)
    setAskLoading(true)
    const summary = buildReportSummary({
      ridership: ridershipResult, equity: equityResult, od: odMatrix,
      budget: budgetResult, aggregation: aggResult,
    })
    askAssistant(summary, question.trim())
      .then(setAnswer)
      .catch(err => { console.error('askAssistant failed', err); setAskError(true) })
      .finally(() => setAskLoading(false))
  }, [equityResult, odMatrix, ridershipResult, budgetResult, aggResult, question])

  const TABS: { id: TabId; label: string }[] = [
    { id: 'simulation',  label: t.simTabSim  },
    { id: 'achalandage', label: t.simTabAch  },
    { id: 'scenarios',   label: t.simTabScen },
    { id: 'od',          label: t.simTabOD   },
    { id: 'equite',      label: t.simTabEq   },
    { id: 'budget',      label: t.simTabBudget },
    { id: 'rapport',     label: t.simTabReport },
  ]

  return (
    <div className="db-root">

      {/* ── Sidebar nav (icon-only) ── */}
      <aside className="db-sidebar" style={{ minWidth: 60, width: 60, padding: '12px 6px' }}>
        <div className="db-sidebar-brand" style={{ fontSize: '0.55rem', padding: '0 2px 8px' }}>BMT</div>
        <nav className="db-nav">
          <a className="db-nav-item" style={{ cursor:'pointer', padding:'8px 6px', gap:0, flexDirection:'column' }} onClick={() => navigate('/dashboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}>
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </a>
          <a className="db-nav-item" style={{ cursor:'pointer', padding:'8px 6px', gap:0, flexDirection:'column' }} onClick={() => navigate('/carte')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}>
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
            </svg>
          </a>
          <a className="db-nav-item db-nav-active" style={{ padding:'8px 6px', gap:0, flexDirection:'column' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </a>
          <a className="db-nav-item" style={{ cursor:'pointer', padding:'8px 6px', gap:0, flexDirection:'column' }} onClick={() => navigate('/documents')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}>
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          </a>
        </nav>
        <button className="db-logout" style={{ padding:'8px 6px', marginTop:'auto', gap:0 }} onClick={onLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:16,height:16}}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </aside>

      {/* ── Map ── */}
      <div className="mp-map-wrap" style={{ flex: 1, height: '100dvh', minWidth: 0, position: 'relative', overflow: 'hidden' }}>
        <MapContainer
          center={MONCTON_CENTER} zoom={13} className="mp-leaflet"
          style={{ width: '100%', height: '100%', cursor: addingStop ? 'crosshair' : undefined }}
        >
          <InvalidateSize />
          <TileLayer
            url={MB_STYLE}
            attribution='&copy; <a href="https://mapbox.com">Mapbox</a>'
            tileSize={512}
            zoomOffset={-1}
          />

          {showRoutes && routes.filter(r => r.active).map(r => (
            <Polyline key={r.id} positions={r.points}
              pathOptions={{ color: r.color, weight: 5, opacity: 0.75, lineCap: 'round' }} />
          ))}

          {stops.map(s => (
            <DraggableStop
              key={s.id} stop={s}
              onDragEnd={handleDragEnd} onToggle={handleToggle}
              showCoverage={showCoverage}
            />
          ))}

          {/* Zones mortes — clusters de population non desservis */}
          {showDeadZones && coverageResult?.deadZones.map(dz => (
            <Rectangle
              key={dz.id}
              bounds={dz.bounds}
              pathOptions={{
                color:       dz.urgency === 'high' ? '#e74c3c' : dz.urgency === 'medium' ? '#f39c12' : '#888',
                fillColor:   dz.urgency === 'high' ? '#e74c3c' : dz.urgency === 'medium' ? '#f39c12' : '#888',
                fillOpacity: dz.urgency === 'high' ? 0.18 : dz.urgency === 'medium' ? 0.12 : 0.06,
                weight: 1.5, dashArray: '5 4',
              }}
            />
          ))}

          <AddStopOnClick adding={addingStop} onAdd={handleAddStop} />
        </MapContainer>

        {addingStop && (
          <div className="mp-hint mp-hint-drawing">
            {t.simClickAdd}
          </div>
        )}
      </div>

      {/* ── Panneau droit ── */}
      <aside className="sim-panel">

        {/* Header */}
        <div className="sim-panel-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2" style={{width:18,height:18,flexShrink:0}}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <div>
            <h2 className="sim-title">{t.simTitle}</h2>
            <p className="sim-subtitle">{t.simSub}</p>
          </div>
        </div>

        <div style={{
          margin: '0 16px 10px', fontSize: '0.68rem', fontWeight: 700,
          color: usingRealData ? '#2ecc71' : 'rgba(255,255,255,0.35)',
        }}>
          {usingRealData ? t.simDataReal : t.simDataDemo}
        </div>

        {/* Score couverture (toujours visible) */}
        <div className="sim-score-card">
          <div className="sim-score-ring" style={{ '--score-color': impactColor, '--score-pct': pct } as React.CSSProperties}>
            <span className="sim-score-value">{pct}%</span>
            <span className="sim-score-unit">{t.simCoverage}</span>
          </div>
          <div className="sim-score-info">
            <span className="sim-score-label" style={{ color: impactColor }}>{impactLabel}</span>
            <div className="sim-score-details">
              <span>🚏 {metrics.buses}</span>
              <span>🏢 {metrics.stations}</span>
              <span>⚠️ {t.simDeadZone(dzCount)}</span>
              {coverageResult && (
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem' }}>
                  calc. {coverageResult.computeTimeMs} ms
                </span>
              )}
            </div>
          </div>
        </div>

        {lastImpact && (
          <div className={`sim-impact-alert ${lastImpact.type === 'gain' ? 'sim-gain' : 'sim-loss'}`}>
            {lastImpact.type === 'gain' ? t.simGain : t.simLoss}
          </div>
        )}

        {/* Onglets */}
        <div className="sim-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`sim-tab ${activeTab === t.id ? 'sim-tab-active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Onglet Simulation ── */}
        {activeTab === 'simulation' && (
          <div className="sim-tab-content">
            <div className="sim-section">
              <p className="sim-section-title">{t.simDisplay}</p>
              <label className="sim-toggle-row">
                <span>{t.simCovZones}</span>
                <button className={`sim-toggle ${showCoverage ? 'sim-toggle-on' : ''}`} onClick={() => setShowCoverage(v => !v)}>
                  {showCoverage ? 'ON' : 'OFF'}
                </button>
              </label>
              <label className="sim-toggle-row">
                <span>{t.simBusLines}</span>
                <button className={`sim-toggle ${showRoutes ? 'sim-toggle-on' : ''}`} onClick={() => setShowRoutes(v => !v)}>
                  {showRoutes ? 'ON' : 'OFF'}
                </button>
              </label>
              <label className="sim-toggle-row">
                <span>{t.simDeadZones}{dzCount > 0 ? ` (${dzCount})` : ''}</span>
                <button className={`sim-toggle ${showDeadZones ? 'sim-toggle-on' : ''}`} onClick={() => setShowDeadZones(v => !v)}>
                  {showDeadZones ? 'ON' : 'OFF'}
                </button>
              </label>
            </div>

            <div className="sim-section">
              <p className="sim-section-title">{t.simLinesN(routes.filter(r=>r.active).length, routes.length)}</p>
              {routes.map(r => (
                <div key={r.id} className="sim-item-row">
                  <span className="sim-item-dot" style={{ background: r.active ? r.color : '#444' }} />
                  <span className="sim-item-label">{r.label}</span>
                  <button className={`sim-toggle sim-toggle-sm ${r.active ? 'sim-toggle-on' : ''}`} onClick={() => handleToggleRoute(r.id)}>
                    {r.active ? 'ON' : 'OFF'}
                  </button>
                </div>
              ))}
            </div>

            <div className="sim-section sim-section-scroll">
              <p className="sim-section-title">{t.simStopsN(metrics.active, stops.length)}</p>
              {stops.map(s => (
                <div key={s.id} className={`sim-item-row ${!s.active ? 'sim-item-inactive' : ''}`}>
                  <span className="sim-item-dot" style={{
                    background: s.active ? (s.type==='station' ? '#e6b800' : '#1255a0') : '#444',
                    borderRadius: s.type==='station' ? 3 : '50%',
                  }} />
                  <span className="sim-item-label">{s.label}</span>
                  <button className={`sim-toggle sim-toggle-sm ${s.active ? 'sim-toggle-on' : ''}`} onClick={() => handleToggle(s.id)}>
                    {s.active ? 'ON' : 'OFF'}
                  </button>
                </div>
              ))}
            </div>

            <div className="sim-actions">
              <button className={`sim-btn sim-btn-add ${addingStop ? 'sim-btn-active' : ''}`} onClick={() => setAddingStop(v => !v)}>
                {addingStop ? t.simCancelAdd : t.simAddStop}
              </button>
              <button className="sim-btn sim-btn-reset" onClick={handleReset}>
                {t.simReset}
              </button>
            </div>
            <div style={{ padding: '0 16px 12px' }}>
              <button
                className="sim-btn"
                style={{
                  width: '100%', background: 'rgba(255,215,0,0.1)',
                  border: '1px solid rgba(255,215,0,0.4)', color: '#FFD700',
                  fontWeight: 700, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                }}
                onClick={handleGenerateFinal}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                {t.simGenFinal}
              </button>
            </div>
          </div>
        )}

        {/* ── Onglet Achalandage ── */}
        {activeTab === 'achalandage' && (
          <TabAchalandage ridershipResult={ridershipResult} />
        )}

        {/* ── Onglet Scénarios ── */}
        {activeTab === 'scenarios' && (
          <TabScenarios
            stops={stops} routes={routes}
            scenarios={scenarios} onSave={handleSaveScenario}
          />
        )}

        {/* ── Onglet Matrice O-D ── */}
        {activeTab === 'od' && (
          <TabOD odMatrix={odMatrix} />
        )}

        {/* ── Onglet Équité ── */}
        {activeTab === 'equite' && (
          <TabEquite equityResult={equityResult} />
        )}

        {/* ── Onglet Budget ── */}
        {activeTab === 'budget' && (
          <TabBudget
            budgetResult={budgetResult}
            costs={unitCosts}
            onCostChange={handleCostChange}
            onSave={handleSaveCosts}
            saving={savingCosts}
            saveError={saveCostsError}
          />
        )}

        {/* ── Onglet Rapport IA ── */}
        {activeTab === 'rapport' && (
          <TabReport
            canGenerate={canGenerateReport}
            report={report}
            reportLoading={reportLoading}
            reportError={reportError}
            onGenerate={handleGenerateReport}
            question={question}
            onQuestionChange={setQuestion}
            answer={answer}
            askLoading={askLoading}
            askError={askError}
            onAsk={handleAsk}
          />
        )}

      </aside>
    </div>
  )
}

export default AdminSimulator
