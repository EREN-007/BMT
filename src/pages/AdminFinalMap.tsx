import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapContainer, TileLayer, Polyline, Popup, Marker,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete (L.Icon.Default.prototype as any)._getIconUrl

// ─── Types ────────────────────────────────────────────────────────────────────

type RouteType = 'Principal' | 'Secondaire' | 'Express'
type StopType  = 'terminus' | 'transfer' | 'station' | 'regular'

interface FinalRoute {
  id: string; number: string
  labelFR: string; labelEN: string
  color: string; type: RouteType
  frequency: string; ridership: number
  points: [number,number][]
  midpoint: [number,number]
  stops: string[]
}

interface FinalStop {
  id: string; label: string; labelEN: string
  type: StopType
  pos: [number,number]
  accessible: boolean
  routes: string[]
}

// ─── Données finales (fallback) ───────────────────────────────────────────────

const DEFAULT_ROUTES: FinalRoute[] = [
  {
    id: 'r1', number: '10',
    labelFR: 'Ligne 10 — Centre-ville ↔ Champlain',
    labelEN: 'Route 10 — Downtown ↔ Champlain',
    color: '#C8102E', type: 'Principal',
    frequency: '15 min', ridership: 892,
    points: [[46.0972,-64.7901],[46.0931,-64.7830],[46.0878,-64.7782],[46.0840,-64.7740],[46.0821,-64.7720]],
    midpoint: [46.0855, -64.7755],
    stops: ['Terminus Centre-ville','Highfield Square','Main & Highfield','Trinity Dr','Champlain Place'],
  },
  {
    id: 'r2', number: '20',
    labelFR: 'Ligne 20 — Wheeler / Université',
    labelEN: 'Route 20 — Wheeler / University',
    color: '#0057A8', type: 'Principal',
    frequency: '20 min', ridership: 716,
    points: [[46.1020,-64.7600],[46.0980,-64.7680],[46.0930,-64.7750],[46.0878,-64.7782],[46.0830,-64.7820]],
    midpoint: [46.0950, -64.7718],
    stops: ['Université de Moncton','Highfield Square','Wheeler & Mountain','Centre-ville'],
  },
  {
    id: 'r3', number: '30',
    labelFR: 'Ligne 30 — Corridor Acadie (Dieppe)',
    labelEN: 'Route 30 — Acadia Corridor (Dieppe)',
    color: '#00843D', type: 'Secondaire',
    frequency: '30 min', ridership: 504,
    points: [[46.0988,-64.7350],[46.0960,-64.7440],[46.0935,-64.7530],[46.0910,-64.7640],[46.0878,-64.7782]],
    midpoint: [46.0940, -64.7545],
    stops: ['Dieppe — Rue Acadie','Centre Commercial','Rue Champlain','Dieppe Est','Centre-ville'],
  },
  {
    id: 'r4', number: '40',
    labelFR: 'Ligne 40 — Pont Riverview',
    labelEN: 'Route 40 — Riverview Bridge',
    color: '#F4A300', type: 'Secondaire',
    frequency: '30 min', ridership: 378,
    points: [[46.0878,-64.7782],[46.0820,-64.7800],[46.0760,-64.7830],[46.0700,-64.7900],[46.0630,-64.7970]],
    midpoint: [46.0752, -64.7862],
    stops: ['Centre-ville','Moncton Ouest','Pont TCO','Riverview Nord','Riverview Civic Centre'],
  },
]

