import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import SplashScreen    from '@/pages/SplashScreen'
import LanguageChoice  from '@/pages/LanguageChoice'
import PostalCodePage  from '@/pages/PostalCodePage'
import MapPage         from '@/pages/MapPage'
import Page4Form       from '@/pages/Page4Form'
import ResultsPage     from '@/pages/ResultsPage'

function UserApp() {
  const [lang, setLang] = useState<'en' | 'fr' | null>(null)

  return (
    <Routes>
      <Route path="/"         element={<SplashScreen />} />
      <Route path="/language" element={<LanguageChoice onSelect={setLang} to="/postal" />} />
      <Route path="/postal"   element={<PostalCodePage />} />
      <Route path="/map"      element={<MapPage />} />
      <Route path="/page4"    element={<Page4Form />} />
      <Route path="/results"  element={<ResultsPage />} />
      <Route path="*"         element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default UserApp
