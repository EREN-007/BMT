import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Rectangle,
  Popup,
  LayersControl,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { aggregate, AggregationResult } from '@/lib/aggregation'
import { getRoutes, getStops, ensureSeedData } from '@/lib/storage'
import { buildODMatrix, computeCoveredPairs, ODMatrix, OD_ZONES } from '@/lib/od'
import {
  computeEquity, gapLevelColor, gapLevelLabel, EquityResult, EQ_ZONES,
} from '@/lib/equity'

delete (L.Icon.Default.prototype as any)._getIconUrl

// ─── Density color logic ───────────────────────────────────────────────────────
// count = nombre de citoyens ayant tracé ce corridor / placé cet arrêt

function densityColor(count: number, max: number): string {
  const ratio = count / max
  if (ratio >= 0.65) return '#e74c3c'   // rouge  — très demandé
  if (ratio >= 0.30) return '#f39c12'   // orange — moyennement demandé
  return '#ecf0f1'                       // blanc  — peu demandé
}

function densityWeight(count: number, max: number): number {
  const ratio = count / max
  if (ratio >= 0.65) return 9
  if (ratio >= 0.30) return 6
  return 3
}

function densityRadius(count: number, max: number): number {
  const ratio = count / max
  if (ratio >= 0.65) return 14
  if (ratio >= 0.30) return 9
  return 5
}

// ─── Corridors de routes ──────────────────────────────────────────────────────
// Chaque corridor = segment agrégé de toutes les propositions citoyennes
// `count` = nb de citoyens ayant tracé ce corridor

const CORRIDORS = [
  // ── ROUGE — corridors très demandés
  {
    id: 'c1', label: 'Centre-ville → Champlain Place', count: 38,
    points: [
      [46.0972, -64.7901], [46.0931, -64.7830], [46.0878, -64.7782],
      [46.0840, -64.7740], [46.0821, -64.7720],
    ] as [number,number][],
  },
  {
    id: 'c2', label: 'Wheeler Blvd — Axe principal', count: 34,
    points: [
      [46.1020, -64.7600], [46.0980, -64.7680], [46.0930, -64.7750],
      [46.0878, -64.7782], [46.0830, -64.7820],
    ] as [number,number][],
  },
  {
    id: 'c3', label: 'Dieppe — Corridor Acadie', count: 29,
    points: [
      [46.0988, -64.7350], [46.0960, -64.7440], [46.0935, -64.7530],
      [46.0910, -64.7640], [46.0878, -64.7782],
    ] as [number,number][],
  },
  // ── ORANGE — corridors moyennement demandés
  {
    id: 'c4', label: 'Mountain Rd — Corridor nord', count: 18,
    points: [
      [46.1080, -64.7820], [46.1040, -64.7790], [46.0998, -64.7760],
      [46.0960, -64.7740], [46.0920, -64.7720],
    ] as [number,number][],
  },
  {
    id: 'c5', label: 'Moncton → Riverview Pont', count: 14,
    points: [
      [46.0878, -64.7782], [46.0820, -64.7800], [46.0760, -64.7830],
      [46.0700, -64.7900], [46.0630, -64.7970],
    ] as [number,number][],
  },
  {
    id: 'c6', label: 'Dieppe Est — Rue Champlain', count: 12,
    points: [
      [46.0940, -64.7200], [46.0960, -64.7300], [46.0970, -64.7400],
      [46.0975, -64.7480], [46.0970, -64.7560],
    ] as [number,number][],
  },
  {
    id: 'c7', label: 'Université → Downtown', count: 11,
    points: [
      [46.1020, -64.7600], [46.0990, -64.7650], [46.0960, -64.7700],
      [46.0920, -64.7740], [46.0878, -64.7782],
    ] as [number,number][],
  },
  // ── BLANC — corridors peu demandés
  {
    id: 'c8', label: 'Riverview Sud', count: 6,
    points: [
      [46.0562, -64.8022], [46.0600, -64.7970], [46.0640, -64.7920],
      [46.0680, -64.7870], [46.0720, -64.7830],
    ] as [number,number][],
  },
  {
    id: 'c9', label: 'Moncton Ouest', count: 5,
    points: [
      [46.0878, -64.7782], [46.0850, -64.7900], [46.0820, -64.8020],
      [46.0790, -64.8130], [46.0760, -64.8220],
    ] as [number,number][],
  },
  {
    id: 'c10', label: 'Dieppe Nord', count: 4,
    points: [
      [46.1050, -64.7300], [46.1020, -64.7380], [46.0990, -64.7440],
      [46.0960, -64.7490], [46.0940, -64.7540],
    ] as [number,number][],
  },
]

