import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  LayersControl,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// ─── Demo data — routes citoyennes proposées ───────────────────────────────────

const DEMO_ROUTES = [
  {
    id: 'r1', user: 'Marie Tremblay', ville: 'Moncton', color: '#e74c3c',
    points: [
      [46.0972, -64.7901], [46.0931, -64.7830], [46.0878, -64.7782],
      [46.0821, -64.7720], [46.0763, -64.7681],
    ] as [number,number][],
  },
  {
    id: 'r2', user: 'Pierre LeBlanc', ville: 'Dieppe', color: '#3498db',
    points: [
      [46.0988, -64.7350], [46.0960, -64.7440], [46.0935, -64.7530],
      [46.0910, -64.7640], [46.0878, -64.7782],
    ] as [number,number][],
  },
  {
    id: 'r3', user: 'Sophie Boudreau', ville: 'Riverview', color: '#2ecc71',
    points: [
      [46.0562, -64.8022], [46.0620, -64.7950], [46.0690, -64.7870],
      [46.0763, -64.7780], [46.0821, -64.7720],
    ] as [number,number][],
  },
  {
    id: 'r4', user: 'Marc Richard', ville: 'Moncton', color: '#f39c12',
    points: [
      [46.0878, -64.7782], [46.0850, -64.7900], [46.0820, -64.8020],
      [46.0790, -64.8130], [46.0760, -64.8220],
    ] as [number,number][],
  },
  {
    id: 'r5', user: 'Éric Goguen', ville: 'Moncton', color: '#9b59b6',
    points: [
      [46.1020, -64.7600], [46.0980, -64.7680], [46.0930, -64.7750],
      [46.0878, -64.7782], [46.0820, -64.7850],
    ] as [number,number][],
  },
]

const DEMO_STOPS = [
  { id: 's1', type: 'busstop',  label: 'Centre-ville Moncton',      pos: [46.0878, -64.7782] as [number,number] },
  { id: 's2', type: 'busstop',  label: 'Champlain Place',            pos: [46.0821, -64.7720] as [number,number] },
  { id: 's3', type: 'busstop',  label: 'Dieppe Centre',              pos: [46.0960, -64.7440] as [number,number] },
  { id: 's4', type: 'busstop',  label: 'Riverview Civic Centre',     pos: [46.0620, -64.7950] as [number,number] },
  { id: 's5', type: 'busstop',  label: 'Université de Moncton',      pos: [46.1020, -64.7600] as [number,number] },
  { id: 's6', type: 'busstop',  label: 'Highfield Square',           pos: [46.0931, -64.7830] as [number,number] },
  { id: 's7', type: 'station',  label: 'Gare centrale Moncton',      pos: [46.0930, -64.7750] as [number,number] },
  { id: 's8', type: 'station',  label: 'Station Dieppe — Acadie',    pos: [46.0988, -64.7350] as [number,number] },
  { id: 's9', type: 'station',  label: 'Station Riverview Sud',      pos: [46.0562, -64.8022] as [number,number] },
]

const MONCTON_CENTER: [number, number] = [46.075, -64.760]

// ─── Icons ────────────────────────────────────────────────────────────────────

const busStopIcon = L.divIcon({
  html: `<div class="mp-stop-icon mp-stop-busstop"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="2" width="18" height="14" rx="3" fill="#1255a0"/><rect x="5" y="4" width="5" height="5" rx="1" fill="white" opacity="0.9"/><rect x="14" y="4" width="5" height="5" rx="1" fill="white" opacity="0.9"/><rect x="3" y="10" width="18" height="3" fill="#FFD700"/><circle cx="7" cy="19" r="3" fill="#1a1a2e"/><circle cx="17" cy="19" r="3" fill="#1a1a2e"/><line x1="12" y1="16" x2="12" y2="22" stroke="#1255a0" stroke-width="2"/></svg></div>`,
  className: '', iconSize: [36, 44], iconAnchor: [18, 44], popupAnchor: [0, -44],
})

const stationIcon = L.divIcon({
  html: `<div class="mp-stop-icon mp-stop-station"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L4 7v13h16V7L12 2z" fill="#e6b800"/><rect x="8" y="12" width="3" height="8" fill="#0a1628"/><rect x="13" y="12" width="3" height="8" fill="#0a1628"/><rect x="6" y="7" width="4" height="4" rx="0.5" fill="white" opacity="0.9"/><rect x="14" y="7" width="4" height="4" rx="0.5" fill="white" opacity="0.9"/><rect x="10" y="7" width="4" height="4" rx="0.5" fill="white" opacity="0.9"/></svg></div>`,
  className: '', iconSize: [40, 48], iconAnchor: [20, 48], popupAnchor: [0, -48],
})

