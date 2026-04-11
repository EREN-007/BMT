import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getParticipationStats,
  getNotifStatus,
  isNotifSupported,
  requestPermissionAndNotify,
  dismissNotifications,
  ParticipationStats,
} from '@/lib/participation'
import { ensureSeedData } from '@/lib/storage'

interface Props {
  onSelect: (lang: 'en' | 'fr') => void
  to?: string
}

// ─── Textes bilingues du banner ───────────────────────────────────────────

const T = {
  fr: {
    chooseTitle:  'Choisissez votre langue',
    chooseSubtitle: 'Sélectionnez la langue qui vous convient le mieux.',
    btnFr: 'FRANÇAIS',
    btnEn: 'ENGLISH',
    bannerTagline: (n: number) =>
      n > 0
        ? `${n} citoyen${n > 1 ? 's ont' : ' a'} déjà dessiné la carte de bus de Moncton.`
        : `Soyez parmi les premiers à dessiner le réseau de bus idéal de Moncton.`,
    bannerBody:
      'Souhaitez-vous être notifié(e) quand la carte est mise à jour ou quand un cap de participation est atteint ?',
    bannerAllow: 'Autoriser les notifications',
    bannerSkip:  'Non merci',
    bannerStat:  (drawings: number, votes: number) =>
      `${drawings} tracés · ${votes} votes d'arrêts`,
  },
  en: {
    chooseTitle:  'Choose your language',
    chooseSubtitle: 'Select the language that works best for you.',
    btnFr: 'FRANÇAIS',
    btnEn: 'ENGLISH',
    bannerTagline: (n: number) =>
      n > 0
        ? `${n} citizen${n > 1 ? 's have' : ' has'} already mapped Moncton's bus network.`
        : `Be among the first to design Moncton's ideal bus network.`,
    bannerBody:
      'Would you like to be notified when the map is updated or a participation milestone is reached?',
    bannerAllow: 'Allow notifications',
    bannerSkip:  'No thanks',
    bannerStat:  (drawings: number, votes: number) =>
      `${drawings} routes · ${votes} stop votes`,
  },
}

function LanguageChoice({ onSelect, to = '/map' }: Props) {
  const navigate = useNavigate()

  const [selectedLang, setSelectedLang] = useState<'fr' | 'en' | null>(null)
  const [showBanner,   setShowBanner]   = useState(false)
  const [stats,        setStats]        = useState<ParticipationStats>({ participants: 0, drawings: 0, stopVotes: 0 })
  const [loading,      setLoading]      = useState(false)

  // Pré-charger les stats dès le montage (ne bloque pas le rendu)
  useEffect(() => {
    ensureSeedData()
    setStats(getParticipationStats())
  }, [])

  // ── Sélection de langue ──────────────────────────────────────────────────
  const handleSelect = (lang: 'fr' | 'en') => {
    setSelectedLang(lang)

    // Afficher le banner seulement si :
    //   • l'API est disponible
    //   • on n'a jamais demandé avant (pending)
    const status = getNotifStatus()
    if (isNotifSupported() && status === 'pending') {
      setShowBanner(true)
    } else {
      // Déjà répondu ou API absente → naviguer directement
      onSelect(lang)
      navigate(to)
    }
  }

  // ── Autoriser ────────────────────────────────────────────────────────────
  const handleAllow = async () => {
    setLoading(true)
    await requestPermissionAndNotify(selectedLang!, stats)
    setLoading(false)
    setShowBanner(false)
    onSelect(selectedLang!)
    navigate(to)
  }

  // ── Refuser ──────────────────────────────────────────────────────────────
  const handleDismiss = () => {
    dismissNotifications()
    setShowBanner(false)
    onSelect(selectedLang!)
    navigate(to)
  }

  const t = T[selectedLang ?? 'fr']

  return (
    <div className="lc-root">
      {/* ── Carte choix de langue ── */}
      <div className={`lc-container lc-page2-card${showBanner ? ' lc-blurred' : ''}`}>
        <h1 className="lc-title lc-page2-title">Choose your language</h1>
        <h6 className="lc-subtitle lc-page2-subtitle">
          To be able to navigate clearly, select the language more accurate for you
        </h6>
        <div className="lc-buttons lc-page2-buttons">
          <button className="lc-btn lc-btn-fr" onClick={() => handleSelect('fr')}>
            🇫🇷 FRANÇAIS
          </button>
          <button className="lc-btn lc-btn-en" onClick={() => handleSelect('en')}>
            🇺🇸 ENGLISH
          </button>
        </div>
      </div>

      {/* ── Banner de permission — bottom sheet ── */}
      {showBanner && (
        <div className="notif-overlay" role="dialog" aria-modal="true" aria-label={t.bannerAllow}>

          {/* Fond semi-transparent — tap pour fermer (= "Non merci") */}
          <div className="notif-backdrop" onClick={handleDismiss} />

          <div className="notif-sheet">

            {/* Icône cloche */}
            <div className="notif-bell">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>

            {/* Compteur de participation */}
            {stats.participants > 0 && (
              <div className="notif-counter">
                <span className="notif-counter-num">{stats.participants}</span>
                <span className="notif-counter-label">
                  {selectedLang === 'fr' ? 'citoyens' : 'citizens'}
                </span>
              </div>
            )}

            <p className="notif-tagline">{t.bannerTagline(stats.participants)}</p>
            <p className="notif-body">{t.bannerBody}</p>

            {stats.drawings > 0 && (
              <p className="notif-stats">{t.bannerStat(stats.drawings, stats.stopVotes)}</p>
            )}

            {/* Actions */}
            <div className="notif-actions">
              <button
                className="notif-btn-allow"
                onClick={handleAllow}
                disabled={loading}
              >
                {loading
                  ? (selectedLang === 'fr' ? 'En cours…' : 'Processing…')
                  : t.bannerAllow}
              </button>
              <button className="notif-btn-skip" onClick={handleDismiss}>
                {t.bannerSkip}
              </button>
            </div>

            {/* Rassurant : contrôle dans les paramètres */}
            <p className="notif-fine-print">
              {selectedLang === 'fr'
                ? 'Vous pouvez modifier ce choix à tout moment dans les paramètres de votre navigateur.'
                : 'You can change this at any time in your browser settings.'}
            </p>

          </div>
        </div>
      )}
    </div>
  )
}

export default LanguageChoice