// ─── Arrêts de bus ─────────────────────────────────────────────────────────────

const BUS_STOPS = [
  { id: 'bs1',  label: 'Centre-ville — Main & Highfield',   pos: [46.0878, -64.7782] as [number,number], count: 42 },
  { id: 'bs2',  label: 'Champlain Place',                    pos: [46.0821, -64.7720] as [number,number], count: 35 },
  { id: 'bs3',  label: 'Université de Moncton',              pos: [46.1020, -64.7600] as [number,number], count: 30 },
  { id: 'bs4',  label: 'Dieppe Centre Commercial',           pos: [46.0960, -64.7440] as [number,number], count: 28 },
  { id: 'bs5',  label: 'Highfield Square',                   pos: [46.0931, -64.7830] as [number,number], count: 22 },
  { id: 'bs6',  label: 'Wheeler Blvd & Mountain Rd',         pos: [46.0980, -64.7700] as [number,number], count: 18 },
  { id: 'bs7',  label: 'Riverview Civic Centre',             pos: [46.0620, -64.7950] as [number,number], count: 14 },
  { id: 'bs8',  label: 'Dieppe Rue Acadie',                  pos: [46.0988, -64.7350] as [number,number], count: 12 },
  { id: 'bs9',  label: 'Moncton Hospital',                   pos: [46.0960, -64.7740] as [number,number], count: 9  },
  { id: 'bs10', label: 'Riverview Plaza',                    pos: [46.0562, -64.8022] as [number,number], count: 7  },
  { id: 'bs11', label: 'Moncton Ouest — Trinity Dr',         pos: [46.0820, -64.8100] as [number,number], count: 5  },
  { id: 'bs12', label: 'Dieppe Est — Champlain & Amirault',  pos: [46.0940, -64.7200] as [number,number], count: 4  },
]

// ─── Stations / Gares ──────────────────────────────────────────────────────────

const STATIONS = [
  { id: 'st1', label: 'Gare centrale Moncton',         pos: [46.0920, -64.7750] as [number,number], count: 38 },
  { id: 'st2', label: 'Station Dieppe — Pôle Acadie',  pos: [46.0975, -64.7400] as [number,number], count: 24 },
  { id: 'st3', label: 'Station Riverview',              pos: [46.0630, -64.7970] as [number,number], count: 15 },
  { id: 'st4', label: 'Station Université',             pos: [46.1020, -64.7610] as [number,number], count: 11 },
  { id: 'st5', label: 'Station Moncton Ouest',          pos: [46.0790, -64.8130] as [number,number], count: 6  },
]

const MAX_ROUTE = Math.max(...CORRIDORS.map(c => c.count))
const MAX_STOP  = Math.max(...BUS_STOPS.map(s => s.count))
const MAX_STA   = Math.max(...STATIONS.map(s => s.count))

const MONCTON_CENTER: [number, number] = [46.075, -64.760]

// Zones d'équité : définies dans src/lib/equity/data.ts (EQ_ZONES)
// Couleurs et labels : gapLevelColor / gapLevelLabel depuis src/lib/equity/index.ts

// ─── Flux Origine-Destination ─────────────────────────────────────────────────
// Données dérivées silencieusement de l'application citoyenne :
//   • adresses soumises en Page 4 → origine
//   • tracés de routes en Page 3 → destinations populaires
// count = nb de citoyens ayant ce déplacement

