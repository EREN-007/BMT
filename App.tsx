import React from 'react'
import { Routes, Route, Link, Navigate } from 'react-router-dom'
import AdminLogo from '@/pages/AdminLogo'
import LanguageChoice from '@/pages/LanguageChoice'
import Auth from '@/pages/Auth'

function AdminApp() {
  return (
    <div className="container">
      <header className="app-header">
        <Link to="/" className="brand">
          <img src="/icon.svg" alt="BMT" />
          <span>BMT Admin</span>
        </Link>
        <nav className="nav">
          <Link to="/">Logo</Link>
          <Link to="/language">Langue</Link>
          <Link to="/auth">Connexion</Link>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<AdminLogo />} />
          <Route path="/language" element={<LanguageChoice />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="app-footer">
        <small>© {new Date().getFullYear()} BMT • Admin</small>
      </footer>
    </div>
  )
}

export default AdminApp
