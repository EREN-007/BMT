import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  LayersControl,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
            <span className="adm-legend-name">Lignes ({CORRIDORS.length})</span>
          </label>
          <label className="adm-legend-item">
            <input type="checkbox" checked={showStops}    onChange={e => setShowStops(e.target.checked)} />
            <span className="adm-legend-name">Arrêts ({BUS_STOPS.length})</span>
          </label>
          <label className="adm-legend-item">
            <input type="checkbox" checked={showStations} onChange={e => setShowStations(e.target.checked)} />
            <span className="adm-legend-name">Stations ({STATIONS.length})</span>
          </label>

          <div className="adm-legend-sep" />
          <p className="adm-legend-title">Données</p>
          <div className="adm-stats-mini">
            <div className="adm-stat-mini"><span>{CORRIDORS.reduce((a,c) => a + c.count, 0)}</span>tracés citoyens</div>
            <div className="adm-stat-mini"><span>{BUS_STOPS.reduce((a,s) => a + s.count, 0)}</span>votes arrêts</div>
            <div className="adm-stat-mini"><span>{STATIONS.reduce((a,s) => a + s.count, 0)}</span>votes stations</div>
          </div>
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
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                maxZoom={20}
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

          {/* Corridors / lignes */}
          {showRoutes && CORRIDORS.map(c => (
            <Polyline
              key={c.id}
              positions={c.points}
              pathOptions={{
                color:   densityColor(c.count, MAX_ROUTE),
                weight:  densityWeight(c.count, MAX_ROUTE),
                opacity: 0.85,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <strong>{c.label}</strong><br />
                  <span style={{ color: '#666', fontSize: '0.82rem' }}>{c.count} citoyens ont tracé ce corridor</span><br /><br />
                  <DensityBadge count={c.count} max={MAX_ROUTE} />
                </div>
              </Popup>
            </Polyline>
          ))}

          {/* Arrêts de bus */}
          {showStops && BUS_STOPS.map(s => (
            <CircleMarker
              key={s.id}
              center={s.pos}
              radius={densityRadius(s.count, MAX_STOP)}
              pathOptions={{
                color:       densityColor(s.count, MAX_STOP),
                fillColor:   densityColor(s.count, MAX_STOP),
                fillOpacity: 0.75,
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <strong>🚏 {s.label}</strong><br />
                  <span style={{ color: '#666', fontSize: '0.82rem' }}>{s.count} citoyens ont placé cet arrêt</span><br /><br />
                  <DensityBadge count={s.count} max={MAX_STOP} />
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* Stations */}
          {showStations && STATIONS.map(s => (
            <CircleMarker
              key={s.id}
              center={s.pos}
              radius={densityRadius(s.count, MAX_STA) + 3}
              pathOptions={{
                color:       densityColor(s.count, MAX_STA),
                fillColor:   densityColor(s.count, MAX_STA),
                fillOpacity: 0.75,
                weight:      3,
                dashArray:   '4 3',
              }}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <strong>🏢 {s.label}</strong><br />
                  <span style={{ color: '#666', fontSize: '0.82rem' }}>{s.count} citoyens ont proposé cette station</span><br /><br />
                  <DensityBadge count={s.count} max={MAX_STA} />
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
