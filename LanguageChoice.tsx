import React from 'react'

function LanguageChoice() {
  const onSelect = (lang: 'en' | 'fr') => {
    // Subtle animation feedback can be done via CSS hover; keep alert for parity
    alert(`Language selected: ${lang === 'en' ? 'English' : 'Français'}`)
    // TODO: Navigate or persist choice if needed
  }

  return (
    <div className="lc-root">
      <div className="lc-container">
        <h1 className="lc-title">Choose your language</h1>
        <h6 className="lc-subtitle">To be able to navigate clearly, select the language more accurate for you</h6>
        <div className="lc-buttons">
          <button className="lc-btn lc-btn-en" onClick={() => onSelect('en')}>🇺🇸 ENGLISH</button>
          <button className="lc-btn lc-btn-fr" onClick={() => onSelect('fr')}>🇫🇷 FRANÇAIS</button>
        </div>
      </div>
    </div>
  )
}

export default LanguageChoice
