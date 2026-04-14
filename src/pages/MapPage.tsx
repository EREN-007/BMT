import React, { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Source, Layer, Marker } from 'react-map-gl/mapbox'
import type { MapRef, MapMouseEvent } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { saveRoutes, saveStops } from '@/lib/storage'

// ─── Mapbox config ────────────────────────────────────────────────────────────
const MAPBOX_TOKEN = 'pk.eyJ1IjoiZXJlbmphZ2VyIiwiYSI6ImNtbnh4Z3h4dTA3aWoycXB5ZGpmZTgwcWsifQ.aI1zk7S4WdSE4baYf4FYfQ'
const MAPBOX_STYLE = 'mapbox://styles/erenjager/cmnxylxae002401s4c7v68c3x'
const MONCTON    = { longitude: -64.760, latitude: 46.075, zoom: 13 }

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

interface StopModalProps {
  position: [number, number]
  type:     'busstop' | 'station'
  onConfirm: (label: string) => void
  onCancel:  () => void
}

function StopModal({ position, type, onConfirm, onCancel }: StopModalProps) {
  const [label, setLabel] = useState('')
  const [lat, lng] = position
  const imgUrl = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${lng},${lat},18,0/380x180@2x?access_token=${MAPBOX_TOKEN}`

  const typeFr = type === 'busstop' ? 'arrêt de bus' : 'station / gare'
  const placeholder = type === 'busstop' ? 'ex: Arrêt Main St.' : 'ex: Gare Moncton'

  return (
    <div className="mp-modal-overlay" role="dialog" aria-modal="true">
      <div className="mp-modal">
        <div className="mp-modal-header">
          <span className="mp-modal-icon">{type === 'busstop' ? '🚏' : '🏢'}</span>
          <div>
            <h2 className="mp-modal-title">
              {type === 'busstop' ? 'Placer un arrêt de bus' : 'Placer une station / gare'}
            </h2>
            <p className="mp-modal-coords">{lat.toFixed(5)}, {lng.toFixed(5)}</p>
          </div>
        </div>

        {/* Vue satellite via Mapbox Static Images */}
        <div className="mp-modal-map-wrap">
          <img
            src={imgUrl}
            alt="Vue satellite"
            className="mp-modal-sat-img"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="mp-modal-map-label">Vue satellite — {typeFr}</div>
        </div>

        <div className="mp-modal-form">
          <label className="mp-modal-field-label">Nom {typeFr}</label>
          <input
            className="mp-modal-input"
            type="text"
            placeholder={placeholder}
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onConfirm(label || typeFr)}
            autoFocus
          />
        </div>

        <div className="mp-modal-actions">
          <button className="mp-modal-btn mp-modal-cancel"  onClick={onCancel}>
            Annuler
          </button>
          <button
            className="mp-modal-btn mp-modal-confirm"
            onClick={() => onConfirm(label || typeFr)}
          >
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

  // ── Confirmer arrêt ────────────────────────────────────────────────────────
  const handleStopConfirm = useCallback((label: string) => {
    if (!pendingStop) return
    setStops(prev => [...prev, {
      id:       `stop-${Date.now()}`,
      type:     pendingStop.type,
      position: pendingStop.pos,
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
              <Layer
                id={`lyr-${route.id}`}
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color':   route.color,
                  'line-width':   5,
                  'line-opacity': route.finished ? 0.9 : 0.6,
                  ...(route.finished ? {} : { 'line-dasharray': [3, 3] }),
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
      {activeTool === 'pencil' && !isDrawing && (
        <div className="mp-hint">Appuyez sur la carte pour commencer une ligne</div>
      )}
      {activeTool === 'pencil' && isDrawing && (
        <div className="mp-hint mp-hint-drawing">
          Appuyez pour ajouter des points
        </div>
      )}

      {/* ── Toolbar flottant ── */}
      <div className="mp-float-toolbar">

        {/* Rangée outils */}
        <div className="mp-ft-row mp-ft-tools">

          {/* Crayon */}
          <button
            className={`mp-ft-btn ${activeTool === 'pencil' ? 'mp-ft-active' : ''}`}
            onClick={() => handleToolChange('pencil')}
            title="Tracer une ligne"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </button>

          {/* Palette — visible quand crayon actif */}
          {activeTool === 'pencil' && (
            <div className="mp-ft-palette">
              {ROUTE_COLORS.map(c => (
                <button
                  key={c.value}
                  className={`mp-ft-dot ${activeColor === c.value ? 'mp-ft-dot-on' : ''}`}
                  style={{ background: c.value }}
                  onClick={() => setActiveColor(c.value)}
                  title={c.label}
                />
              ))}
            </div>
          )}

          {/* Terminer — visible pendant tracé */}
          {isDrawing && (
            <button className="mp-ft-btn mp-ft-finish" onClick={finishRoute} title="Terminer la ligne">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>
          )}

          <div className="mp-ft-sep" />

          {/* Gomme */}
          <button
            className={`mp-ft-btn ${activeTool === 'eraser' ? 'mp-ft-active' : ''}`}
            onClick={() => handleToolChange('eraser')}
            title="Effacer le dernier élément"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M20 20H7L3 16l10-10 7 7-1.5 1.5"/>
              <path d="M6 17.5l3-3"/>
            </svg>
          </button>

          {/* Arrêt */}
          <button
            className={`mp-ft-btn ${activeTool === 'busstop' ? 'mp-ft-active' : ''}`}
            onClick={() => handleToolChange('busstop')}
            title="Placer un arrêt de bus"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="3" width="18" height="12" rx="2"/>
              <path d="M7 15v2M17 15v2M3 9h18"/>
              <circle cx="7.5"  cy="19" r="2"/>
              <circle cx="16.5" cy="19" r="2"/>
            </svg>
          </button>

          {/* Station */}
          <button
            className={`mp-ft-btn ${activeTool === 'station' ? 'mp-ft-active' : ''}`}
            onClick={() => handleToolChange('station')}
            title="Placer une station"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 21h18M5 21V7l7-4 7 4v14"/>
              <path d="M9 21v-4a2 2 0 0 1 4 0v4"/>
            </svg>
          </button>

          <div className="mp-ft-sep" />

          {/* Résultats */}
          <button
            className="mp-ft-btn mp-ft-results"
            onClick={() => navigate('/results')}
            title="Voir la carte citoyenne"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </button>
        </div>

        {/* Rangée stats + Suivant */}
        <div className="mp-ft-row mp-ft-actions">
          <div className="mp-ft-stats">
            <span>
              <strong>{finishedCount}</strong> ligne{finishedCount !== 1 ? 's' : ''}
            </span>
            {stopCount > 0 && (
              <span><strong>{stopCount}</strong> arrêt{stopCount !== 1 ? 's' : ''}</span>
            )}
            {stationCount > 0 && (
              <span><strong>{stationCount}</strong> gare{stationCount !== 1 ? 's' : ''}</span>
            )}
          </div>
          <button className="mp-ft-next" onClick={handleNext}>
            Suivant
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Modal arrêt ── */}
      {pendingStop && (
        <StopModal
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
