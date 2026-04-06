import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import SplashScreen from '@/pages/SplashScreen'
import LanguageChoice from '@/pages/LanguageChoice'

function UserApp() {
  const [lang, setLang] = useState<'en' | 'fr' | null>(null)

  return (
    <Routes>
      <Route path="/" element={<SplashScreen />} />
      <Route path="/language" element={<LanguageChoice onSelect={setLang} />} />
      {/* Future pages will go here */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default UserApp
