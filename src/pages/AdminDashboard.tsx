import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Demo data ─────────────────────────────────────────────────────────────────

const STATS = [
  { label: 'Soumissions',      labelEn: 'Submissions',    value: 142, icon: 'inbox',   color: '#3498db' },
  { label: 'Lignes proposées', labelEn: 'Proposed routes', value: 38,  icon: 'route',   color: '#2ecc71' },
  { label: 'Arrêts de bus',   labelEn: 'Bus stops',       value: 217, icon: 'busstop', color: '#FFD700' },
  { label: 'Stations / Gares',labelEn: 'Stations',        value: 12,  icon: 'station', color: '#e74c3c' },
]

const SUBMISSIONS = [
  { id: 1, nom: 'Tremblay',  prenom: 'Marie',   ville: 'Moncton',   email: 'marie.tremblay@gmail.com',    statut: 'nouveau',    date: '2024-12-01' },
  { id: 2, nom: 'LeBlanc',   prenom: 'Pierre',  ville: 'Dieppe',    email: 'p.leblanc@outlook.com',       statut: 'en_etude',   date: '2024-11-30' },
  { id: 3, nom: 'Boudreau',  prenom: 'Sophie',  ville: 'Riverview', email: 'sophie.b@hotmail.com',        statut: 'approuve',   date: '2024-11-29' },
  { id: 4, nom: 'Richard',   prenom: 'Marc',    ville: 'Moncton',   email: 'marc.richard@yahoo.ca',       statut: 'nouveau',    date: '2024-11-28' },
  { id: 5, nom: 'Gallant',   prenom: 'Julie',   ville: 'Dieppe',    email: 'julie.gallant@gmail.com',     statut: 'rejete',     date: '2024-11-27' },
  { id: 6, nom: 'Goguen',    prenom: 'Éric',    ville: 'Moncton',   email: 'eric.goguen@nb.ca',           statut: 'en_etude',   date: '2024-11-26' },
  { id: 7, nom: 'Cormier',   prenom: 'Isabelle',ville: 'Riverview', email: 'i.cormier@rogers.com',        statut: 'approuve',   date: '2024-11-25' },
]

const STATUT_MAP: Record<string, { label: string; labelEn: string; color: string }> = {
  nouveau:    { label: 'Nouveau',    labelEn: 'New',        color: '#3498db' },
  en_etude:   { label: 'En étude',   labelEn: 'In review',  color: '#f39c12' },
  approuve:   { label: 'Approuvé',   labelEn: 'Approved',   color: '#2ecc71' },
  rejete:     { label: 'Rejeté',     labelEn: 'Rejected',   color: '#e74c3c' },
}

// ─── Stat icon SVGs ────────────────────────────────────────────────────────────

function StatIcon({ type }: { type: string }) {
  switch (type) {
    case 'inbox':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
    case 'route':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 17l6-6 4 4 8-8"/><circle cx="3" cy="17" r="2"/><circle cx="21" cy="7" r="2"/></svg>
    case 'busstop':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="12" rx="2"/><path d="M7 15v2"/><path d="M17 15v2"/><path d="M3 9h18"/><circle cx="7.5" cy="19" r="2"/><circle cx="16.5" cy="19" r="2"/></svg>
    case 'station':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4a2 2 0 0 1 4 0v4"/></svg>
    default: return null
  }
}

// ─── Components ────────────────────────────────────────────────────────────────

