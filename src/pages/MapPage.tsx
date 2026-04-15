import React, { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Source, Layer, Marker } from 'react-map-gl/mapbox'
import type { MapRef, MapMouseEvent } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { saveRoutes, saveStops } from '@/lib/storage'

// ─── Mapbox config ────────────────────────────────────────────────────────────
const MAPBOX_TOKEN = 'pk.eyJ1IjoiZXJlbmphZ2VyIiwiYSI6ImNtbnh4Z3h4dTA3aWoycXB5ZGpmZTgwcWsifQ.aI1zk7S4WdSE4baYf4FYfQ'
const MAPBOX_STYLE = 'mapbox://styles/erenjager/cmnxylxae002401s4c7v68c3x'
const MONCTON    = { longitude: -64.760, latitude: 46.075, zoom: 13, pitch: 45, bearing: -17 }

// [lat,lng] → [lng,lat] (storage vs Mapbox convention)
const toLngLat = ([lat, lng]: [number, number]): [number, number] => [lng, lat]

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool = 'pencil' | 'eraser' | 'busstop' | 'station'

const ROUTE_COLORS = [
  { value: '#e74c3c', label: 'Rouge'  },
  { value: '#3498db', label: 'Bleu'   },
  { value: '#2ecc71', label: 'Vert'   },
  { value: '#f39c12', label: 'Orange' },
  { value: '#9b59b6', label: 'Mauve'  },
] as const
type RouteColor = typeof ROUTE_COLORS[number]['value']

interface Route {
  id:       string
  points:   [number, number][]  // [lat, lng] — convention storage
  color:    RouteColor
  finished: boolean
}

interface Stop {
  id:       string
  type:     'busstop' | 'station'
  position: [number, number]    // [lat, lng]
  label:    string
}

// ─── GeoJSON helper ───────────────────────────────────────────────────────────

function routeGeoJSON(route: Route): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: route.points.map(toLngLat) },
    properties: {},
  }
}

// ─── Stop Name Modal ──────────────────────────────────────────────────────────
// Utilise Mapbox Static Images pour la vue satellite (pas de Leaflet)

interface ImmersiveStopModalProps {
  position:  [number, number]   // [lat, lng] tap initial
  type:      'busstop' | 'station'
  onConfirm: (label: string, refinedPos: [number, number]) => void
  onCancel:  () => void
}

