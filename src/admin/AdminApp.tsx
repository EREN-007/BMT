import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import SplashScreen from '@/pages/SplashScreen'

function AdminApp() {
  return (
    <Routes>
      <Route path="/"          element={<SplashScreen to="/dashboard" />} />
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
