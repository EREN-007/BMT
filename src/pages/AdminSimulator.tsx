import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapContainer, TileLayer, Circle, Marker, Popup, Polyline, Rectangle, useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computeCoverage, CoverageResult } from '@/lib/coverage'
import {
  buildODMatrix, computeCoveredPairs, ODMatrix, OD_ZONES,
} from '@/lib/od'
import { getRoutes, ensureSeedData } from '@/lib/storage'

delete (L.Icon.Default.prototype as any)._getIconUrl

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

type TabId = 'simulation' | 'achalandage' | 'scenarios' | 'od'

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

// ─── Associations route → arrêts pour modélisation d'achalandage ─────────────
// Chaque route dessert une liste d'arrêts dont on agrège la demande citoyenne

const ROUTE_STOPS: Record<string, string[]> = {
  r1: ['s1', 's2', 's5', 'st1'],
  r2: ['s3', 's5', 's6', 'st1'],
  r3: ['s4', 's8', 'st2'],
  r4: ['s1', 's7', 's10', 'st3'],
}

const COVERAGE_RADIUS = 400
const STATION_RADIUS  = 800
const MONCTON_CENTER: [number, number] = [46.075, -64.760]

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
  const ids        = ROUTE_STOPS[route.id] || []
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
              {stop.active ? 'Désactiver' : 'Activer'}
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

