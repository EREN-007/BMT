import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function BusSVG() {
  return (
    <svg
      className="splash-bus-svg"
      viewBox="0 0 220 90"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Body */}
      <rect x="2" y="10" width="210" height="62" rx="10" fill="#FFD700" />
      {/* Blue stripe */}
      <rect x="2" y="44" width="210" height="9" fill="#1255a0" />
      {/* Roof detail */}
      <rect x="10" y="4" width="80" height="8" rx="3" fill="#e6b800" />
      {/* Route sign */}
      <rect x="96" y="2" width="70" height="10" rx="3" fill="#1255a0" />
      <text
        x="131"
        y="10"
        fontSize="7"
        fill="white"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        letterSpacing="1"
      >
        BMT • CME
      </text>
      {/* Windows */}
      <rect x="12" y="16" width="30" height="20" rx="5" fill="#a8d8f0" opacity="0.9" />
      <rect x="50" y="16" width="30" height="20" rx="5" fill="#a8d8f0" opacity="0.9" />
      <rect x="88" y="16" width="30" height="20" rx="5" fill="#a8d8f0" opacity="0.9" />
      <rect x="126" y="16" width="30" height="20" rx="5" fill="#a8d8f0" opacity="0.9" />
      {/* Front windshield */}
      <rect x="178" y="14" width="28" height="24" rx="5" fill="#c8e8f8" opacity="0.9" />
      {/* Door */}
      <rect x="160" y="38" width="14" height="34" rx="3" fill="#e6b800" />
      <line x1="167" y1="38" x2="167" y2="72" stroke="#c8a000" strokeWidth="1" />
      {/* Headlight */}
      <ellipse cx="208" cy="30" rx="5" ry="6" fill="white" opacity="0.95" />
      <ellipse cx="208" cy="30" rx="3" ry="4" fill="#fffde0" />
      {/* Wheels */}
      <circle cx="45" cy="75" r="13" fill="#1a1a2e" />
      <circle cx="45" cy="75" r="7" fill="#4a4a5e" />
      <circle cx="45" cy="75" r="3" fill="#8888a0" />
      <circle cx="170" cy="75" r="13" fill="#1a1a2e" />
      <circle cx="170" cy="75" r="7" fill="#4a4a5e" />
      <circle cx="170" cy="75" r="3" fill="#8888a0" />
      {/* Undercarriage shadow */}
      <ellipse cx="107" cy="88" rx="95" ry="4" fill="rgba(0,0,0,0.25)" />
    </svg>
  )
}

function SplashScreen() {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => navigate('/language'), 4800)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="splash-root">
      {/* Animated background particles */}
      <div className="splash-particles" aria-hidden="true">
        <span className="splash-particle" style={{ left: '10%', animationDelay: '0s', animationDuration: '6s' }} />
        <span className="splash-particle" style={{ left: '25%', animationDelay: '1.2s', animationDuration: '8s' }} />
        <span className="splash-particle" style={{ left: '50%', animationDelay: '0.5s', animationDuration: '7s' }} />
        <span className="splash-particle" style={{ left: '70%', animationDelay: '2s', animationDuration: '5s' }} />
        <span className="splash-particle" style={{ left: '88%', animationDelay: '0.8s', animationDuration: '9s' }} />
      </div>

      {/* Road */}
      <div className="splash-road" aria-hidden="true">
        <div className="splash-road-dashes" />
      </div>

      {/* Bus */}
      <div className="splash-bus-track" aria-label="Bus animé traversant l'écran">
        <BusSVG />
      </div>

      {/* Main content */}
      <div className="splash-content">
        <div className="splash-logo" aria-label="BMT CME">
          <span className="splash-acronym splash-bmt">BMT</span>
          <span className="splash-separator" aria-hidden="true">•</span>
          <span className="splash-acronym splash-cme">CME</span>
        </div>

        <div className="splash-divider" aria-hidden="true" />

        <p className="splash-line splash-line-en">Build Moncton Together</p>
        <p className="splash-line splash-line-fr">Construire Moncton Ensemble</p>
      </div>

      {/* Footer */}
      <div className="splash-footer">
        <span className="splash-city">Grand Moncton, NB</span>
        <div className="splash-progress" aria-hidden="true">
          <div className="splash-progress-bar" />
        </div>
      </div>
    </div>
  )
}

export default SplashScreen
