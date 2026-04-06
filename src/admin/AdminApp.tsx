import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import SplashScreen   from '@/pages/SplashScreen'
import LanguageChoice from '@/pages/LanguageChoice'

function AdminApp() {
  const [lang, setLang] = useState<'en' | 'fr' | null>(null)

  return (
    <Routes>
      <Route path="/"          element={<SplashScreen to="/language" />} />
      <Route path="/language"  element={<LanguageChoice onSelect={setLang} to="/dashboard" />} />
      <Route path="/dashboard" element={<AdminDashboardPlaceholder />} />
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
