import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { getAdminSession, signOutAdmin } from '@/lib/auth'
import SplashScreen    from '@/pages/SplashScreen'
import LanguageChoice  from '@/pages/LanguageChoice'
import AdminLogin      from '@/pages/AdminLogin'
import AdminDashboard  from '@/pages/AdminDashboard'
import AdminMapPage    from '@/pages/AdminMapPage'
import AdminSimulator  from '@/pages/AdminSimulator'
import AdminFinalMap   from '@/pages/AdminFinalMap'
import AdminReportPrint from '@/pages/AdminReportPrint'
import AdminDocuments  from '@/pages/AdminDocuments'

function AdminApp() {
  const navigate = useNavigate()
  const [lang, setLang]       = useState<'en' | 'fr' | null>(null)
  const [authed, setAuthed]   = useState(false)
  const [checking, setChecking] = useState(true)

  // Restaure la session au montage — sans ça, F5 sur une route admin protégée
  // renverrait au login à chaque fois alors que le compte Supabase est toujours
  // connecté côté navigateur.
  useEffect(() => {
    getAdminSession()
      .then(setAuthed)
      .finally(() => setChecking(false))
  }, [])

  const handleLogout = () => {
    void signOutAdmin()
    setAuthed(false)
    navigate('/')
  }

  const guard = (el: React.ReactElement) => {
    if (checking) return null
    return authed ? el : <Navigate to="/login" replace />
  }

  return (
    <Routes>
      <Route path="/"             element={<SplashScreen to="/language" />} />
      <Route path="/language"     element={<LanguageChoice onSelect={setLang} to="/login" />} />
      <Route path="/login"        element={<AdminLogin onAuth={() => setAuthed(true)} />} />
      <Route path="/dashboard"    element={guard(<AdminDashboard onLogout={handleLogout} />)} />
      <Route path="/carte"        element={guard(<AdminMapPage onLogout={handleLogout} />)} />
      <Route path="/simulateur"   element={guard(<AdminSimulator onLogout={handleLogout} />)} />
      <Route path="/carte-finale" element={guard(<AdminFinalMap onLogout={handleLogout} />)} />
      <Route path="/rapport-impression" element={guard(<AdminReportPrint />)} />
      <Route path="/documents"    element={guard(<AdminDocuments onLogout={handleLogout} />)} />
      <Route path="*"             element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AdminApp
