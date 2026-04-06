import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import SplashScreen   from '@/pages/SplashScreen'
import LanguageChoice from '@/pages/LanguageChoice'
import AdminLogin     from '@/pages/AdminLogin'

function AdminApp() {
  const [lang, setLang]     = useState<'en' | 'fr' | null>(null)
  const [authed, setAuthed] = useState(false)

  return (
    <Routes>
      <Route path="/"          element={<SplashScreen to="/language" />} />
      <Route path="/language"  element={<LanguageChoice onSelect={setLang} to="/login" />} />
      <Route path="/login"     element={<AdminLogin onAuth={() => setAuthed(true)} />} />
      <Route path="/dashboard" element={authed ? <AdminDashboardPlaceholder /> : <Navigate to="/login" replace />} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AdminDashboardPlaceholder() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100dvh', background: '#0a1628', color: '#FFD700',
      fontSize: '1.4rem', fontWeight: 700, letterSpacing: 1
    }}>
      Dashboard Admin — À venir
    </div>
  )
}

export default AdminApp