const FINAL_STOPS: FinalStop[] = [
  { id:'fs1', label:'Centre-ville / Downtown Hub',        labelEN:'Downtown Hub',             type:'terminus',  pos:[46.0878,-64.7782], accessible:true,  routes:['10','20','30','40'] },
  { id:'fs2', label:'Champlain Place',                    labelEN:'Champlain Place',           type:'terminus',  pos:[46.0821,-64.7720], accessible:true,  routes:['10'] },
  { id:'fs3', label:'Université de Moncton',              labelEN:'Université de Moncton',     type:'regular',   pos:[46.1020,-64.7600], accessible:true,  routes:['20'] },
  { id:'fs4', label:'Gare Centrale / Central Station',    labelEN:'Central Station',           type:'station',   pos:[46.0920,-64.7750], accessible:true,  routes:['10','20'] },
  { id:'fs5', label:'Station Dieppe — Pôle Acadie',       labelEN:'Dieppe Station',            type:'station',   pos:[46.0975,-64.7400], accessible:true,  routes:['30'] },
  { id:'fs6', label:'Riverview Civic Centre',             labelEN:'Riverview Civic Centre',    type:'terminus',  pos:[46.0630,-64.7970], accessible:true,  routes:['40'] },
  { id:'fs7', label:'Highfield Square',                   labelEN:'Highfield Square',          type:'transfer',  pos:[46.0931,-64.7830], accessible:true,  routes:['10','20'] },
  { id:'fs8', label:'Hôpital Moncton / Hospital',         labelEN:'Moncton Hospital',          type:'regular',   pos:[46.0960,-64.7740], accessible:true,  routes:['20'] },
  { id:'fs9', label:'Dieppe Centre Commercial',           labelEN:'Dieppe Shopping Centre',    type:'regular',   pos:[46.0960,-64.7440], accessible:true,  routes:['30'] },
  { id:'fs10',label:'Riverview Plaza',                    labelEN:'Riverview Plaza',           type:'regular',   pos:[46.0562,-64.8022], accessible:false, routes:['40'] },
  { id:'fs11',label:'Wheeler Blvd & Mountain Rd',         labelEN:'Wheeler & Mountain',        type:'regular',   pos:[46.0980,-64.7700], accessible:true,  routes:['20'] },
  { id:'fs12',label:'Station Riverview',                  labelEN:'Riverview Station',         type:'station',   pos:[46.0630,-64.7970], accessible:true,  routes:['40'] },
]

// Rivière Petitcodiac (limite naturelle Moncton/Riverview)
const PETITCODIAC: [number,number][] = [
  [46.1000,-64.8150],[46.0820,-64.7890],[46.0760,-64.7840],
  [46.0680,-64.7920],[46.0560,-64.8080],
]
// Limite municipale Moncton / Dieppe (approximée)
const MONCTON_DIEPPE: [number,number][] = [
  [46.1120,-64.7490],[46.0900,-64.7490],[46.0780,-64.7490],
]

const NB_STANDARDS = [
  { id:'s1', ok:true, label:'Bilinguisme FR / EN',            desc:'Loi sur les langues officielles du N.-B.'    },
  { id:'s2', ok:true, label:'Accessibilité ♿',               desc:'Loi sur l\'accessibilité du N.-B. (2023)'    },
  { id:'s3', ok:true, label:'Numérotation Codiac Transpo',    desc:'Séries 10–40 — nouvelles lignes'             },
  { id:'s4', ok:true, label:'Légende bilingue complète',      desc:'Arrêts · Stations · Correspondances'         },
  { id:'s5', ok:true, label:'Flèche Nord + barre d\'échelle', desc:'Normes cartographiques canadiennes'          },
  { id:'s6', ok:true, label:'Bloc titre institutionnel',      desc:'Ville de Moncton / City of Moncton'          },
  { id:'s7', ok:true, label:'Format GTFS exportable',         desc:'Standard open data Transport Canada'         },
  { id:'s8', ok:true, label:'Délimitations inter-municipales',desc:'Moncton · Dieppe · Riverview'                },
]

const MONCTON_CENTER: [number,number] = [46.075, -64.760]

// ─── Icônes Leaflet ───────────────────────────────────────────────────────────

function routeBadge(number: string, color: string) {
  return L.divIcon({
    html: `<div style="background:${color};color:white;font-weight:900;font-size:12px;
      width:26px;height:26px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;border:2.5px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.45);font-family:sans-serif;">${number}</div>`,
    className:'', iconSize:[26,26], iconAnchor:[13,13],
  })
}

function stopIcon(type: StopType, color: string) {
  const sz = type === 'station' ? 16 : type === 'terminus' ? 14 : type === 'transfer' ? 13 : 10
  const shape = type === 'station'
    ? 'border-radius:3px;transform:rotate(45deg);'
    : 'border-radius:50%;'
  return L.divIcon({
    html: `<div style="width:${sz}px;height:${sz}px;background:white;
      border:2.5px solid ${color};${shape}
      box-shadow:0 1px 5px rgba(0,0,0,0.35);"></div>`,
    className:'', iconSize:[sz,sz], iconAnchor:[sz/2,sz/2],
  })
}