// ─── Main ─────────────────────────────────────────────────────────────────────

function AdminMapPage() {
  const navigate = useNavigate()
  const [visibleRoutes, setVisibleRoutes] = useState<Set<string>>(
    new Set(DEMO_ROUTES.map(r => r.id))
  )
  const [showStops,    setShowStops]    = useState(true)
  const [showStations, setShowStations] = useState(true)

  const toggleRoute = (id: string) =>
    setVisibleRoutes(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const busStops = DEMO_STOPS.filter(s => s.type === 'busstop')
  const stations = DEMO_STOPS.filter(s => s.type === 'station')

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
          <a className="db-nav-item" onClick={() => navigate('/dashboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Dashboard
          </a>
          <a className="db-nav-item" onClick={() => navigate('/submissions')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
            </svg>
            Soumissions
          </a>
          <a className="db-nav-item db-nav-active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
              <line x1="8" y1="2" x2="8" y2="18"/>
              <line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
            Carte mère
          </a>
          <a className="db-nav-item" onClick={() => navigate('/users')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Utilisateurs
          </a>
        </nav>

        {/* Légende / filtres */}
        <div className="adm-legend">
          <p className="adm-legend-title">Lignes proposées</p>
          {DEMO_ROUTES.map(r => (
            <label key={r.id} className="adm-legend-item">
              <input
                type="checkbox"
                checked={visibleRoutes.has(r.id)}
                onChange={() => toggleRoute(r.id)}
              />
              <span className="adm-legend-dot" style={{ background: r.color }} />
              <span className="adm-legend-name">{r.user}</span>
              <span className="adm-legend-city">{r.ville}</span>
            </label>
          ))}

          <div className="adm-legend-sep" />
          <p className="adm-legend-title">Éléments</p>

          <label className="adm-legend-item">
            <input type="checkbox" checked={showStops} onChange={e => setShowStops(e.target.checked)} />
            <span className="adm-legend-dot" style={{ background: '#1255a0' }} />
            <span className="adm-legend-name">Arrêts</span>
            <span className="adm-legend-city">{busStops.length}</span>
          </label>

          <label className="adm-legend-item">
            <input type="checkbox" checked={showStations} onChange={e => setShowStations(e.target.checked)} />
            <span className="adm-legend-dot" style={{ background: '#e6b800' }} />
            <span className="adm-legend-name">Stations</span>
            <span className="adm-legend-city">{stations.length}</span>
          </label>
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
          zoomControl={true}
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Plan (OpenStreetMap)">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                maxZoom={20}
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satellite (ESRI)">
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles © Esri"
                maxZoom={20}
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          {/* Lignes proposées */}
          {DEMO_ROUTES.filter(r => visibleRoutes.has(r.id)).map(r => (
            <Polyline
              key={r.id}
              positions={r.points}
              pathOptions={{ color: r.color, weight: 5, opacity: 0.8, lineCap: 'round', lineJoin: 'round' }}
            >
              <Popup>
                <strong style={{ color: r.color }}>Ligne proposée</strong><br/>
                Citoyen : {r.user}<br/>
                Ville : {r.ville}
              </Popup>
            </Polyline>
          ))}

          {/* Arrêts de bus */}
          {showStops && busStops.map(s => (
            <Marker key={s.id} position={s.pos} icon={busStopIcon}>
              <Popup><strong>🚏 {s.label}</strong></Popup>
            </Marker>
          ))}

          {/* Stations */}
          {showStations && stations.map(s => (
            <Marker key={s.id} position={s.pos} icon={stationIcon}>
              <Popup><strong>🏢 {s.label}</strong></Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Compteurs */}
        <div className="adm-map-counters">
          <span>{visibleRoutes.size} ligne{visibleRoutes.size !== 1 ? 's' : ''}</span>
          <span>{showStops ? busStops.length : 0} arrêt{busStops.length !== 1 ? 's' : ''}</span>
          <span>{showStations ? stations.length : 0} station{stations.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}

export default AdminMapPage
