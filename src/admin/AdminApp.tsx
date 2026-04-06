import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import SplashScreen    from '@/pages/SplashScreen'
import LanguageChoice  from '@/pages/LanguageChoice'
import AdminLogin      from '@/pages/AdminLogin'
import AdminDashboard  from '@/pages/AdminDashboard'
import AdminMapPage    from '@/pages/AdminMapPage'

function AdminApp() {
  const [lang, setLang]     = useState<'en' | 'fr' | null>(null)
  const [authed, setAuthed] = useState(false)

  const guard = (el: React.ReactElement) =>
    authed ? el : <Navigate to="/login" replace />

  return (
    <Routes>
      <Route path="/"          element={<SplashScreen to="/language" />} />
      <Route path="/language"  element={<LanguageChoice onSelect={setLang} to="/login" />} />
      <Route path="/login"     element={<AdminLogin onAuth={() => setAuthed(true)} />} />
      <Route path="/dashboard" element={guard(<AdminDashboard onLogout={() => setAuthed(false)} />)} />
      <Route path="/carte"     element={guard(<AdminMapPage />)} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AdminApp