// ─── Overlays cartographiques ─────────────────────────────────────────────────

function TitleBlock() {
  return (
    <div className="fm-title-block">
      <div className="fm-title-bar" />
      <div className="fm-title-body">
        <div className="fm-title-main">GRAND MONCTON TRANSIT</div>
        <div className="fm-title-sub">RÉSEAU DE TRANSPORT EN COMMUN</div>
        <div className="fm-title-cities">Moncton · Dieppe · Riverview, N.-B.</div>
      </div>
      <div className="fm-title-foot">
        <span>Rév. 1.0</span>
        <span>Avr. 2026</span>
        <span>BMT / CME</span>
      </div>
    </div>
  )
}

function NorthArrow() {
  return (
    <div className="fm-north-arrow">
      <svg viewBox="0 0 20 28" width="22" height="30">
        <polygon points="10,2 15,18 10,14 5,18" fill="#1a1a2e" />
        <polygon points="10,28 15,18 10,14 5,18" fill="#aaa" />
        <circle cx="10" cy="14" r="2.5" fill="white" stroke="#1a1a2e" strokeWidth="1.2" />
      </svg>
      <span className="fm-north-label">N</span>
    </div>
  )
}

function ScaleBar() {
  return (
    <div className="fm-scale-bar">
      <div className="fm-scale-track">
        <div style={{ background:'#1a1a2e',flex:1,height:'100%' }} />
        <div style={{ background:'white',flex:1,height:'100%',borderRight:'1px solid #1a1a2e',borderLeft:'1px solid #1a1a2e' }} />
        <div style={{ background:'#1a1a2e',flex:1,height:'100%' }} />
        <div style={{ background:'white',flex:1,height:'100%' }} />
      </div>
      <div className="fm-scale-labels">
        <span>0</span><span>500m</span><span>1 km</span><span>2 km</span>
      </div>
    </div>
  )
}

