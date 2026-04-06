import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function SplashScreen() {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => navigate('/language'), 3800)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="lc-root splash-entry">
      <div className="lc-container splash-card-entry">
        <h1 className="lc-title splash-title-entry">Choose your language</h1>
        <h6 className="lc-subtitle splash-subtitle-entry">
          To be able to navigate clearly, select the language more accurate for you
        </h6>
        <div className="splash-progress-wrap splash-progress-entry">
          <div className="splash-progress-bar" />
        </div>
      </div>
    </div>
  )
}

export default SplashScreen
