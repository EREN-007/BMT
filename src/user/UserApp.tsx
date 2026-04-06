import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import SplashScreen    from '@/pages/SplashScreen'
import LanguageChoice  from '@/pages/LanguageChoice'
import MapPage         from '@/pages/MapPage'

const Page4Placeholder = () => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', background:'#0a1628', color:'#FFD700', fontSize:'1.5rem', fontWeight:700 }}>
    Page 4 — À venir
  </div>
)

function UserApp() {
  const [lang, setLang] = useState<'en' | 'fr' | null>(null)

  return (
    <Routes>
      <Route path="/"         element={<SplashScreen />} />
      <Route path="/language" element={<LanguageChoice onSelect={setLang} />} />
      <Route path="/map"      element={<MapPage />} />
      <Route path="/page4"    element={<Page4Placeholder />} />
      <Route path="*"         element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default UserApp
