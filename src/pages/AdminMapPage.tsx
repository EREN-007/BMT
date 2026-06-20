import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import MapGL, { Source, Layer, Marker, Popup } from 'react-map-gl/mapbox'
import type { MapMouseEvent } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { aggregate, AggregationResult } from '@/lib/aggregation'
import { getRoutes, getStops } from '@/lib/storage'
import { buildODMatrix, computeCoveredPairs, ODMatrix, OD_ZONES } from '@/lib/od'
import {
  computeEquity, gapLevelColor, EquityResult, EQ_ZONES,
} from '@/lib/equity'
import { getLang, ADMIN_T } from '@/lib/lang'

// ─── Mapbox config — même carte/style que le côté utilisateur (MapPage) ───────
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
const MAPBOX_STYLE  = 'mapbox://styles/erenjager/cmnxylxae002401s4c7v68c3x'
const MONCTON_VIEW  = { longitude: -64.760, latitude: 46.075, zoom: 12.6, pitch: 0, bearing: 0 }

// [lat,lng] → [lng,lat] (storage vs Mapbox convention)
const toLngLat = ([lat, lng]: [number, number]): [number, number] => [lng, lat]

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

// Zones d'équité : définies dans src/lib/equity/data.ts (EQ_ZONES)
// Couleurs et labels : gapLevelColor / gapLevelLabel depuis src/lib/equity/index.ts

// ─── Density badge ─────────────────────────────────────────────────────────────