const OD_FLOWS: {
  id: string; label: string
  from: [number,number]; to: [number,number]
  count: number
}[] = [
  { id: 'od1', label: 'Résidentiel → Centre-ville',        from: [46.0700, -64.7640], to: [46.0878, -64.7782], count: 48 },
  { id: 'od2', label: 'Université → Centre-ville',         from: [46.1020, -64.7600], to: [46.0878, -64.7782], count: 41 },
  { id: 'od3', label: 'Dieppe → Centre-ville',             from: [46.0960, -64.7440], to: [46.0878, -64.7782], count: 35 },
  { id: 'od4', label: 'Centre-ville → Champlain Place',    from: [46.0878, -64.7782], to: [46.0821, -64.7720], count: 33 },
  { id: 'od5', label: 'Riverview → Centre-ville',          from: [46.0620, -64.7950], to: [46.0878, -64.7782], count: 27 },
  { id: 'od6', label: 'Moncton Nord → Centre-ville',       from: [46.1080, -64.7820], to: [46.0878, -64.7782], count: 22 },
  { id: 'od7', label: 'Dieppe Est → Dieppe Centre',        from: [46.0940, -64.7200], to: [46.0960, -64.7440], count: 18 },
  { id: 'od8', label: 'Moncton Ouest → Centre-ville',      from: [46.0820, -64.8100], to: [46.0878, -64.7782], count: 15 },
  { id: 'od9', label: 'Université → Hôpital Moncton',      from: [46.1020, -64.7600], to: [46.0960, -64.7740], count: 12 },
  { id:'od10', label: 'Riverview → Champlain Place',       from: [46.0620, -64.7950], to: [46.0821, -64.7720], count: 9  },
]

const MAX_OD = Math.max(...OD_FLOWS.map(f => f.count))

function odWeight(count: number): number {
  const ratio = count / MAX_OD
  if (ratio >= 0.65) return 7
  if (ratio >= 0.35) return 4
  return 2
}

function odOpacity(count: number): number {
  return 0.3 + 0.55 * (count / MAX_OD)
}

// ─── Density badge ─────────────────────────────────────────────────────────────

