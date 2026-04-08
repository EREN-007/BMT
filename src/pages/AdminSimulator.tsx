import React, { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapContainer, TileLayer, Circle, Marker, Popup, Polyline, useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete (L.Icon.Default.prototype as any)._getIconUrl

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimStop {
  id: string
  label: string
  type: 'busstop' | 'station'
  pos: [number, number]
  active: boolean
  demand: number          // nb citoyens ayant proposé cet arrêt
}

interface SimRoute {
  id: string
  label: string
  points: [number, number][]
  active: boolean
  color: string
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

const COVERAGE_RADIUS = 400   // mètres — rayon de marche ~5 min
const STATION_RADIUS  = 800   // stations = rayon plus large ~10 min
const MONCTON_CENTER: [number, number] = [46.075, -64.760]

// ─── Calcul des métriques ─────────────────────────────────────────────────────

function computeMetrics(stops: SimStop[]) {
  const active = stops.filter(s => s.active)
  const buses   = active.filter(s => s.type === 'busstop').length
  const stations = active.filter(s => s.type === 'station').length
  const totalDemand  = stops.reduce((a, s) => a + s.demand, 0)
  const coveredDemand = active.reduce((a, s) => a + s.demand, 0)
  const coveragePct  = Math.round((coveredDemand / totalDemand) * 100)

  // Estimation zones mortes (arrêts inactifs à forte demande)
  const deadZones = stops.filter(s => !s.active && s.demand >= 10).length

  // Score d'efficacité : répartition géographique
  const spread = active.length >= 6 ? 'Optimale' : active.length >= 3 ? 'Moyenne' : 'Faible'

  return { buses, stations, coveragePct, deadZones, spread, active: active.length }
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

// ─── Composant carte : gestion drag ──────────────────────────────────────────

interface DraggableStopProps {
  stop: SimStop
  onDragEnd: (id: string, pos: [number, number]) => void
  onToggle: (id: string) => void
  showCoverage: boolean
  impact: 'gain' | 'loss' | null
}

function DraggableStop({ stop, onDragEnd, onToggle, showCoverage, impact }: DraggableStopProps) {
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
          pathOptions={{
            color: coverageColor,
            fillColor: coverageColor,
            fillOpacity: 0.12,
            weight: 1.5,
            opacity: 0.5,
          }}
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

// ─── Ajout d'arrêt temporaire par clic ───────────────────────────────────────

function AddStopOnClick({ adding, onAdd }: { adding: boolean; onAdd: (pos: [number,number]) => void }) {
  useMapEvents({
    click(e) {
      if (adding) onAdd([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function AdminSimulator() {
  const navigate = useNavigate()
  const [stops,         setStops]         = useState<SimStop[]>(INIT_STOPS)
  const [routes,        setRoutes]         = useState<SimRoute[]>(INIT_ROUTES)
  const [showCoverage,  setShowCoverage]   = useState(true)
  const [showRoutes,    setShowRoutes]     = useState(true)
  const [addingStop,    setAddingStop]     = useState(false)
  const [lastImpact,    setLastImpact]     = useState<{ id: string; type: 'gain'|'loss' } | null>(null)
  const counterRef = useRef(100)

  const metrics = computeMetrics(stops)

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

  const impactColor   = metrics.coveragePct >= 70 ? '#2ecc71' : metrics.coveragePct >= 45 ? '#f39c12' : '#e74c3c'
  const impactLabel   = metrics.coveragePct >= 70 ? 'Excellent' : metrics.coveragePct >= 45 ? 'Acceptable' : 'Insuffisant'

  return (
    <div className="db-root">

      {/* ── Sidebar nav ── */}
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
        <MapContainer center={MONCTON_CENTER} zoom={13} className="mp-leaflet" style={{ cursor: addingStop ? 'crosshair' : undefined }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={20}
          />

          {/* Lignes */}
          {showRoutes && routes.filter(r => r.active).map(r => (
            <Polyline key={r.id} positions={r.points} pathOptions={{ color: r.color, weight: 5, opacity: 0.75, lineCap: 'round' }} />
          ))}

          {/* Arrêts draggables */}
          {stops.map(s => (
            <DraggableStop
              key={s.id}
              stop={s}
              onDragEnd={handleDragEnd}
              onToggle={handleToggle}
              showCoverage={showCoverage}
              impact={lastImpact?.id === s.id ? lastImpact.type : null}
            />
          ))}

          <AddStopOnClick adding={addingStop} onAdd={handleAddStop} />
        </MapContainer>

        {/* Hint ajout */}
        {addingStop && (
          <div className="mp-hint mp-hint-drawing">
            Cliquez sur la carte pour placer un nouvel arrêt
          </div>
        )}
      </div>

      {/* ── Panneau simulation ── */}
      <aside className="sim-panel">

        {/* Titre */}
        <div className="sim-panel-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2" style={{width:18,height:18,flexShrink:0}}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <div>
            <h2 className="sim-title">Simulateur</h2>
            <p className="sim-subtitle">Impact en temps réel</p>
          </div>
        </div>

        {/* Score de couverture */}
        <div className="sim-score-card">
          <div className="sim-score-ring" style={{ '--score-color': impactColor, '--score-pct': metrics.coveragePct } as React.CSSProperties}>
            <span className="sim-score-value">{metrics.coveragePct}%</span>
            <span className="sim-score-unit">couverture</span>
          </div>
          <div className="sim-score-info">
            <span className="sim-score-label" style={{ color: impactColor }}>{impactLabel}</span>
            <div className="sim-score-details">
              <span>🚏 {metrics.buses} arrêts actifs</span>
              <span>🏢 {metrics.stations} stations actives</span>
              <span>⚠️ {metrics.deadZones} zone{metrics.deadZones !== 1 ? 's' : ''} morte{metrics.deadZones !== 1 ? 's' : ''}</span>
              <span>📊 Répartition : {metrics.spread}</span>
            </div>
          </div>
        </div>

        {/* Dernière action */}
        {lastImpact && (
          <div className={`sim-impact-alert ${lastImpact.type === 'gain' ? 'sim-gain' : 'sim-loss'}`}>
            {lastImpact.type === 'gain'
              ? '▲ Impact positif — couverture améliorée'
              : '▼ Impact négatif — zone découverte'}
          </div>
        )}

        {/* Contrôles */}
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
        </div>

        {/* Lignes */}
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

        {/* Arrêts */}
        <div className="sim-section sim-section-scroll">
          <p className="sim-section-title">Arrêts & Stations ({metrics.active}/{stops.length} actifs)</p>
          {stops.map(s => (
            <div key={s.id} className={`sim-item-row ${!s.active ? 'sim-item-inactive' : ''}`}>
              <span className="sim-item-dot" style={{ background: s.active ? (s.type==='station' ? '#e6b800' : '#1255a0') : '#444', borderRadius: s.type==='station' ? 3 : '50%' }} />
              <span className="sim-item-label">{s.label}</span>
              <button className={`sim-toggle sim-toggle-sm ${s.active ? 'sim-toggle-on' : ''}`} onClick={() => handleToggle(s.id)}>
                {s.active ? 'ON' : 'OFF'}
              </button>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="sim-actions">
          <button className={`sim-btn sim-btn-add ${addingStop ? 'sim-btn-active' : ''}`} onClick={() => setAddingStop(v => !v)}>
            {addingStop ? '✕ Annuler' : '+ Ajouter arrêt'}
          </button>
          <button className="sim-btn sim-btn-reset" onClick={handleReset}>
            ↺ Réinitialiser
          </button>
        </div>
      </aside>
    </div>
  )
}

export default AdminSimulator
