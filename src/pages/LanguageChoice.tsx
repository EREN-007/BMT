import React from 'react'
import { useNavigate } from 'react-router-dom'

interface Props {
  onSelect: (lang: 'en' | 'fr') => void
}

function LanguageChoice({ onSelect }: Props) {
  const navigate = useNavigate()

  const handleSelect = (lang: 'en' | 'fr') => {
    onSelect(lang)
    navigate('/auth')
  }

  return (
    <div className="lc-root">
      <div className="lc-container">
        <h1 className="lc-title">BMT • CME</h1>
        <p className="lc-subtitle">
          Choose your language / Choisissez votre langue
        </p>
        <div className="lc-buttons">
          <button className="lc-btn lc-btn-en" onClick={() => handleSelect('en')}>
            English
          </button>
          <button className="lc-btn lc-btn-fr" onClick={() => handleSelect('fr')}>
            Français
          </button>
        </div>
      </div>
    </div>
  )
}

export default LanguageChoice