function StatCard({ stat }: { stat: typeof STATS[0] }) {
  return (
    <div className="db-stat-card">
      <div className="db-stat-icon" style={{ background: `${stat.color}18`, color: stat.color }}>
        <StatIcon type={stat.icon} />
      </div>
      <div className="db-stat-body">
        <span className="db-stat-value">{stat.value.toLocaleString()}</span>
        <span className="db-stat-label">{stat.label}</span>
        <span className="db-stat-label-en">{stat.labelEn}</span>
      </div>
    </div>
  )
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────────

interface Props {
  onLogout: () => void
}

function AdminDashboard({ onLogout }: Props) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<string>('tous')

  const filtered = filter === 'tous'
    ? SUBMISSIONS
    : SUBMISSIONS.filter(s => s.statut === filter)

  const handleLogout = () => {
    onLogout()
    navigate('/')
  }

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
          <a className="db-nav-item db-nav-active" href="#">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Dashboard
          </a>
          <a className="db-nav-item" href="#">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
            </svg>
            Soumissions
          </a>
          <a className="db-nav-item" href="#">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
              <line x1="8" y1="2" x2="8" y2="18"/>
              <line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
            Carte
          </a>
          <a className="db-nav-item" href="#">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Utilisateurs
          </a>
        </nav>

        <button className="db-logout" onClick={handleLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Déconnexion
        </button>
      </aside>

      {/* ── Main content ── */}
      <main className="db-main">

        {/* Top bar */}
        <header className="db-topbar">
          <div>
            <h1 className="db-page-title">Tableau de bord</h1>
            <p className="db-page-sub">Dashboard — Build Moncton Together</p>
          </div>
          <div className="db-topbar-right">
            <span className="db-date">{new Date().toLocaleDateString('fr-CA', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</span>
            <div className="db-avatar">A</div>
          </div>
        </header>

        {/* Stats */}
        <section className="db-stats-grid">
          {STATS.map(s => <StatCard key={s.icon} stat={s} />)}
        </section>

        {/* Recent activity + submissions */}
        <section className="db-content-grid">

          {/* Submissions table */}
          <div className="db-panel db-panel-wide">
            <div className="db-panel-header">
              <h2 className="db-panel-title">
                Soumissions récentes
                <span>/ Recent submissions</span>
              </h2>
              <div className="db-filters">
                {['tous', 'nouveau', 'en_etude', 'approuve', 'rejete'].map(f => (
                  <button
                    key={f}
                    className={`db-filter-btn ${filter === f ? 'db-filter-active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'tous' ? 'Tous' : STATUT_MAP[f].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="db-table-wrap">
              <table className="db-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nom / Name</th>
                    <th>Ville / City</th>
                    <th>Courriel / Email</th>
                    <th>Statut / Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} className="db-table-row">
                      <td className="db-td-id">{s.id}</td>
                      <td className="db-td-name">{s.prenom} {s.nom}</td>
                      <td className="db-td-muted">{s.ville}</td>
                      <td className="db-td-muted">{s.email}</td>
                      <td>
                        <span
                          className="db-badge"
                          style={{
                            background: `${STATUT_MAP[s.statut].color}18`,
                            color: STATUT_MAP[s.statut].color,
                            borderColor: `${STATUT_MAP[s.statut].color}40`,
                          }}
                        >
                          {STATUT_MAP[s.statut].label}
                        </span>
                      </td>
                      <td className="db-td-muted">{s.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary panel */}
          <div className="db-panel">
            <div className="db-panel-header">
              <h2 className="db-panel-title">Répartition<span>/ Breakdown</span></h2>
            </div>
            <div className="db-breakdown">
              {Object.entries(STATUT_MAP).map(([key, val]) => {
                const count = SUBMISSIONS.filter(s => s.statut === key).length
                const pct   = Math.round((count / SUBMISSIONS.length) * 100)
                return (
                  <div key={key} className="db-breakdown-item">
                    <div className="db-breakdown-top">
                      <span className="db-breakdown-label">{val.label}</span>
                      <span className="db-breakdown-count" style={{ color: val.color }}>{count}</span>
                    </div>
                    <div className="db-breakdown-bar-bg">
                      <div
                        className="db-breakdown-bar"
                        style={{ width: `${pct}%`, background: val.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="db-panel-divider" />

            <div className="db-panel-header">
              <h2 className="db-panel-title">Par ville<span>/ By city</span></h2>
            </div>
            <div className="db-breakdown">
              {['Moncton', 'Dieppe', 'Riverview'].map(ville => {
                const count = SUBMISSIONS.filter(s => s.ville === ville).length
                const pct   = Math.round((count / SUBMISSIONS.length) * 100)
                return (
                  <div key={ville} className="db-breakdown-item">
                    <div className="db-breakdown-top">
                      <span className="db-breakdown-label">{ville}</span>
                      <span className="db-breakdown-count">{count}</span>
                    </div>
                    <div className="db-breakdown-bar-bg">
                      <div className="db-breakdown-bar" style={{ width: `${pct}%`, background: '#1255a0' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </section>
      </main>
    </div>
  )
}

export default AdminDashboard