function DensityBadge({ count, max }: { count: number; max: number }) {
  const color = densityColor(count, max)
  const label = count / max >= 0.65 ? 'Très demandé' : count / max >= 0.30 ? 'Demandé' : 'Peu demandé'
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 10,
      background: `${color}22`, color, border: `1px solid ${color}55`,
      fontSize: '0.75rem', fontWeight: 700,
    }}>
      {label}
    </span>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function AdminMapPage() {
  const navigate = useNavigate()
  const [showRoutes,   setShowRoutes]   = useState(true)
  const [showStops,    setShowStops]    = useState(true)
  const [showStations, setShowStations] = useState(true)
  const [showEquity,   setShowEquity]   = useState(false)
  const [showOD,       setShowOD]       = useState(false)

  // ── Agrégation live ──────────────────────────────────────────────────────
  const [result,     setResult]     = useState<AggregationResult | null>(null)
  const [lastUpdate, setLastUpdate] = useState<number>(0)
  const [odMatrix,     setOdMatrix]     = useState<ODMatrix | null>(null)
  const [equityResult, setEquityResult] = useState<EquityResult | null>(null)

  const runAggregation = useCallback(() => {
    ensureSeedData()  // injecte les données de démonstration si localStorage vide
    const routes = getRoutes()
    const stops  = getStops()
    const agg    = aggregate(routes, stops)
    setResult(agg)
    setLastUpdate(Date.now())

    // Matrice O-D : corridors agrégés → paires couvertes, tracés citoyens → flux
    const coveredPairs = computeCoveredPairs(agg.corridors, OD_ZONES)
    const odm          = buildODMatrix(routes, OD_ZONES, coveredPairs)
    setOdMatrix(odm)

    // Équité : tous les arrêts agrégés traités comme actifs (état actuel des propositions)
    const allAggStops = agg.stops.map(s => ({
      id:     s.id,
      type:   s.type as 'busstop' | 'station',
      pos:    s.pos as [number, number],
      active: true,
    }))
    const eq = computeEquity(allAggStops, EQ_ZONES)
    setEquityResult(eq)
  }, [])

  useEffect(() => { runAggregation() }, [runAggregation])

  // Corridors et arrêts : données agrégées si disponibles, fallback sur données statiques
  const livecorridors = result && result.corridors.length > 0
    ? result.corridors
    : CORRIDORS.map(c => ({ ...c, maxCellCount: c.count, label: c.label }))

  const liveStops = result && result.stops.filter(s => s.type === 'busstop').length > 0
    ? result.stops.filter(s => s.type === 'busstop')
        .map(s => ({ id: s.id, label: s.label, pos: s.pos as [number,number], count: s.count }))
    : BUS_STOPS

  const liveStations = result && result.stops.filter(s => s.type === 'station').length > 0
    ? result.stops.filter(s => s.type === 'station')
        .map(s => ({ id: s.id, label: s.label, pos: s.pos as [number,number], count: s.count }))
    : STATIONS

  const MAX_ROUTE_LIVE = Math.max(...livecorridors.map(c => c.count), 1)
  const MAX_STOP_LIVE  = Math.max(...liveStops.map(s => s.count), 1)
  const MAX_STA_LIVE   = Math.max(...liveStations.map(s => s.count), 1)

  return (
    <div className="db-root">

      {/* ── Sidebar ── */}
      <aside className="db-sidebar">
        <div className="db-sidebar-brand">
          <span className="db-brand-main">BMT</span>
          <span className="db-brand-sep">·</span>
          <span className="db-brand-main">CME</span>
        </div>
        <p className="db-sidebar-city">Grand Moncton, NB</p>

        <nav className="db-nav">
          <a className="db-nav-item" style={{cursor:'pointer'}} onClick={() => navigate('/dashboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Dashboard
          </a>
          <a className="db-nav-item db-nav-active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
              <line x1="8" y1="2" x2="8" y2="18"/>
              <line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
            Carte mère
          </a>
          <a className="db-nav-item" style={{cursor:'pointer'}} onClick={() => navigate('/simulateur')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Simulateur
          </a>
          <a className="db-nav-item" style={{cursor:'pointer'}} onClick={() => navigate('/carte-finale')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
            </svg>
            Carte finale
          </a>
        </nav>

        {/* Légende heatmap */}
        <div className="adm-legend">
          <p className="adm-legend-title">Intensité de demande</p>

          <div className="adm-heatmap-legend">
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#e74c3c' }} />
              <span className="adm-heat-label">Très demandé</span>
            </div>
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#f39c12' }} />
              <span className="adm-heat-label">Demandé</span>
            </div>
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#ecf0f1', border: '1px solid rgba(255,255,255,0.2)' }} />
              <span className="adm-heat-label">Peu demandé</span>
            </div>
          </div>

          <div className="adm-legend-sep" />
          <p className="adm-legend-title">Afficher</p>

          <label className="adm-legend-item">
            <input type="checkbox" checked={showRoutes}   onChange={e => setShowRoutes(e.target.checked)} />
            <span className="adm-legend-name">Lignes ({livecorridors.length})</span>
          </label>
          <label className="adm-legend-item">
            <input type="checkbox" checked={showStops}    onChange={e => setShowStops(e.target.checked)} />
            <span className="adm-legend-name">Arrêts ({liveStops.length})</span>
          </label>
          <label className="adm-legend-item">
            <input type="checkbox" checked={showStations} onChange={e => setShowStations(e.target.checked)} />
            <span className="adm-legend-name">Stations ({liveStations.length})</span>
          </label>

          <div className="adm-legend-sep" />
          <p className="adm-legend-title">Analyse d'équité</p>
          <div className="adm-heatmap-legend">
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#e74c3c' }} />
              <span className="adm-heat-label">Critique (écart ≥ 20)</span>
            </div>
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#f39c12' }} />
              <span className="adm-heat-label">Modéré (écart ≥ 10)</span>
            </div>
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#f1c40f' }} />
              <span className="adm-heat-label">Adéquat</span>
            </div>
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#2ecc71' }} />
              <span className="adm-heat-label">Surplus de service</span>
            </div>
          </div>
          {equityResult && (
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', margin: '4px 0 6px' }}>
              Écart pondéré : {equityResult.weightedGap > 0 ? '+' : ''}{equityResult.weightedGap} pts
              {equityResult.criticalZones.length > 0 && (
                <span style={{ color: '#e74c3c' }}> · {equityResult.criticalZones.length} critique{equityResult.criticalZones.length > 1 ? 's' : ''}</span>
              )}
            </div>
          )}
          <label className="adm-legend-item">
            <input type="checkbox" checked={showEquity} onChange={e => setShowEquity(e.target.checked)} />
            <span className="adm-legend-name">Zones d'équité ({EQ_ZONES.length})</span>
          </label>

          <div className="adm-legend-sep" />
          <p className="adm-legend-title">Matrice O-D</p>
          <div className="adm-heatmap-legend">
            <div className="adm-heat-row">
              <span style={{ display:'inline-block', width:24, height:3, background:'#3498db', opacity:0.9, marginRight:8, borderRadius:2 }} />
              <span className="adm-heat-label">Desservi</span>
            </div>
            <div className="adm-heat-row">
              <span style={{ display:'inline-block', width:24, height:2, background:'#e67e22', opacity:0.8, marginRight:8, borderRadius:2, borderTop:'1px dashed #e67e22' }} />
              <span className="adm-heat-label">Non desservi</span>
            </div>
          </div>
          {odMatrix && (
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', margin: '4px 0 6px' }}>
              {odMatrix.cells.length} corridors · {odMatrix.coveragePct}% couverture
              {odMatrix.unmetDemand.length > 0 && (
                <span style={{ color: '#e67e22' }}> · {odMatrix.unmetDemand.length} lacunes</span>
              )}
            </div>
          )}
          <label className="adm-legend-item">
            <input type="checkbox" checked={showOD} onChange={e => setShowOD(e.target.checked)} />
            <span className="adm-legend-name">
              Lignes de désir ({odMatrix ? odMatrix.cells.length : OD_FLOWS.length})
            </span>
          </label>

          <div className="adm-legend-sep" />
          <p className="adm-legend-title">Données</p>
          <div className="adm-stats-mini">
            <div className="adm-stat-mini">
              <span>{result ? result.totalRoutes : CORRIDORS.reduce((a,c) => a + c.count, 0)}</span>
              tracés citoyens
            </div>
            <div className="adm-stat-mini">
              <span>{result ? result.stops.filter(s => s.type === 'busstop').length : BUS_STOPS.length}</span>
              clusters arrêts
            </div>
            <div className="adm-stat-mini">
              <span>{result ? result.stops.filter(s => s.type === 'station').length : STATIONS.length}</span>
              clusters stations
            </div>
          </div>

          {result && (
            <div style={{ padding: '8px 0 4px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                {livecorridors.length} corridors · {result.gridStats.activeCells} cellules actives
              </span>
              <br />
              Mis à jour {new Date(lastUpdate).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          <button
            onClick={runAggregation}
            style={{
              marginTop: 8, width: '100%', padding: '7px 0',
              background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.25)',
              borderRadius: 8, color: '#FFD700', fontSize: '0.72rem',
              fontWeight: 700, cursor: 'pointer', letterSpacing: '0.3px',
            }}
          >
            ↺ Rafraîchir les données
          </button>
        </div>

        <button className="db-logout" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Déconnexion
        </button>
      </aside>

      {/* ── Map ── */}
      <div className="mp-map-wrap">
        <MapContainer
          center={MONCTON_CENTER}
          zoom={13}
          className="mp-leaflet"
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Plan">
              <TileLayer
                url="https://api.mapbox.com/styles/v1/erenjager/cmo26m3v5004l01rufhpcgo8b/tiles/256/{z}/{x}/{y}@2x?access_token=pk.eyJ1IjoiZXJlbmphZ2VyIiwiYSI6ImNtbnh4Z3h4dTA3aWoycXB5ZGpmZTgwcWsifQ.aI1zk7S4WdSE4baYf4FYfQ"
                attribution='&copy; <a href="https://mapbox.com">Mapbox</a>'
                tileSize={512}
                zoomOffset={-1}
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satellite">
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles © Esri"
                maxZoom={20}
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          {/* Corridors / lignes — données agrégées */}
          {showRoutes && livecorridors.map(c => (
            <Polyline
              key={c.id}
              positions={c.points}
              pathOptions={{
                color:    densityColor(c.count, MAX_ROUTE_LIVE),
                weight:   densityWeight(c.count, MAX_ROUTE_LIVE),
                opacity:  0.85,
                lineCap:  'round',
                lineJoin: 'round',
              }}
            >
              <Popup>
                <div style={{ minWidth: 190 }}>
                  <strong>{c.label}</strong><br />
                  <span style={{ color: '#666', fontSize: '0.82rem' }}>
                    {c.count} citoyen{c.count > 1 ? 's' : ''} ont tracé ce corridor
                  </span><br /><br />
                  <DensityBadge count={c.count} max={MAX_ROUTE_LIVE} />
                </div>
              </Popup>
            </Polyline>
          ))}

          {/* Arrêts de bus — données agrégées */}
          {showStops && liveStops.map(s => (
            <CircleMarker
              key={s.id}
              center={s.pos}
              radius={densityRadius(s.count, MAX_STOP_LIVE)}
              pathOptions={{
                color:       densityColor(s.count, MAX_STOP_LIVE),
                fillColor:   densityColor(s.count, MAX_STOP_LIVE),
                fillOpacity: 0.75,
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <strong>🚏 {s.label}</strong><br />
                  <span style={{ color: '#666', fontSize: '0.82rem' }}>
                    {s.count} citoyen{s.count > 1 ? 's' : ''} ont voté pour cet arrêt
                  </span><br /><br />
                  <DensityBadge count={s.count} max={MAX_STOP_LIVE} />
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* Zones d'équité — couleurs et scores calculés dynamiquement */}
          {showEquity && EQ_ZONES.map(z => {
            // Trouver le score calculé pour cette zone (fallback neutre si calcul en cours)
            const score = equityResult?.scores.find(s => s.zone.id === z.id)
            const color = score ? gapLevelColor(score.gapLevel) : '#888'
            const label = score ? gapLevelLabel(score.gapLevel) : '—'
            return (
              <Rectangle
                key={z.id}
                bounds={z.bounds}
                pathOptions={{
                  color, fillColor: color,
                  fillOpacity: 0.18, weight: 2, dashArray: '6 4',
                }}
              >
                <Popup>
                  <div style={{ minWidth: 220 }}>
                    <strong>{z.name}</strong><br />
                    <span style={{ color, fontWeight: 700, fontSize: '0.8rem' }}>{label}</span>
                    {score && (
                      <>
                        <hr style={{ margin: '6px 0', borderColor: '#eee' }} />
                        <table style={{ fontSize: '0.8rem', width: '100%' }}>
                          <tbody>
                            <tr>
                              <td style={{ color: '#666' }}>Score besoin</td>
                              <td><strong style={{ color: '#c0392b' }}>{score.needScore} / 100</strong></td>
                            </tr>
                            <tr>
                              <td style={{ color: '#666' }}>Score service</td>
                              <td><strong style={{ color }}>{score.serviceScore} / 100</strong></td>
                            </tr>
                            <tr>
                              <td style={{ color: '#666' }}>Écart</td>
                              <td><strong style={{ color }}>
                                {score.gap > 0 ? '+' : ''}{score.gap} pts
                              </strong></td>
                            </tr>
                            <tr><td colSpan={2}><hr style={{ margin: '4px 0', borderColor: '#eee' }} /></td></tr>
                            <tr><td style={{ color: '#666' }}>Population</td><td><strong>{z.pop.toLocaleString()}</strong></td></tr>
                            <tr><td style={{ color: '#666' }}>Revenu médian</td><td><strong>{z.income.toLocaleString()} $</strong></td></tr>
                            <tr><td style={{ color: '#666' }}>% aînés (65+)</td><td><strong>{z.seniors} %</strong></td></tr>
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                </Popup>
              </Rectangle>
            )
          })}

          {/* Lignes de désir O-D — données calculées depuis les tracés citoyens */}
          {showOD && (() => {
            if (odMatrix) {
              const zoneMap   = new Map(odMatrix.zones.map(z => [z.id, z]))
              const maxTrips  = odMatrix.cells[0]?.trips ?? 1
              return odMatrix.cells.map(cell => {
                const fromZone = zoneMap.get(cell.fromZoneId)
                const toZone   = zoneMap.get(cell.toZoneId)
                if (!fromZone || !toZone) return null
                const ratio   = cell.trips / maxTrips
                const weight  = Math.round(1 + ratio * 7)
                const opacity = 0.25 + ratio * 0.65
                return (
                  <Polyline
                    key={`od-${cell.fromZoneId}|${cell.toZoneId}`}
                    positions={[fromZone.center, toZone.center]}
                    pathOptions={{
                      color:     cell.covered ? '#3498db' : '#e67e22',
                      weight:    Math.min(weight, 8),
                      opacity,
                      dashArray: cell.covered ? undefined : '8 5',
                    }}
                  >
                    <Popup>
                      <div style={{ minWidth: 200 }}>
                        <strong>{fromZone.name} → {toZone.name}</strong><br />
                        <span style={{ color: '#666', fontSize: '0.82rem' }}>
                          {cell.trips.toLocaleString()} voy/j estimés · {cell.rawCount} tracé{cell.rawCount > 1 ? 's' : ''}
                        </span><br />
                        <span style={{
                          display: 'inline-block', marginTop: 6, padding: '2px 8px',
                          borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
                          background: cell.covered ? '#3498db22' : '#e67e2222',
                          color: cell.covered ? '#3498db' : '#e67e22',
                          border: `1px solid ${cell.covered ? '#3498db55' : '#e67e2255'}`,
                        }}>
                          {cell.covered ? '✓ Desservi' : '⚠ Non desservi'}
                        </span>
                      </div>
                    </Popup>
                  </Polyline>
                )
              })
            }

            // Fallback statique (avant chargement)
            return OD_FLOWS.map(f => (
              <Polyline
                key={f.id}
                positions={[f.from, f.to]}
                pathOptions={{
                  color: '#3498db', weight: odWeight(f.count),
                  opacity: odOpacity(f.count), dashArray: '8 5',
                }}
              >
                <Popup>
                  <div style={{ minWidth: 190 }}>
                    <strong>{f.label}</strong><br />
                    <span style={{ color: '#666', fontSize: '0.82rem' }}>
                      {f.count} déplacements enregistrés
                    </span>
                  </div>
                </Popup>
              </Polyline>
            ))
          })()}

          {/* Stations — données agrégées */}
          {showStations && liveStations.map(s => (
            <CircleMarker
              key={s.id}
              center={s.pos}
              radius={densityRadius(s.count, MAX_STA_LIVE) + 3}
              pathOptions={{
                color:       densityColor(s.count, MAX_STA_LIVE),
                fillColor:   densityColor(s.count, MAX_STA_LIVE),
                fillOpacity: 0.75,
                weight:      3,
                dashArray:   '4 3',
              }}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <strong>🏢 {s.label}</strong><br />
                  <span style={{ color: '#666', fontSize: '0.82rem' }}>
                    {s.count} citoyen{s.count > 1 ? 's' : ''} ont proposé cette station
                  </span><br /><br />
                  <DensityBadge count={s.count} max={MAX_STA_LIVE} />
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        {/* Titre flottant */}
        <div className="adm-map-title">
          <span>Carte de demande citoyenne — Grand Moncton</span>
        </div>
      </div>
    </div>
  )
}

export default AdminMapPage