function DensityBadge({ count, max }: { count: number; max: number }) {
  const t     = ADMIN_T[getLang()]
  const color = densityColor(count, max)
  const label = count / max >= 0.65 ? t.denHigh : count / max >= 0.30 ? t.denMed : t.denLow
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

// ─── Types popup ────────────────────────────────────────────────────────────────

type PopupInfo =
  | { kind: 'corridor'; lng: number; lat: number; label: string; count: number }
  | { kind: 'stop';     lng: number; lat: number; label: string; count: number }
  | { kind: 'station';  lng: number; lat: number; label: string; count: number }
  | { kind: 'equity';   lng: number; lat: number; name: string; color: string
      hasScore: boolean; gapLevel: string; needScore: number; serviceScore: number
      gap: number; pop: number; income: number; seniors: number }
  | { kind: 'od';       lng: number; lat: number; fromName: string; toName: string
      trips: number; rawCount: number; covered: boolean }

const CORRIDOR_LAYER = 'admin-corridors-line'
const EQUITY_LAYER   = 'admin-equity-fill'
const OD_LAYER_SOLID = 'admin-od-line-solid'
const OD_LAYER_DASH  = 'admin-od-line-dash'

// ─── Main ─────────────────────────────────────────────────────────────────────

function AdminMapPage() {
  const navigate = useNavigate()
  const lang     = getLang()
  const t        = ADMIN_T[lang]
  const [showRoutes,   setShowRoutes]   = useState(true)
  const [showStops,    setShowStops]    = useState(true)
  const [showStations, setShowStations] = useState(true)
  const [showEquity,   setShowEquity]   = useState(false)
  const [showOD,       setShowOD]       = useState(false)
  const [popupInfo,    setPopupInfo]    = useState<PopupInfo | null>(null)

  // ── Agrégation live ──────────────────────────────────────────────────────
  const [result,     setResult]     = useState<AggregationResult | null>(null)
  const [lastUpdate, setLastUpdate] = useState<number>(0)
  const [odMatrix,     setOdMatrix]     = useState<ODMatrix | null>(null)
  const [equityResult, setEquityResult] = useState<EquityResult | null>(null)

  const runAggregation = useCallback(async () => {
    const [routes, stops] = await Promise.all([getRoutes(), getStops()])
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

  // Corridors et arrêts : uniquement des données réellement soumises par les citoyens
  const livecorridors = result?.corridors ?? []

  const liveStops = (result?.stops ?? [])
    .filter(s => s.type === 'busstop')
    .map(s => ({ id: s.id, label: s.label, pos: s.pos as [number,number], count: s.count }))

  const liveStations = (result?.stops ?? [])
    .filter(s => s.type === 'station')
    .map(s => ({ id: s.id, label: s.label, pos: s.pos as [number,number], count: s.count }))

  const MAX_ROUTE_LIVE = Math.max(...livecorridors.map(c => c.count), 1)
  const MAX_STOP_LIVE  = Math.max(...liveStops.map(s => s.count), 1)
  const MAX_STA_LIVE   = Math.max(...liveStations.map(s => s.count), 1)

  // ── GeoJSON : corridors ──────────────────────────────────────────────────
  const corridorFC = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: livecorridors.map(c => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: c.points.map(toLngLat) },
      properties: {
        id: c.id, label: c.label, count: c.count,
        color: densityColor(c.count, MAX_ROUTE_LIVE),
        width: densityWeight(c.count, MAX_ROUTE_LIVE),
      },
    })),
  }), [livecorridors, MAX_ROUTE_LIVE])

  // ── GeoJSON : zones d'équité ─────────────────────────────────────────────
  const equityFC = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: EQ_ZONES.map(z => {
      const score = equityResult?.scores.find(s => s.zone.id === z.id)
      const color = score ? gapLevelColor(score.gapLevel) : '#888888'
      const [sw, ne] = z.bounds
      const ring = [
        [sw[1], sw[0]], [sw[1], ne[0]], [ne[1], ne[0]], [ne[1], sw[0]], [sw[1], sw[0]],
      ]
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          id: z.id, name: z.name, color,
          hasScore:     !!score,
          gapLevel:     score?.gapLevel ?? '',
          needScore:    score?.needScore ?? 0,
          serviceScore: score?.serviceScore ?? 0,
          gap:          score?.gap ?? 0,
          pop: z.pop, income: z.income, seniors: z.seniors,
        },
      }
    }),
  }), [equityResult])

  // ── GeoJSON : flux O-D ───────────────────────────────────────────────────
  const odFC = useMemo<GeoJSON.FeatureCollection>(() => {
    if (odMatrix) {
      const zoneMap  = new Map(odMatrix.zones.map(z => [z.id, z]))
      const maxTrips = odMatrix.cells[0]?.trips ?? 1
      const features: GeoJSON.Feature[] = []
      for (const cell of odMatrix.cells) {
        const fromZone = zoneMap.get(cell.fromZoneId)
        const toZone   = zoneMap.get(cell.toZoneId)
        if (!fromZone || !toZone) continue
        const ratio = cell.trips / maxTrips
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [toLngLat(fromZone.center), toLngLat(toZone.center)],
          },
          properties: {
            fromName: fromZone.name, toName: toZone.name,
            trips: cell.trips, rawCount: cell.rawCount, covered: cell.covered,
            color: cell.covered ? '#3498db' : '#e67e22',
            width: Math.min(Math.round(1 + ratio * 7), 8),
            opacity: 0.25 + ratio * 0.65,
          },
        })
      }
      return { type: 'FeatureCollection', features }
    }
    return { type: 'FeatureCollection', features: [] }
  }, [odMatrix])

  // ── Couches interactives actives (clic) ──────────────────────────────────
  const interactiveLayerIds = [
    showRoutes ? CORRIDOR_LAYER : null,
    showEquity ? EQUITY_LAYER   : null,
    showOD     ? OD_LAYER_SOLID : null,
    showOD     ? OD_LAYER_DASH  : null,
  ].filter((id): id is string => !!id)

  const handleMapClick = useCallback((e: MapMouseEvent) => {
    const feature = e.features?.[0]
    if (!feature) { setPopupInfo(null); return }
    const { lng, lat } = e.lngLat
    const p = feature.properties as Record<string, any>
    const layerId = feature.layer?.id

    if (layerId === CORRIDOR_LAYER) {
      setPopupInfo({ kind: 'corridor', lng, lat, label: p.label, count: p.count })
    } else if (layerId === EQUITY_LAYER) {
      setPopupInfo({
        kind: 'equity', lng, lat, name: p.name, color: p.color,
        hasScore: p.hasScore, gapLevel: p.gapLevel,
        needScore: p.needScore, serviceScore: p.serviceScore, gap: p.gap,
        pop: p.pop, income: p.income, seniors: p.seniors,
      })
    } else if (layerId === OD_LAYER_SOLID || layerId === OD_LAYER_DASH) {
      setPopupInfo({
        kind: 'od', lng, lat, fromName: p.fromName, toName: p.toName,
        trips: p.trips, rawCount: p.rawCount, covered: p.covered,
      })
    }
  }, [])

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
            {t.navDash}
          </a>
          <a className="db-nav-item db-nav-active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
              <line x1="8" y1="2" x2="8" y2="18"/>
              <line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
            {t.navMap}
          </a>
          <a className="db-nav-item" style={{cursor:'pointer'}} onClick={() => navigate('/simulateur')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            {t.navSim}
          </a>
          <a className="db-nav-item" style={{cursor:'pointer'}} onClick={() => navigate('/carte-finale')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
            </svg>
            {t.navFinal}
          </a>
        </nav>

        {/* Légende heatmap */}
        <div className="adm-legend">
          <p className="adm-legend-title">{t.legendTitle}</p>

          <div className="adm-heatmap-legend">
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#e74c3c' }} />
              <span className="adm-heat-label">{t.legHigh}</span>
            </div>
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#f39c12' }} />
              <span className="adm-heat-label">{t.legMed}</span>
            </div>
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#ecf0f1', border: '1px solid rgba(255,255,255,0.2)' }} />
              <span className="adm-heat-label">{t.legLow}</span>
            </div>
          </div>

          <div className="adm-legend-sep" />
          <p className="adm-legend-title">{t.legShow}</p>

          <label className="adm-legend-item">
            <input type="checkbox" checked={showRoutes}   onChange={e => setShowRoutes(e.target.checked)} />
            <span className="adm-legend-name">{t.legLines(livecorridors.length)}</span>
          </label>
          <label className="adm-legend-item">
            <input type="checkbox" checked={showStops}    onChange={e => setShowStops(e.target.checked)} />
            <span className="adm-legend-name">{t.legStops(liveStops.length)}</span>
          </label>
          <label className="adm-legend-item">
            <input type="checkbox" checked={showStations} onChange={e => setShowStations(e.target.checked)} />
            <span className="adm-legend-name">{t.legStations(liveStations.length)}</span>
          </label>

          <div className="adm-legend-sep" />
          <p className="adm-legend-title">{t.legEquity}</p>
          <div className="adm-heatmap-legend">
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#e74c3c' }} />
              <span className="adm-heat-label">{t.eqCritical}</span>
            </div>
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#f39c12' }} />
              <span className="adm-heat-label">{t.eqModerate}</span>
            </div>
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#f1c40f' }} />
              <span className="adm-heat-label">{t.eqAdequate}</span>
            </div>
            <div className="adm-heat-row">
              <span className="adm-heat-dot" style={{ background: '#2ecc71' }} />
              <span className="adm-heat-label">{t.eqSurplus}</span>
            </div>
          </div>
          {equityResult && (
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', margin: '4px 0 6px' }}>
              {t.eqGapVal(equityResult.weightedGap)}
              {equityResult.criticalZones.length > 0 && (
                <span style={{ color: '#e74c3c' }}> · {t.eqCritN(equityResult.criticalZones.length)}</span>
              )}
            </div>
          )}
          <label className="adm-legend-item">
            <input type="checkbox" checked={showEquity} onChange={e => setShowEquity(e.target.checked)} />
            <span className="adm-legend-name">{t.legEquityZones(EQ_ZONES.length)}</span>
          </label>

          <div className="adm-legend-sep" />
          <p className="adm-legend-title">{t.legOD}</p>
          <div className="adm-heatmap-legend">
            <div className="adm-heat-row">
              <span style={{ display:'inline-block', width:24, height:3, background:'#3498db', opacity:0.9, marginRight:8, borderRadius:2 }} />
              <span className="adm-heat-label">{t.odServed}</span>
            </div>
            <div className="adm-heat-row">
              <span style={{ display:'inline-block', width:24, height:2, background:'#e67e22', opacity:0.8, marginRight:8, borderRadius:2, borderTop:'1px dashed #e67e22' }} />
              <span className="adm-heat-label">{t.odUnserved}</span>
            </div>
          </div>
          {odMatrix && (
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', margin: '4px 0 6px' }}>
              {t.odInfo(odMatrix.cells.length, odMatrix.coveragePct, odMatrix.unmetDemand.length)}
            </div>
          )}
          <label className="adm-legend-item">
            <input type="checkbox" checked={showOD} onChange={e => setShowOD(e.target.checked)} />
            <span className="adm-legend-name">
              {t.legODLabel(odMatrix ? odMatrix.cells.length : 0)}
            </span>
          </label>

          <div className="adm-legend-sep" />
          <p className="adm-legend-title">{t.legData}</p>
          <div className="adm-stats-mini">
            <div className="adm-stat-mini">
              <span>{result ? result.totalRoutes : 0}</span>
              {t.datCitizen}
            </div>
            <div className="adm-stat-mini">
              <span>{result ? result.stops.filter(s => s.type === 'busstop').length : 0}</span>
              {t.datStopClus}
            </div>
            <div className="adm-stat-mini">
              <span>{result ? result.stops.filter(s => s.type === 'station').length : 0}</span>
              {t.datStaClus}
            </div>
          </div>

          {result && (
            <div style={{ padding: '8px 0 4px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                {t.datCorridors(livecorridors.length, result.gridStats.activeCells)}
              </span>
              <br />
              {t.datUpdated(new Date(lastUpdate).toLocaleTimeString(t.dateLocale, { hour: '2-digit', minute: '2-digit' }))}
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
            {t.btnRefresh}
          </button>
        </div>

        <button className="db-logout" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          {t.navLogout}
        </button>
      </aside>

      {/* ── Map ── */}
      <div className="mp-map-wrap" style={{ flex: 1, height: '100dvh', minWidth: 0, position: 'relative', overflow: 'hidden' }}>
        <MapGL
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MAPBOX_STYLE}
          initialViewState={MONCTON_VIEW}
          style={{ width: '100%', height: '100%' }}
          onClick={handleMapClick}
          interactiveLayerIds={interactiveLayerIds}
          attributionControl={false}
          logoPosition="bottom-right"
        >
          {/* Corridors / lignes — données agrégées */}
          {showRoutes && (
            <Source id="admin-corridors" type="geojson" data={corridorFC}>
              <Layer
                id={CORRIDOR_LAYER}
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color':   ['get', 'color'],
                  'line-width':   ['get', 'width'],
                  'line-opacity': 0.85,
                }}
              />
            </Source>
          )}

          {/* Zones d'équité — couleurs et scores calculés dynamiquement */}
          {showEquity && (
            <Source id="admin-equity" type="geojson" data={equityFC}>
              <Layer
                id={EQUITY_LAYER}
                type="fill"
                paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 }}
              />
              <Layer
                id="admin-equity-line"
                type="line"
                paint={{ 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [6, 4] }}
              />
            </Source>
          )}

          {/* Lignes de désir O-D — données calculées depuis les tracés citoyens */}
          {showOD && (
            <Source id="admin-od" type="geojson" data={odFC}>
              <Layer
                id={OD_LAYER_SOLID}
                type="line"
                filter={['==', ['get', 'covered'], true]}
                layout={{ 'line-cap': 'round' }}
                paint={{
                  'line-color':   ['get', 'color'],
                  'line-width':   ['get', 'width'],
                  'line-opacity': ['get', 'opacity'],
                }}
              />
              <Layer
                id={OD_LAYER_DASH}
                type="line"
                filter={['!=', ['get', 'covered'], true]}
                layout={{ 'line-cap': 'round' }}
                paint={{
                  'line-color':    ['get', 'color'],
                  'line-width':    ['get', 'width'],
                  'line-opacity':  ['get', 'opacity'],
                  'line-dasharray': [8, 5],
                }}
              />
            </Source>
          )}

          {/* Arrêts de bus — données agrégées */}
          {showStops && liveStops.map(s => (
            <Marker
              key={s.id}
              longitude={s.pos[1]}
              latitude={s.pos[0]}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation()
                setPopupInfo({ kind: 'stop', lng: s.pos[1], lat: s.pos[0], label: s.label, count: s.count })
              }}
            >
              <div
                title={s.label}
                style={{
                  width: densityRadius(s.count, MAX_STOP_LIVE) * 2,
                  height: densityRadius(s.count, MAX_STOP_LIVE) * 2,
                  borderRadius: '50%',
                  background: densityColor(s.count, MAX_STOP_LIVE),
                  opacity: 0.85,
                  border: '2px solid rgba(255,255,255,0.7)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  cursor: 'pointer',
                }}
              />
            </Marker>
          ))}

          {/* Stations — données agrégées */}
          {showStations && liveStations.map(s => (
            <Marker
              key={s.id}
              longitude={s.pos[1]}
              latitude={s.pos[0]}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation()
                setPopupInfo({ kind: 'station', lng: s.pos[1], lat: s.pos[0], label: s.label, count: s.count })
              }}
            >
              <div
                title={s.label}
                style={{
                  width: (densityRadius(s.count, MAX_STA_LIVE) + 3) * 2,
                  height: (densityRadius(s.count, MAX_STA_LIVE) + 3) * 2,
                  borderRadius: '50%',
                  background: densityColor(s.count, MAX_STA_LIVE),
                  opacity: 0.85,
                  border: '3px dashed rgba(255,255,255,0.8)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  cursor: 'pointer',
                }}
              />
            </Marker>
          ))}

          {/* ── Popups ── */}
          {popupInfo && (
            <Popup
              longitude={popupInfo.lng}
              latitude={popupInfo.lat}
              anchor="bottom"
              closeOnClick={false}
              onClose={() => setPopupInfo(null)}
            >
              {popupInfo.kind === 'corridor' && (
                <div style={{ minWidth: 190 }}>
                  <strong>{popupInfo.label}</strong><br />
                  <span style={{ color: '#666', fontSize: '0.82rem' }}>
                    {t.popCorridor(popupInfo.count)}
                  </span><br /><br />
                  <DensityBadge count={popupInfo.count} max={MAX_ROUTE_LIVE} />
                </div>
              )}

              {popupInfo.kind === 'stop' && (
                <div style={{ minWidth: 180 }}>
                  <strong>🚏 {popupInfo.label}</strong><br />
                  <span style={{ color: '#666', fontSize: '0.82rem' }}>
                    {t.popStop(popupInfo.count)}
                  </span><br /><br />
                  <DensityBadge count={popupInfo.count} max={MAX_STOP_LIVE} />
                </div>
              )}

              {popupInfo.kind === 'station' && (
                <div style={{ minWidth: 180 }}>
                  <strong>🏢 {popupInfo.label}</strong><br />
                  <span style={{ color: '#666', fontSize: '0.82rem' }}>
                    {t.popStation(popupInfo.count)}
                  </span><br /><br />
                  <DensityBadge count={popupInfo.count} max={MAX_STA_LIVE} />
                </div>
              )}

              {popupInfo.kind === 'equity' && (
                <div style={{ minWidth: 220 }}>
                  <strong>{popupInfo.name}</strong><br />
                  <span style={{ color: popupInfo.color, fontWeight: 700, fontSize: '0.8rem' }}>
                    {popupInfo.hasScore ? t.eqLevel(popupInfo.gapLevel as any) : '—'}
                  </span>
                  {popupInfo.hasScore && (
                    <>
                      <hr style={{ margin: '6px 0', borderColor: '#eee' }} />
                      <table style={{ fontSize: '0.8rem', width: '100%' }}>
                        <tbody>
                          <tr>
                            <td style={{ color: '#666' }}>{t.popNeed}</td>
                            <td><strong style={{ color: '#c0392b' }}>{popupInfo.needScore} / 100</strong></td>
                          </tr>
                          <tr>
                            <td style={{ color: '#666' }}>{t.popService}</td>
                            <td><strong style={{ color: popupInfo.color }}>{popupInfo.serviceScore} / 100</strong></td>
                          </tr>
                          <tr>
                            <td style={{ color: '#666' }}>{t.popGap}</td>
                            <td><strong style={{ color: popupInfo.color }}>
                              {popupInfo.gap > 0 ? '+' : ''}{popupInfo.gap} pts
                            </strong></td>
                          </tr>
                          <tr><td colSpan={2}><hr style={{ margin: '4px 0', borderColor: '#eee' }} /></td></tr>
                          <tr><td style={{ color: '#666' }}>{t.popPop}</td><td><strong>{popupInfo.pop.toLocaleString()}</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>{t.popIncome}</td><td><strong>{popupInfo.income.toLocaleString()} $</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>{t.popSeniors}</td><td><strong>{popupInfo.seniors} %</strong></td></tr>
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}

              {popupInfo.kind === 'od' && (
                <div style={{ minWidth: 200 }}>
                  <strong>{popupInfo.fromName} → {popupInfo.toName}</strong><br />
                  <span style={{ color: '#666', fontSize: '0.82rem' }}>
                    {t.popTrips(popupInfo.trips, popupInfo.rawCount)}
                  </span><br />
                  <span style={{
                    display: 'inline-block', marginTop: 6, padding: '2px 8px',
                    borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
                    background: popupInfo.covered ? '#3498db22' : '#e67e2222',
                    color: popupInfo.covered ? '#3498db' : '#e67e22',
                    border: `1px solid ${popupInfo.covered ? '#3498db55' : '#e67e2255'}`,
                  }}>
                    {popupInfo.covered ? t.popServed : t.popUnserved}
                  </span>
                </div>
              )}
            </Popup>
          )}
        </MapGL>

        {/* Titre flottant */}
        <div className="adm-map-title">
          <span>{t.mapPageTitle}</span>
        </div>
      </div>
    </div>
  )
}

export default AdminMapPage
