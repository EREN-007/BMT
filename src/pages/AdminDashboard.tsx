import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Demo data ─────────────────────────────────────────────────────────────────

const STATS = [
  { label: 'Soumissions',      labelEn: 'Submissions',    value: 142, icon: 'inbox',   color: '#3498db' },
  { label: 'Lignes proposées', labelEn: 'Proposed routes', value: 38,  icon: 'route',   color: '#2ecc71' },
  { label: 'Arrêts de bus',   labelEn: 'Bus stops',       value: 217, icon: 'busstop', color: '#FFD700' },
  { label: 'Stations / Gares',labelEn: 'Stations',        value: 12,  icon: 'station', color: '#e74c3c' },
]


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

      </main>
    </div>
  )
}

export default AdminDashboard