function ImmersiveStopModal({ position, type, onConfirm, onCancel }: ImmersiveStopModalProps) {
  const [label,     setLabel]     = useState('')
  const [mapCenter, setMapCenter] = useState<[number, number]>(position) // [lat, lng]

  const typeFr      = type === 'busstop' ? 'Arrêt de bus' : 'Station / Gare'
  const typeEn      = type === 'busstop' ? 'Bus stop'     : 'Station'
  const placeholder = type === 'busstop' ? 'ex: Arrêt Main St.' : 'ex: Gare Moncton'

  const handleConfirm = () => onConfirm(label.trim() || typeFr, mapCenter)

  return (
    <div className="mp-imm-root">

      {/* ── Carte 3D interactive ── */}
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAPBOX_STYLE}
        initialViewState={{
          longitude: position[1],
          latitude:  position[0],
          zoom:      18,
          pitch:     60,
          bearing:   -17,
        }}
        style={{ width: '100%', height: '100%' }}
        onMove={e => setMapCenter([e.viewState.latitude, e.viewState.longitude])}
        attributionControl={false}
        logoPosition="bottom-right"
      />

      {/* ── Pin fixe au centre de l'écran ── */}
      <div className="mp-imm-pin-wrap" aria-hidden>
        <div className={`mp-imm-pin mp-imm-pin-${type}`}>
          {type === 'busstop' ? (
            <svg viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" fill="#1255a0" stroke="white" strokeWidth="2.5"/>
              <rect x="9"  y="9"  width="14" height="9"  rx="2" fill="white" opacity=".9"/>
              <rect x="9"  y="12" width="14" height="2.5" fill="#FFD700"/>
              <circle cx="12" cy="23" r="2.5" fill="white"/>
              <circle cx="20" cy="23" r="2.5" fill="white"/>
            </svg>
          ) : (
            <svg viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" fill="#e6b800" stroke="white" strokeWidth="2.5"/>
              <path d="M16 7L9 12v12h14V12L16 7z" fill="white" opacity=".9"/>
              <rect x="12.5" y="16" width="3"  height="8" fill="#e6b800"/>
              <rect x="16.5" y="16" width="3"  height="8" fill="#e6b800"/>
              <rect x="11"   y="11" width="4"  height="4" rx=".5" fill="#e6b800"/>
              <rect x="17"   y="11" width="4"  height="4" rx=".5" fill="#e6b800"/>
            </svg>
          )}
        </div>
        {/* Ombre projetée vers le bas */}
        <div className="mp-imm-pin-shadow" />
        {/* Pulse ring */}
        <div className={`mp-imm-pulse mp-imm-pulse-${type}`} />
      </div>

      {/* ── Header ── */}
      <div className="mp-imm-header">
        <button className="mp-imm-back" onClick={onCancel} aria-label="Annuler">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="mp-imm-header-info">
          <span className="mp-imm-type">{typeFr} / {typeEn}</span>
          <span className="mp-imm-coords">
            {mapCenter[0].toFixed(5)}, {mapCenter[1].toFixed(5)}
          </span>
        </div>
      </div>

      {/* ── Panneau bas ── */}
      <div className="mp-imm-panel">
        <p className="mp-imm-hint">
          {type === 'busstop'
            ? 'Déplacez la carte pour positionner l\'arrêt avec précision'
            : 'Déplacez la carte pour positionner la station avec précision'}
        </p>
        <input
          className="mp-imm-input"
          type="text"
          placeholder={placeholder}
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleConfirm()}
        />
        <div className="mp-imm-actions">
          <button className="mp-imm-btn-cancel" onClick={onCancel}>
            Annuler
          </button>
          <button className="mp-imm-btn-confirm" onClick={handleConfirm}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function MapPage() {
  const navigate  = useNavigate()
  const mapRef    = useRef<MapRef>(null)

  const [activeTool,  setActiveTool]  = useState<Tool>('pencil')
  const [activeColor, setActiveColor] = useState<RouteColor>('#3498db')
  const [isDrawing,   setIsDrawing]   = useState(false)
  const [routes,      setRoutes]      = useState<Route[]>([])
  const [stops,       setStops]       = useState<Stop[]>([])
  const [pendingStop, setPendingStop] = useState<{ pos: [number, number]; type: 'busstop' | 'station' } | null>(null)
  const [menuOpen,    setMenuOpen]    = useState(false)

  const currentIdRef = useRef<string>('')

  // ── Clic sur la carte ──────────────────────────────────────────────────────
  const handleMapClick = useCallback((e: MapMouseEvent) => {
    // Ne pas déclencher si on clique sur un bouton du toolbar
    if ((e.originalEvent.target as HTMLElement).closest('.mp-float-toolbar')) return

    const { lng, lat } = e.lngLat
    const pt: [number, number] = [lat, lng]

    if (activeTool === 'pencil') {
      if (!isDrawing) {
        const id = `route-${Date.now()}`
        currentIdRef.current = id
        setIsDrawing(true)
        setRoutes(prev => [...prev, { id, points: [pt], color: activeColor, finished: false }])
      } else {
        setRoutes(prev =>
          prev.map(r => r.id === currentIdRef.current ? { ...r, points: [...r.points, pt] } : r)
        )
      }
    } else if (activeTool === 'busstop') {
      setPendingStop({ pos: pt, type: 'busstop' })
    } else if (activeTool === 'station') {
      setPendingStop({ pos: pt, type: 'station' })
    }
  }, [activeTool, activeColor, isDrawing])

  // ── Terminer le tracé ──────────────────────────────────────────────────────
  const finishRoute = useCallback(() => {
    setRoutes(prev => prev.map(r => !r.finished ? { ...r, finished: true } : r))
    setIsDrawing(false)
  }, [])

  // ── Effacer le dernier élément ─────────────────────────────────────────────
  const eraseLastItem = useCallback(() => {
    if (stops.length > 0) {
      setStops(prev => prev.slice(0, -1))
      return
    }
    if (routes.length > 0) {
      setRoutes(prev => {
        const finished = prev.filter(r => r.finished)
        if (finished.length > 0)
          return prev.filter(r => r.id !== finished[finished.length - 1].id)
        return prev.slice(0, -1)
      })
      setIsDrawing(false)
    }
  }, [routes, stops])

  // ── Changement d'outil ─────────────────────────────────────────────────────
  const handleToolChange = useCallback((tool: Tool) => {
    if (activeTool === 'pencil' && isDrawing) finishRoute()
    setActiveTool(tool)
    if (tool === 'eraser') eraseLastItem()
  }, [activeTool, isDrawing, finishRoute, eraseLastItem])

  // ── Confirmer arrêt (position affinée depuis la carte 3D) ─────────────────
  const handleStopConfirm = useCallback((label: string, refinedPos: [number, number]) => {
    if (!pendingStop) return
    setStops(prev => [...prev, {
      id:       `stop-${Date.now()}`,
      type:     pendingStop.type,
      position: refinedPos,
      label,
    }])
    setPendingStop(null)
  }, [pendingStop])

  // ── Sauvegarder et naviguer ────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    const sessionId     = `session-${Date.now()}`
    const finishedRoutes = routes.filter(r => r.finished && r.points.length >= 2)

    if (finishedRoutes.length > 0)
      saveRoutes(finishedRoutes.map(r => ({ points: r.points, color: r.color })), sessionId)

    if (stops.length > 0)
      saveStops(stops.map(s => ({ pos: s.position, type: s.type, label: s.label })), sessionId)

    navigate('/page4')
  }, [routes, stops, navigate])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const finishedCount = routes.filter(r => r.finished).length
  const stopCount     = stops.filter(s => s.type === 'busstop').length
  const stationCount  = stops.filter(s => s.type === 'station').length

  // ── Curseur selon outil ────────────────────────────────────────────────────
  const cursor =
    activeTool === 'pencil'  ? 'crosshair' :
    activeTool === 'eraser'  ? 'not-allowed' : 'copy'

  return (
    <div className="mp-root">

      {/* ── Carte Mapbox GL (plein écran) ── */}
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAPBOX_STYLE}
        initialViewState={MONCTON}
        style={{ width: '100%', height: '100%' }}
        onClick={handleMapClick}
        cursor={cursor}
        attributionControl={false}
        logoPosition="bottom-right"
      >
        {/* Routes tracées */}
        {routes.map(route =>
          route.points.length >= 2 && (
            <Source key={route.id} id={`src-${route.id}`} type="geojson" data={routeGeoJSON(route)}>
              {/* Casing blanc en dessous — donne un contour qui épouse la route */}
              <Layer
                id={`lyr-casing-${route.id}`}
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': '#ffffff',
                  'line-width': [
                    'interpolate', ['exponential', 1.6], ['zoom'],
                    10, 3,
                    13, 6,
                    15, 10,
                    17, 16,
                    19, 26,
                  ],
                  'line-opacity': route.finished ? 0.25 : 0.12,
                  'line-blur': 1,
                }}
              />
              {/* Ligne colorée par-dessus */}
              <Layer
                id={`lyr-${route.id}`}
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': route.color,
                  'line-width': [
                    'interpolate', ['exponential', 1.6], ['zoom'],
                    10, 2,
                    13, 4,
                    15, 7,
                    17, 11,
                    19, 18,
                  ],
                  'line-opacity': route.finished ? 0.88 : 0.55,
                  ...(route.finished ? {} : { 'line-dasharray': [4, 3] }),
                }}
              />
            </Source>
          )
        )}

        {/* Arrêts et stations */}
        {stops.map(stop => (
          <Marker
            key={stop.id}
            longitude={stop.position[1]}
            latitude={stop.position[0]}
            anchor="bottom"
          >
            <div
              className={`mp-mb-pin mp-mb-pin-${stop.type}`}
              title={stop.label}
            >
              {stop.type === 'busstop'
                ? (
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="2" width="18" height="14" rx="3" fill="#1255a0"/>
                    <rect x="5" y="4" width="5"  height="5"  rx="1" fill="white" opacity=".9"/>
                    <rect x="14" y="4" width="5" height="5"  rx="1" fill="white" opacity=".9"/>
                    <rect x="3" y="10" width="18" height="3" fill="#FFD700"/>
                    <circle cx="7"  cy="19" r="3" fill="#1a1a2e"/>
                    <circle cx="17" cy="19" r="3" fill="#1a1a2e"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L4 7v13h16V7L12 2z" fill="#e6b800"/>
                    <rect x="8"  y="12" width="3" height="8" fill="#0a1628"/>
                    <rect x="13" y="12" width="3" height="8" fill="#0a1628"/>
                    <rect x="6"  y="7"  width="4" height="4" rx=".5" fill="white" opacity=".9"/>
                    <rect x="14" y="7"  width="4" height="4" rx=".5" fill="white" opacity=".9"/>
                    <rect x="10" y="7"  width="4" height="4" rx=".5" fill="white" opacity=".9"/>
                  </svg>
                )
              }
            </div>
          </Marker>
        ))}
      </Map>

      {/* ── Hint de dessin ── */}
      {activeTool === 'pencil' && !isDrawing && menuOpen && (
        <div className="mp-hint">Appuyez sur la carte pour commencer une ligne</div>
      )}
      {activeTool === 'pencil' && isDrawing && (
        <div className="mp-hint mp-hint-drawing">Appuyez pour ajouter des points</div>
      )}

      {/* ── Toolbar flottant ── */}
      <div className="mp-float-toolbar">

        {/* Panneau outils — déployable ── */}
        <div className={`mp-ft-menu ${menuOpen ? 'mp-ft-menu-open' : ''}`}>

          {/* Ligne 1 : crayon + palette + terminer */}
          <div className="mp-ft-menu-row">
            <button
              className={`mp-ft-btn ${activeTool === 'pencil' ? 'mp-ft-active' : ''}`}
              onClick={() => handleToolChange('pencil')}
              title="Tracer une ligne"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            </button>

            <div className="mp-ft-palette">
              {ROUTE_COLORS.map(c => (
                <button
                  key={c.value}
                  className={`mp-ft-dot ${activeColor === c.value ? 'mp-ft-dot-on' : ''}`}
                  style={{ background: c.value }}
                  onClick={() => { setActiveColor(c.value); setActiveTool('pencil') }}
                  title={c.label}
                />
              ))}
            </div>

            {isDrawing && (
              <button className="mp-ft-btn mp-ft-finish" onClick={finishRoute} title="Terminer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
            )}
          </div>

          {/* Ligne 2 : gomme, arrêt, station, résultats */}
          <div className="mp-ft-menu-row">
            <button
              className={`mp-ft-btn ${activeTool === 'eraser' ? 'mp-ft-active' : ''}`}
              onClick={() => handleToolChange('eraser')}
              title="Effacer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M20 20H7L3 16l10-10 7 7-1.5 1.5"/>
                <path d="M6 17.5l3-3"/>
              </svg>
            </button>

            <button
              className={`mp-ft-btn ${activeTool === 'busstop' ? 'mp-ft-active' : ''}`}
              onClick={() => handleToolChange('busstop')}
              title="Arrêt de bus"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="18" height="12" rx="2"/>
                <path d="M7 15v2M17 15v2M3 9h18"/>
                <circle cx="7.5"  cy="19" r="2"/>
                <circle cx="16.5" cy="19" r="2"/>
              </svg>
            </button>

            <button
              className={`mp-ft-btn ${activeTool === 'station' ? 'mp-ft-active' : ''}`}
              onClick={() => handleToolChange('station')}
              title="Station"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 21h18M5 21V7l7-4 7 4v14"/>
                <path d="M9 21v-4a2 2 0 0 1 4 0v4"/>
              </svg>
            </button>

            <div className="mp-ft-sep" />

            <button
              className="mp-ft-btn mp-ft-results"
              onClick={() => navigate('/results')}
              title="Carte citoyenne"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Barre principale — toujours visible ── */}
        <div className="mp-ft-row mp-ft-actions">

          {/* Bouton hamburger */}
          <button
            className={`mp-ft-burger ${menuOpen ? 'mp-ft-burger-open' : ''}`}
            onClick={() => setMenuOpen(o => !o)}
            title="Outils"
          >
            <span /><span /><span />
          </button>

          {/* Outil actif — badge contextuel */}
          <div className="mp-ft-active-badge">
            {activeTool === 'pencil'  && <span style={{ color: activeColor }}>● Tracer</span>}
            {activeTool === 'eraser'  && <span>✕ Gomme</span>}
            {activeTool === 'busstop' && <span>🚏 Arrêt</span>}
            {activeTool === 'station' && <span>🏢 Station</span>}
          </div>

          <div className="mp-ft-stats">
            {finishedCount > 0 && <span><strong>{finishedCount}</strong> ligne{finishedCount !== 1 ? 's' : ''}</span>}
            {stopCount     > 0 && <span><strong>{stopCount}</strong> arrêt{stopCount !== 1 ? 's' : ''}</span>}
          </div>

          <button className="mp-ft-next" onClick={handleNext}>
            Suivant
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Modal immersif 3D ── */}
      {pendingStop && (
        <ImmersiveStopModal
          position={pendingStop.pos}
          type={pendingStop.type}
          onConfirm={handleStopConfirm}
          onCancel={() => setPendingStop(null)}
        />
      )}
    </div>
  )
}

export default MapPage