function MapLegend({ routes }: { routes: FinalRoute[] }) {
  return (
    <div className="fm-map-legend">
      <div className="fm-map-legend-title">LÉGENDE / LEGEND</div>
      {routes.map(r => (
        <div key={r.id} className="fm-map-legend-row">
          <div className="fm-map-legend-line" style={{ background: r.color }} />
          <span>{r.number} — {r.labelFR.split('—')[1]?.trim()}</span>
        </div>
      ))}
      <div className="fm-map-legend-sep" />
      <div className="fm-map-legend-row"><div className="fm-sym fm-sym-terminus" />Terminus</div>
      <div className="fm-map-legend-row"><div className="fm-sym fm-sym-transfer" />Correspondance</div>
      <div className="fm-map-legend-row"><div className="fm-sym fm-sym-station"  />Station</div>
      <div className="fm-map-legend-row"><div className="fm-sym fm-sym-regular"  />Arrêt  ♿</div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function AdminFinalMap() {
  const navigate = useNavigate()
  const [submitted, setSubmitted]       = useState(false)
  const [showBoundaries, setShowBound]  = useState(true)

  // Chargement depuis localStorage (sauvegardé par AdminSimulator)
  const [routes] = useState<FinalRoute[]>(() => {
    try {
      const raw = localStorage.getItem('bmt_final_state')
      if (!raw) return DEFAULT_ROUTES
      const { activeRoutes } = JSON.parse(raw) as { activeRoutes: string[] }
      const filtered = DEFAULT_ROUTES.filter(r => activeRoutes.includes(r.id))
      return filtered.length > 0 ? filtered : DEFAULT_ROUTES
    } catch { return DEFAULT_ROUTES }
  })

  const totalRidership = routes.reduce((a, r) => a + r.ridership, 0)

  const stopPrimaryColor = (s: FinalStop) =>
    routes.find(r => s.routes.includes(r.number))?.color ?? '#1255a0'

  return (
    <div className="db-root">

      {/* ── Sidebar icônes ── */}
      <aside className="db-sidebar" style={{ minWidth:60, width:60, padding:'12px 6px' }}>
        <div className="db-sidebar-brand" style={{ fontSize:'0.55rem', padding:'0 2px 8px' }}>BMT</div>
        <nav className="db-nav">
          <a className="db-nav-item" style={{ cursor:'pointer',padding:'8px 6px',gap:0,flexDirection:'column' }} onClick={() => navigate('/dashboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}>
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </a>
          <a className="db-nav-item" style={{ cursor:'pointer',padding:'8px 6px',gap:0,flexDirection:'column' }} onClick={() => navigate('/carte')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}>
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
            </svg>
          </a>
          <a className="db-nav-item" style={{ cursor:'pointer',padding:'8px 6px',gap:0,flexDirection:'column' }} onClick={() => navigate('/simulateur')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </a>
          <a className="db-nav-item db-nav-active" style={{ padding:'8px 6px',gap:0,flexDirection:'column' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </a>
        </nav>
        <button className="db-logout" style={{ padding:'8px 6px',marginTop:'auto',gap:0 }} onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:16,height:16}}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </aside>

      {/* ── Carte ── */}
      <div className="mp-map-wrap" style={{ position:'relative' }}>
        <MapContainer center={MONCTON_CENTER} zoom={13} className="mp-leaflet" zoomControl={false}>
          {/* CartoDB Positron — fond professionnel épuré */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://carto.com">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            maxZoom={20}
          />

          {/* Limites municipales */}
          {showBoundaries && <>
            <Polyline positions={PETITCODIAC}
              pathOptions={{ color:'#5b9bd5', weight:4, opacity:0.55 }} />
            <Polyline positions={MONCTON_DIEPPE}
              pathOptions={{ color:'#888', weight:1.5, dashArray:'6 4', opacity:0.5 }} />
          </>}

          {/* Lignes — double trait (contour blanc + couleur) */}
          {routes.map(r => (
            <React.Fragment key={r.id}>
              <Polyline positions={r.points}
                pathOptions={{ color:'white', weight:12, opacity:0.9, lineCap:'round', lineJoin:'round' }} />
              <Polyline positions={r.points}
                pathOptions={{ color:r.color, weight:7, opacity:1, lineCap:'round', lineJoin:'round' }}>
                <Popup>
                  <div style={{ minWidth:220 }}>
                    <strong style={{ color:r.color, fontSize:'1rem' }}>Ligne {r.number}</strong><br/>
                    <span style={{ fontWeight:600 }}>{r.labelFR}</span><br/>
                    <span style={{ color:'#666', fontSize:'0.8rem' }}>{r.labelEN}</span>
                    <hr style={{ margin:'7px 0', borderColor:'#eee' }} />
                    <table style={{ fontSize:'0.8rem', width:'100%', borderCollapse:'collapse' }}>
                      <tbody>
                        {[
                          ['Type',         r.type],
                          ['Fréquence',    r.frequency],
                          ['Achalandage',  `${r.ridership.toLocaleString()} pass./j`],
                          ['Arrêts',       r.stops.length.toString()],
                        ].map(([k,v]) => (
                          <tr key={k}>
                            <td style={{ color:'#888', paddingRight:10, paddingBottom:3 }}>{k}</td>
                            <td><strong>{v}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ marginTop:8, fontSize:'0.78rem', color:'#555' }}>
                      <strong>Arrêts :</strong> {r.stops.join(' · ')}
                    </div>
                  </div>
                </Popup>
              </Polyline>
            </React.Fragment>
          ))}

          {/* Badges numéro de ligne */}
          {routes.map(r => (
            <Marker key={`b-${r.id}`} position={r.midpoint}
              icon={routeBadge(r.number, r.color)} interactive={false} />
          ))}

          {/* Arrêts officiels */}
          {FINAL_STOPS.map(s => {
            const col = stopPrimaryColor(s)
            return (
              <Marker key={s.id} position={s.pos} icon={stopIcon(s.type, col)}>
                <Popup>
                  <div style={{ minWidth:200 }}>
                    <strong>{s.label}</strong>
                    {s.type !== 'regular' && (
                      <span style={{
                        display:'inline-block', marginLeft:8, fontSize:'0.7rem',
                        padding:'1px 7px', borderRadius:8, fontWeight:700,
                        background: s.type==='station' ? '#e6b80018' : s.type==='terminus' ? '#C8102E18' : '#0057A818',
                        color:       s.type==='station' ? '#e6b800'  : s.type==='terminus' ? '#C8102E'   : '#0057A8',
                      }}>
                        {s.type==='station' ? 'Station' : s.type==='terminus' ? 'Terminus' : 'Correspondance'}
                      </span>
                    )}
                    <br/><span style={{ color:'#888', fontSize:'0.78rem' }}>{s.labelEN}</span><br/>
                    <span style={{ fontSize:'0.8rem', display:'block', marginTop:5 }}>
                      Lignes {s.routes.join(', ')}{s.accessible ? '  ♿' : '  —'}
                    </span>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>

        {/* Overlays */}
        <TitleBlock />
        <NorthArrow />
        <ScaleBar />
        <MapLegend routes={routes} />
      </div>

      {/* ── Panneau droit ── */}
      <aside className="sim-panel" style={{ width:310, minWidth:310 }}>

        <div className="sim-panel-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2" style={{width:18,height:18,flexShrink:0}}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
          </svg>
          <div>
            <h2 className="sim-title">Carte Finale</h2>
            <p className="sim-subtitle">Conforme N.-B. — Prête à adopter</p>
          </div>
        </div>

        <div className="sim-tab-content">

          {/* KPIs */}
          <div className="fm-kpi-row">
            <div className="fm-kpi"><span>{routes.length}</span>lignes</div>
            <div className="fm-kpi"><span>{FINAL_STOPS.length}</span>arrêts</div>
            <div className="fm-kpi"><span>{(totalRidership/1000).toFixed(1)}k</span>pass./j</div>
          </div>

          {/* Lignes officielles */}
          <p className="sim-section-title" style={{ marginTop:14 }}>Lignes officielles</p>
          <div className="fm-route-list">
            {routes.map(r => (
              <div key={r.id} className="fm-route-card">
                <div className="fm-route-badge" style={{ background:r.color }}>{r.number}</div>
                <div className="fm-route-info">
                  <div className="fm-route-label">{r.labelFR.split('—')[1]?.trim()}</div>
                  <div className="fm-route-meta">
                    <span>{r.type}</span>
                    <span>{r.frequency}</span>
                    <span>{r.ridership.toLocaleString()} pass./j</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Conformité N.-B. */}
          <p className="sim-section-title" style={{ marginTop:14 }}>Conformité N.-B.</p>
          <div className="fm-standards-list">
            {NB_STANDARDS.map(s => (
              <div key={s.id} className="fm-standard-row">
                <span className="fm-std-check">✓</span>
                <div className="fm-std-text">
                  <span className="fm-std-label">{s.label}</span>
                  <span className="fm-std-desc">{s.desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Options */}
          <label className="sim-toggle-row" style={{ marginTop:12 }}>
            <span style={{ fontSize:'0.78rem' }}>Limites municipales</span>
            <button className={`sim-toggle ${showBoundaries ? 'sim-toggle-on' : ''}`}
              onClick={() => setShowBound(v => !v)}>
              {showBoundaries ? 'ON' : 'OFF'}
            </button>
          </label>

          {/* Bloc révision */}
          <div className="fm-revision-block">
            {[
              ['Document',  'BMT-CARTE-001'],
              ['Révision',  '1.0'],
              ['Date',      'Avr. 2026'],
              ['Autorité',  'Codiac Transpo'],
              ['Statut',    'Approuvé — BMT/CME'],
            ].map(([k,v]) => (
              <div key={k} className="fm-revision-row">
                <span>{k}</span><strong>{v}</strong>
              </div>
            ))}
          </div>

        </div>

        {/* Boutons bas */}
        <div className="sim-actions">
          <button className="sim-btn sim-btn-add" onClick={() => window.print()}>
            🖨 Imprimer / PDF
          </button>
          <button
            className="sim-btn"
            style={{
              background: submitted ? 'rgba(46,204,113,0.15)' : 'rgba(255,215,0,0.1)',
              border:    `1px solid ${submitted ? 'rgba(46,204,113,0.5)' : 'rgba(255,215,0,0.35)'}`,
              color:      submitted ? '#2ecc71' : '#FFD700',
              fontWeight: 700,
            }}
            onClick={() => setSubmitted(true)}
          >
            {submitted ? '✓ Soumis à la Ville' : '⬆ Soumettre à la Ville'}
          </button>
        </div>

      </aside>
    </div>
  )
}

export default AdminFinalMap
