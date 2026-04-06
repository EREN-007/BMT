import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import SplashScreen    from '@/pages/SplashScreen'
import LanguageChoice  from '@/pages/LanguageChoice'
import AdminLogin      from '@/pages/AdminLogin'
import AdminDashboard  from '@/pages/AdminDashboard'

function AdminApp() {
  const [lang, setLang]     = useState<'en' | 'fr' | null>(null)
  const [authed, setAuthed] = useState(false)

  return (
    <Routes>
      <Route path="/"          element={<SplashScreen to="/language" />} />
      <Route path="/language"  element={<LanguageChoice onSelect={setLang} to="/login" />} />
      <Route path="/login"     element={<AdminLogin onAuth={() => setAuthed(true)} />} />
      <Route path="/dashboard" element={authed ? <AdminDashboard onLogout={() => setAuthed(false)} /> : <Navigate to="/login" replace />} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AdminApp