function TabAchalandage({ routes, stops }: { routes: SimRoute[]; stops: SimStop[] }) {
  const [peak, setPeak] = useState(false)

  const total    = computeTotalRidership(routes, stops, peak)
  const maxRoute = Math.max(...routes.map(r => computeRouteRidership(r, stops, peak)), 1)

  const insight = (() => {
    const active = routes.filter(r => r.active)
    if (active.length === 0) return 'Aucune ligne active.'
    const best = active.reduce((a, b) =>
      computeRouteRidership(a, stops, false) >= computeRouteRidership(b, stops, false) ? a : b)
    return `${best.label} est la plus achalandée.`
  })()

  return (
    <div className="sim-tab-content">
      {/* Carte total */}
      <div className="sim-total-card">
        <div className="sim-total-value">{total.toLocaleString()}</div>
        <div className="sim-total-label">passagers / jour estimés</div>
      </div>

      {/* Toggle pointe */}
      <div className="sim-toggle-row" style={{ marginBottom: 14 }}>
        <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
          Heures de pointe (×{PEAK_FACTOR})
        </span>
        <button className={`sim-toggle ${peak ? 'sim-toggle-on' : ''}`} onClick={() => setPeak(v => !v)}>
          {peak ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Barres par ligne */}
      <p className="sim-section-title">Achalandage par ligne</p>
      <div className="sim-ridership-list">
        {routes.map(r => {
          const val   = computeRouteRidership(r, stops, peak)
          const width = r.active ? Math.round((val / maxRoute) * 100) : 0
          return (
            <div key={r.id} className="sim-ridership-item">
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
            </div>
          )
        })}
      </div>

      {/* Insight */}
      <div style={{
        marginTop: 14, padding: '10px 12px', borderRadius: 8,
        background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.15)',
        fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
      }}>
        <span style={{ color: '#FFD700', fontWeight: 700 }}>Analyse : </span>
        {insight}
        {' '}Activez la ligne D pour desservir Riverview (+{computeRouteRidership(
          { ...routes.find(r => r.id === 'r4')!, active: true }, stops, peak
        ).toLocaleString()} pass./j).
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
  const m       = computeMetrics(stops)
  const current: Scenario = {
    id: 'current', label: 'En cours',
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
              <span className="sim-scenario-slot-label">Scénario {slot}</span>
              <button className="sim-scenario-save-btn" onClick={() => onSave(slot)}>
                Sauvegarder
              </button>
            </div>
            {scenarios[slot] ? (
              <div className="sim-scenario-metrics">
                <span className="sim-scenario-metric">Couverture <strong>{scenarios[slot]!.coveragePct}%</strong></span>
                <span className="sim-scenario-metric">Passagers <strong>{scenarios[slot]!.ridership.toLocaleString()}</strong></span>
                <span className="sim-scenario-metric">Zones mortes <strong>{scenarios[slot]!.deadZones}</strong></span>
                <span className="sim-scenario-metric">Arrêts actifs <strong>{scenarios[slot]!.activeStops}</strong></span>
              </div>
            ) : (
              <span className="sim-scenario-empty">Aucun scénario sauvegardé</span>
            )}
          </div>
        ))}
      </div>

      {/* Tableau comparatif */}
      {defined.length > 1 && (
        <>
          <p className="sim-section-title">Comparaison</p>
          <table className="sim-compare-table">
            <thead>
              <tr>
                <th>Scénario</th>
                <th>Couv.</th>
                <th>Pass./j</th>
                <th>Zones⚠</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                if (!s) return null
                const isCurrent = s.id === 'current'
                return (
                  <tr key={s.id}>
                    <td className={isCurrent ? 'sim-compare-current' : ''}>
                      {isCurrent ? '● En cours' : `Scénario ${s.id}`}
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
            Vert = meilleur · Rouge = moins performant
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab : Matrice O-D ───────────────────────────────────────────────────────

function TabOD({ odMatrix }: { odMatrix: ODMatrix | null }) {
  if (!odMatrix) {
    return (
      <div className="sim-tab-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem' }}>Chargement O-D…</p>
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
            <span className="od-kpi-label">voyages/j estimés</span>
          </div>
          <div className="od-kpi">
            <span className="od-kpi-value" style={{ color: covColor }}>{odMatrix.coveragePct}%</span>
            <span className="od-kpi-label">avec desserte</span>
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
      <p className="sim-section-title">Corridors les plus demandés</p>
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
                {cell.trips.toLocaleString()} voy/j · {cell.rawCount} tracé{cell.rawCount > 1 ? 's' : ''} citoyen{cell.rawCount > 1 ? 's' : ''}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Demande non desservie ── */}
      {odMatrix.unmetDemand.length > 0 && (
        <>
          <p className="sim-section-title" style={{ marginTop: 14 }}>Demande non desservie</p>
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
                    Aucune desserte directe · {cell.rawCount} citoyen{cell.rawCount > 1 ? 's' : ''} concerné{cell.rawCount > 1 ? 's' : ''}
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
          <span style={{ color: '#2ecc71', fontWeight: 700 }}>Excellent ! </span>
          Tous les corridors prioritaires sont desservis par les lignes actives.
        </div>
      )}

      <div style={{ fontSize: '0.60rem', color: 'rgba(255,255,255,0.18)', marginTop: 10 }}>
        calc. {odMatrix.computeTimeMs} ms · {odMatrix.cells.length} paires · EXPANSION ×{50}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function AdminSimulator() {
  const navigate = useNavigate()
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
  const counterRef      = useRef(100)
  const citizenRoutesRef = useRef<Array<{ points: [number, number][] }>>([])

  // ── Moteur de couverture — recalcul à chaque changement d'arrêts ──────────
  useEffect(() => {
    const result = computeCoverage(stops)
    setCoverageResult(result)
  }, [stops])

  // ── Chargement des tracés citoyens (une seule fois au montage) ────────────
  useEffect(() => {
    ensureSeedData()
    citizenRoutesRef.current = getRoutes()
  }, [])

  // ── Matrice O-D — recalcul quand les lignes actives changent ─────────────
  // Les paires couvertes dépendent des lignes SimRoute actives.
  useEffect(() => {
    const coveredPairs = computeCoveredPairs(routes, OD_ZONES)
    const matrix       = buildODMatrix(citizenRoutesRef.current, OD_ZONES, coveredPairs)
    setOdMatrix(matrix)
  }, [routes])

  const metrics     = computeMetrics(stops)
  const pct         = coverageResult?.coveragePct ?? metrics.coveragePct
  const dzCount     = coverageResult?.deadZones.length ?? metrics.deadZones
  const impactColor = pct >= 70 ? '#2ecc71' : pct >= 45 ? '#f39c12' : '#e74c3c'
  const impactLabel = pct >= 70 ? 'Excellent' : pct >= 45 ? 'Acceptable' : 'Insuffisant'

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
      id, label: `Nouvel arrêt #${counterRef.current}`,
      type: 'busstop', pos, active: true, demand: 5,
    }])
    setAddingStop(false)
    setLastImpact({ id, type: 'gain' })
  }, [])

  const handleReset = () => {
    setStops(INIT_STOPS)
    setRoutes(INIT_ROUTES)
    setLastImpact(null)
  }

  const handleGenerateFinal = useCallback(() => {
    const activeRoutes = routes.filter(r => r.active).map(r => r.id)
    localStorage.setItem('bmt_final_state', JSON.stringify({ activeRoutes }))
    navigate('/carte-finale')
  }, [routes, navigate])

  const handleSaveScenario = useCallback((slot: 'A' | 'B') => {
    const m = computeMetrics(stops)
    setScenarios(prev => ({
      ...prev,
      [slot]: {
        id: slot, label: `Scénario ${slot}`,
        stops: JSON.parse(JSON.stringify(stops)),
        routes: JSON.parse(JSON.stringify(routes)),
        coveragePct:  coverageResult?.coveragePct ?? m.coveragePct,
        ridership:    computeTotalRidership(routes, stops, false),
        deadZones:    coverageResult?.deadZones.length ?? m.deadZones,
        activeStops:  m.active,
        activeRoutes: routes.filter(r => r.active).length,
      },
    }))
  }, [stops, routes, coverageResult])

  const TABS: { id: TabId; label: string }[] = [
    { id: 'simulation',  label: 'Simulation'  },
    { id: 'achalandage', label: 'Achalandage' },
    { id: 'scenarios',   label: 'Scénarios'   },
    { id: 'od',          label: 'Matrice O-D' },
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
        </nav>
        <button className="db-logout" style={{ padding:'8px 6px', marginTop:'auto', gap:0 }} onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:16,height:16}}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </aside>

      {/* ── Map ── */}
      <div className="mp-map-wrap">
        <MapContainer
          center={MONCTON_CENTER} zoom={13} className="mp-leaflet"
          style={{ cursor: addingStop ? 'crosshair' : undefined }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={20}
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
            Cliquez sur la carte pour placer un nouvel arrêt
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
            <h2 className="sim-title">Simulateur</h2>
            <p className="sim-subtitle">Impact en temps réel</p>
          </div>
        </div>

        {/* Score couverture (toujours visible) */}
        <div className="sim-score-card">
          <div className="sim-score-ring" style={{ '--score-color': impactColor, '--score-pct': pct } as React.CSSProperties}>
            <span className="sim-score-value">{pct}%</span>
            <span className="sim-score-unit">couverture</span>
          </div>
          <div className="sim-score-info">
            <span className="sim-score-label" style={{ color: impactColor }}>{impactLabel}</span>
            <div className="sim-score-details">
              <span>🚏 {metrics.buses} arrêts actifs</span>
              <span>🏢 {metrics.stations} stations actives</span>
              <span>⚠️ {dzCount} zone{dzCount !== 1 ? 's' : ''} morte{dzCount !== 1 ? 's' : ''}</span>
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
            {lastImpact.type === 'gain'
              ? '▲ Impact positif — couverture améliorée'
              : '▼ Impact négatif — zone découverte'}
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
              <p className="sim-section-title">Affichage</p>
              <label className="sim-toggle-row">
                <span>Zones de couverture</span>
                <button className={`sim-toggle ${showCoverage ? 'sim-toggle-on' : ''}`} onClick={() => setShowCoverage(v => !v)}>
                  {showCoverage ? 'ON' : 'OFF'}
                </button>
              </label>
              <label className="sim-toggle-row">
                <span>Lignes de bus</span>
                <button className={`sim-toggle ${showRoutes ? 'sim-toggle-on' : ''}`} onClick={() => setShowRoutes(v => !v)}>
                  {showRoutes ? 'ON' : 'OFF'}
                </button>
              </label>
              <label className="sim-toggle-row">
                <span>Zones mortes {dzCount > 0 ? `(${dzCount})` : ''}</span>
                <button className={`sim-toggle ${showDeadZones ? 'sim-toggle-on' : ''}`} onClick={() => setShowDeadZones(v => !v)}>
                  {showDeadZones ? 'ON' : 'OFF'}
                </button>
              </label>
            </div>

            <div className="sim-section">
              <p className="sim-section-title">Lignes ({routes.filter(r=>r.active).length}/{routes.length} actives)</p>
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
              <p className="sim-section-title">Arrêts & Stations ({metrics.active}/{stops.length} actifs)</p>
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
                {addingStop ? '✕ Annuler' : '+ Ajouter arrêt'}
              </button>
              <button className="sim-btn sim-btn-reset" onClick={handleReset}>
                ↺ Réinitialiser
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
                Générer la carte finale →
              </button>
            </div>
          </div>
        )}

        {/* ── Onglet Achalandage ── */}
        {activeTab === 'achalandage' && (
          <TabAchalandage routes={routes} stops={stops} />
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

      </aside>
    </div>
  )
}

export default AdminSimulator
