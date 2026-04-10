import React, { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { saveRoutes, saveStops } from '@/lib/storage'

// Fix Leaflet default icon path broken by Vite bundler
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool = 'pencil' | 'eraser' | 'busstop' | 'station'

const ROUTE_COLORS = [
  { value: '#e74c3c', label: 'Rouge'    },
  { value: '#3498db', label: 'Bleu'     },
  { value: '#2ecc71', label: 'Vert'     },
  { value: '#f39c12', label: 'Orange'   },
  { value: '#9b59b6', label: 'Mauve'    },
] as const

type RouteColor = typeof ROUTE_COLORS[number]['value']

interface Route {
  id: string
  points: [number, number][]
  color: RouteColor
  finished: boolean
}

interface Stop {
  id: string
  type: 'busstop' | 'station'
  position: [number, number]
  label: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Grand Moncton (Moncton · Dieppe · Riverview)
const MONCTON_CENTER: [number, number] = [46.075, -64.760]
const INITIAL_ZOOM = 13

// ESRI World Imagery — satellite réaliste, gratuit
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const SATELLITE_ATTR  = 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'

// ─── Custom marker icons ───────────────────────────────────────────────────────

const busStopIcon = L.divIcon({
  html: `
    <div class="mp-stop-icon mp-stop-busstop">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="2" width="18" height="14" rx="3" fill="#1255a0"/>
        <rect x="5" y="4" width="5" height="5" rx="1" fill="white" opacity="0.9"/>
        <rect x="14" y="4" width="5" height="5" rx="1" fill="white" opacity="0.9"/>
        <rect x="3" y="10" width="18" height="3" fill="#FFD700"/>
        <circle cx="7"  cy="19" r="3" fill="#1a1a2e"/>
        <circle cx="17" cy="19" r="3" fill="#1a1a2e"/>
        <line x1="12" y1="16" x2="12" y2="22" stroke="#1255a0" stroke-width="2"/>
      </svg>
    </div>`,
  className: '',
  iconSize: [36, 44],
  iconAnchor: [18, 44],
  popupAnchor: [0, -44],
})

const stationIcon = L.divIcon({
  html: `
    <div class="mp-stop-icon mp-stop-station">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L4 7v13h16V7L12 2z" fill="#e6b800"/>
        <rect x="8"  y="12" width="3" height="8" fill="#0a1628"/>
        <rect x="13" y="12" width="3" height="8" fill="#0a1628"/>
        <rect x="6"  y="7"  width="4" height="4" rx="0.5" fill="white" opacity="0.9"/>
        <rect x="14" y="7"  width="4" height="4" rx="0.5" fill="white" opacity="0.9"/>
        <rect x="10" y="7"  width="4" height="4" rx="0.5" fill="white" opacity="0.9"/>
      </svg>
    </div>`,
  className: '',
  iconSize: [40, 48],
  iconAnchor: [20, 48],
  popupAnchor: [0, -48],
})

// ─── Map interaction handler ───────────────────────────────────────────────────

interface MapInteractionProps {
  activeTool: Tool
  activeColor: RouteColor
  isDrawing: boolean
  setIsDrawing: (v: boolean) => void
  routes: Route[]
  setRoutes: React.Dispatch<React.SetStateAction<Route[]>>
  onStopRequest: (pos: [number, number], type: 'busstop' | 'station') => void
}

function MapInteraction({
  activeTool,
  activeColor,
  isDrawing,
  setIsDrawing,
  routes,
  setRoutes,
  onStopRequest,
}: MapInteractionProps) {
  const currentIdRef = useRef<string>('')

  useMapEvents({
    click(e) {
      const pt: [number, number] = [e.latlng.lat, e.latlng.lng]

      if (activeTool === 'pencil') {
        if (!isDrawing) {
          // Start new route
          const id = `route-${Date.now()}`
          currentIdRef.current = id
          setIsDrawing(true)
          setRoutes(prev => [...prev, { id, points: [pt], color: activeColor, finished: false }])
        } else {
          // Extend current route
          setRoutes(prev =>
            prev.map(r =>
              r.id === currentIdRef.current
                ? { ...r, points: [...r.points, pt] }
                : r
            )
          )
        }
      } else if (activeTool === 'busstop') {
        onStopRequest(pt, 'busstop')
      } else if (activeTool === 'station') {
        onStopRequest(pt, 'station')
      }
    },
  })

  return null
}

// ─── Satellite 3D Modal ────────────────────────────────────────────────────────

interface SatModalProps {
  position: [number, number]
  type: 'busstop' | 'station'
  onConfirm: (label: string) => void
  onCancel: () => void
}

function SatelliteModal({ position, type, onConfirm, onCancel }: SatModalProps) {
  const [label, setLabel] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Mount a Leaflet satellite map inside the modal
  React.useEffect(() => {
    if (!containerRef.current) return

    const map = L.map(containerRef.current, {
      center: position,
      zoom: 19,
      zoomControl: false,
      attributionControl: false,
    })

    L.tileLayer(SATELLITE_TILES, { attribution: SATELLITE_ATTR, maxZoom: 20 }).addTo(map)

    // Labels overlay (Esri World Boundary and Place Labels)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, opacity: 0.8 }
    ).addTo(map)

    // Pin at clicked position
    const pinIcon = L.divIcon({
      html: `<div class="mp-sat-pin ${type === 'busstop' ? 'mp-sat-pin-bus' : 'mp-sat-pin-station'}"></div>`,
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    })
    L.marker(position, { icon: pinIcon }).addTo(map)

    mapRef.current = map
    setMapReady(true)

    return () => { map.remove() }
  }, [])

  const typeLabel = type === 'busstop' ? 'arrêt de bus' : 'station / gare'
  const typePlaceholder = type === 'busstop' ? 'ex: Arrêt Main St.' : 'ex: Gare Moncton'

  return (
    <div className="mp-modal-overlay" role="dialog" aria-modal="true">
      <div className="mp-modal">
        <div className="mp-modal-header">
          <span className="mp-modal-icon">{type === 'busstop' ? '🚏' : '🏢'}</span>
          <div>
            <h2 className="mp-modal-title">
              {type === 'busstop' ? 'Placer un arrêt de bus' : 'Placer une station / gare'}
            </h2>
            <p className="mp-modal-coords">
              {position[0].toFixed(5)}, {position[1].toFixed(5)}
            </p>
          </div>
        </div>

        <div className="mp-modal-map-wrap">
          <div ref={containerRef} className="mp-modal-map" />
          <div className="mp-modal-map-label">Vue satellite — {typeLabel}</div>
        </div>

        <div className="mp-modal-form">
          <label className="mp-modal-field-label">Nom {typeLabel}</label>
          <input
            className="mp-modal-input"
            type="text"
            placeholder={typePlaceholder}
            value={label}
            onChange={e => setLabel(e.target.value)}
            autoFocus
          />
        </div>

        <div className="mp-modal-actions">
          <button className="mp-modal-btn mp-modal-cancel" onClick={onCancel}>
            Annuler
          </button>
          <button
            className="mp-modal-btn mp-modal-confirm"
            onClick={() => onConfirm(label || typeLabel)}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function MapPage() {
  const navigate = useNavigate()
  const [activeTool, setActiveTool]     = useState<Tool>('pencil')
  const [activeColor, setActiveColor]   = useState<RouteColor>('#3498db')
  const [isDrawing, setIsDrawing]       = useState(false)
  const [routes, setRoutes]             = useState<Route[]>([])
  const [stops, setStops]               = useState<Stop[]>([])
  const [pendingStop, setPendingStop]   = useState<{ pos: [number, number]; type: 'busstop' | 'station' } | null>(null)

  // Finish current pencil route
  const finishRoute = useCallback(() => {
    setRoutes(prev => prev.map(r => (!r.finished ? { ...r, finished: true } : r)))
    setIsDrawing(false)
  }, [])

  // Erase last route or last stop
  const eraseLastItem = useCallback(() => {
    if (stops.length > 0) {
      setStops(prev => prev.slice(0, -1))
    } else if (routes.length > 0) {
      setRoutes(prev => {
        const finished = prev.filter(r => r.finished)
        if (finished.length > 0) return prev.filter(r => r.id !== finished[finished.length - 1].id)
        return prev.slice(0, -1)
      })
    }
  }, [routes, stops])

  // Request to place a stop → open satellite modal
  const handleStopRequest = useCallback((pos: [number, number], type: 'busstop' | 'station') => {
    setPendingStop({ pos, type })
  }, [])

  // Confirm stop placement
  const handleStopConfirm = useCallback((label: string) => {
    if (!pendingStop) return
    setStops(prev => [...prev, {
      id: `stop-${Date.now()}`,
      type: pendingStop.type,
      position: pendingStop.pos,
      label,
    }])
    setPendingStop(null)
  }, [pendingStop])

  // Switch tool — finish drawing if leaving pencil
  const handleToolChange = useCallback((tool: Tool) => {
    if (activeTool === 'pencil' && isDrawing) finishRoute()
    setActiveTool(tool)
    if (tool === 'eraser') eraseLastItem()
  }, [activeTool, isDrawing, finishRoute, eraseLastItem])

  return (
    <div className="mp-root">

      {/* ── Toolbar ── */}
      <aside className="mp-toolbar">
        <div className="mp-toolbar-brand">
          <span>BMT</span>
        </div>

        {/* Pencil */}
        <div className="mp-tool-group">
          <button
            className={`mp-tool-btn ${activeTool === 'pencil' ? 'mp-tool-active' : ''}`}
            onClick={() => handleToolChange('pencil')}
            title="Tracer une ligne de bus"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
            <span>Tracer</span>
          </button>

          {/* Color swatches — visible only when pencil is active */}
          {activeTool === 'pencil' && (
            <div className="mp-colors">
              {ROUTE_COLORS.map(c => (
                <button
                  key={c.value}
                  className={`mp-color-dot ${activeColor === c.value ? 'mp-color-active' : ''}`}
                  style={{ background: c.value }}
                  onClick={() => setActiveColor(c.value)}
                  title={c.label}
                />
              ))}
            </div>
          )}
        </div>

        {/* Eraser */}
        <button
          className={`mp-tool-btn ${activeTool === 'eraser' ? 'mp-tool-active' : ''}`}
          onClick={() => handleToolChange('eraser')}
          title="Effacer le dernier élément"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 20H7L3 16l10-10 7 7-1.5 1.5"/>
            <path d="M6.0 17.5l3-3"/>
          </svg>
          <span>Gomme</span>
        </button>

        <div className="mp-toolbar-divider" />

        {/* Bus stop */}
        <button
          className={`mp-tool-btn ${activeTool === 'busstop' ? 'mp-tool-active' : ''}`}
          onClick={() => handleToolChange('busstop')}
          title="Placer un arrêt de bus"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="12" rx="2"/>
            <path d="M7 15v2"/>
            <path d="M17 15v2"/>
            <path d="M3 9h18"/>
            <circle cx="7.5" cy="19" r="2"/>
            <circle cx="16.5" cy="19" r="2"/>
          </svg>
          <span>Arrêt</span>
        </button>

        {/* Station */}
        <button
          className={`mp-tool-btn ${activeTool === 'station' ? 'mp-tool-active' : ''}`}
          onClick={() => handleToolChange('station')}
          title="Placer une station / gare"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 21h18"/>
            <path d="M5 21V7l7-4 7 4v14"/>
            <path d="M9 21v-4a2 2 0 0 1 4 0v4"/>
          </svg>
          <span>Station</span>
        </button>

        <div className="mp-toolbar-divider" />

        {/* Finish route button — only visible while drawing */}
        {isDrawing && (
          <button className="mp-tool-btn mp-tool-finish" onClick={finishRoute} title="Terminer la ligne">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Terminer</span>
          </button>
        )}

        {/* Stats */}
        <div className="mp-stats">
          <span>{routes.filter(r => r.finished).length} ligne{routes.filter(r => r.finished).length !== 1 ? 's' : ''}</span>
          <span>{stops.filter(s => s.type === 'busstop').length} arrêt{stops.filter(s => s.type === 'busstop').length !== 1 ? 's' : ''}</span>
          <span>{stops.filter(s => s.type === 'station').length} gare{stops.filter(s => s.type === 'station').length !== 1 ? 's' : ''}</span>
        </div>
      </aside>

      {/* ── Map ── */}
      <div className={`mp-map-wrap ${activeTool !== 'pencil' || !isDrawing ? '' : 'mp-map-drawing'}`}>
        <MapContainer
          center={MONCTON_CENTER}
          zoom={INITIAL_ZOOM}
          className="mp-leaflet"
          zoomControl={false}
        >
          {/* Base layer — OSM réaliste */}
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={20}
          />

          {/* Routes tracées */}
          {routes.map(route =>
            route.points.length >= 2 && (
              <Polyline
                key={route.id}
                positions={route.points}
                pathOptions={{
                  color: route.color,
                  weight: 5,
                  opacity: route.finished ? 0.85 : 0.65,
                  dashArray: route.finished ? undefined : '8 6',
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            )
          )}

          {/* Arrêts et stations */}
          {stops.map(stop => (
            <Marker
              key={stop.id}
              position={stop.position}
              icon={stop.type === 'busstop' ? busStopIcon : stationIcon}
            >
              <Popup>{stop.label}</Popup>
            </Marker>
          ))}

          <MapInteraction
            activeTool={activeTool}
            activeColor={activeColor}
            isDrawing={isDrawing}
            setIsDrawing={setIsDrawing}
            routes={routes}
            setRoutes={setRoutes}
            onStopRequest={handleStopRequest}
          />
        </MapContainer>

        {/* Hint overlay */}
        {activeTool === 'pencil' && !isDrawing && (
          <div className="mp-hint">Cliquez sur la carte pour commencer une ligne</div>
        )}
        {activeTool === 'pencil' && isDrawing && (
          <div className="mp-hint mp-hint-drawing">Cliquez pour ajouter des points · <strong>Terminer</strong> pour sauvegarder</div>
        )}
        {activeTool === 'busstop' && (
          <div className="mp-hint">Cliquez pour placer un arrêt de bus</div>
        )}
        {activeTool === 'station' && (
          <div className="mp-hint">Cliquez pour placer une station / gare</div>
        )}
        {activeTool === 'eraser' && (
          <div className="mp-hint">Dernier élément effacé · Changez d'outil pour continuer</div>
        )}

        {/* Bouton Suivant */}
        <button className="mp-next-btn" onClick={() => {
          // Générer un identifiant de session unique pour cette soumission
          const sessionId = `session-${Date.now()}`

          // Sauvegarder les tracés terminés
          const finishedRoutes = routes.filter(r => r.finished && r.points.length >= 2)
          if (finishedRoutes.length > 0) {
            saveRoutes(
              finishedRoutes.map(r => ({ points: r.points, color: r.color })),
              sessionId,
            )
          }

          // Sauvegarder les arrêts et stations
          if (stops.length > 0) {
            saveStops(
              stops.map(s => ({ pos: s.position, type: s.type, label: s.label })),
              sessionId,
            )
          }

          navigate('/page4')
        }} title="Page suivante">
          <span>Suivant</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      {/* ── Satellite 3D Modal ── */}
      {pendingStop && (
        <SatelliteModal
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
