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
      <div className="lc-container lc-page2-card">
        <h1 className="lc-title lc-page2-title">Choose your language</h1>
        <h6 className="lc-subtitle lc-page2-subtitle">
          To be able to navigate clearly, select the language more accurate for you
        </h6>
        <div className="lc-buttons lc-page2-buttons">
          <button className="lc-btn lc-btn-en" onClick={() => handleSelect('en')}>
            🇺🇸 ENGLISH
          </button>
          <button className="lc-btn lc-btn-fr" onClick={() => handleSelect('fr')}>
            🇫🇷 FRANÇAIS
          </button>
        </div>
      </div>
    </div>
  )
}

export default LanguageChoice
