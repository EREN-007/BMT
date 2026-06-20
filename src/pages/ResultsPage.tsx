import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getRoutes, getStops, purgeSeedData } from '@/lib/storage'
import { aggregate, AggregationResult } from '@/lib/aggregation'
import { getParticipationStats, ParticipationStats } from '@/lib/participation'

// Fix Leaflet default icon broken by Vite
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const MONCTON_CENTER: [number, number] = [46.075, -64.760]
const LANG_KEY = 'bmt_lang'

// ─── Helpers visuels ──────────────────────────────────────────────────────────

function corridorColor(count: number, max: number): string {
  const r = max > 0 ? count / max : 0
  if (r >= 0.67) return '#e74c3c'
  if (r >= 0.33) return '#f39c12'
  return '#3498db'
}

function corridorWeight(count: number, max: number): number {
  return max > 0 ? 3 + (count / max) * 7 : 3
}

// ─── Textes bilingues ─────────────────────────────────────────────────────────

const T = {
  fr: {
    header:        'Carte citoyenne',
    subtitle:      'Grand Moncton — résultats agrégés',
    participants:  'citoyens',
    drawings:      'tracés soumis',
    stopVotes:     "votes d'arrêts",
    corridors:     'corridors identifiés',
    legendTitle:   'Popularité des corridors',
    legendHigh:    'Très demandé',
    legendMed:     'Demandé',
    legendLow:     'Proposé',
    legendStop:    'Arrêt / Station',
    ctaTitle:      'Cette carte vous appartient',
    ctaBody:       'Chaque tracé compte. Dessinez votre version idéale du réseau de bus de Grand Moncton.',
    ctaDraw:       'Dessiner ma carte',
    ctaValidate:   'Je valide cette carte',
    updated:       'Mise à jour',
    noData:        'Chargement de la carte en cours…',
    tooltipCit:    'citoyen',
    tooltipCits:   'citoyens',
  },
  en: {
    header:        'Citizen Map',
    subtitle:      'Greater Moncton — aggregated results',
    participants:  'citizens',
    drawings:      'routes submitted',
    stopVotes:     'stop votes',
    corridors:     'corridors identified',
    legendTitle:   'Corridor popularity',
    legendHigh:    'Most requested',
    legendMed:     'Requested',
    legendLow:     'Proposed',
    legendStop:    'Stop / Station',
    ctaTitle:      'This map belongs to you',
    ctaBody:       "Every route counts. Draw your ideal version of Greater Moncton's bus network.",
    ctaDraw:       'Draw my map',
    ctaValidate:   'I validate this map',
    updated:       'Updated',
    noData:        'Loading map…',
    tooltipCit:    'citizen',
    tooltipCits:   'citizens',
  },
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ResultsPage() {
  const navigate = useNavigate()
  const lang = (localStorage.getItem(LANG_KEY) || 'fr') as 'fr' | 'en'
  const t    = T[lang]

  const [result, setResult] = useState<AggregationResult | null>(null)
  const [stats,  setStats]  = useState<ParticipationStats>({ participants: 0, drawings: 0, stopVotes: 0 })

  useEffect(() => {
    purgeSeedData()
    const routes = getRoutes()
    const stops  = getStops()
    setResult(aggregate(routes, stops, { minCount: 2, minCells: 3 }))
    setStats(getParticipationStats())
  }, [])

  const maxCount = useMemo(
    () => result ? Math.max(...result.corridors.map(c => c.count), 1) : 1,
    [result],
  )

  const formattedDate = new Date().toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="rp-root">

      {/* ── Header ── */}
      <header className="rp-header">
        <button className="rp-back-btn" onClick={() => navigate(-1)} aria-label="Retour">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="rp-header-text">
          <h1 className="rp-title">{t.header}</h1>
          <p className="rp-subtitle">{t.subtitle}</p>
        </div>
        <div className="rp-logo-badge">BMT</div>
      </header>

      {/* ── Stats bar ── */}
      <div className="rp-stats-bar">
        <div className="rp-stat">
          <span className="rp-stat-num">{stats.participants}</span>
          <span className="rp-stat-label">{t.participants}</span>
        </div>
        <div className="rp-stat-divider" />
        <div className="rp-stat">
          <span className="rp-stat-num">{stats.drawings}</span>
          <span className="rp-stat-label">{t.drawings}</span>
        </div>
        <div className="rp-stat-divider" />
        <div className="rp-stat">
          <span className="rp-stat-num">{result ? result.corridors.length : '—'}</span>
          <span className="rp-stat-label">{t.corridors}</span>
        </div>
        <div className="rp-stat-divider" />
        <div className="rp-stat">
          <span className="rp-stat-num">{stats.stopVotes}</span>
          <span className="rp-stat-label">{t.stopVotes}</span>
        </div>
      </div>

      {/* ── Map ── */}
      <div className="rp-map-wrap">
        {!result ? (
          <div className="rp-map-loading">{t.noData}</div>
        ) : (
          <MapContainer
            center={MONCTON_CENTER}
            zoom={13}
            className="rp-leaflet"
            zoomControl
            scrollWheelZoom
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={20}
            />

            {/* Corridors agrégés */}
            {result.corridors.map(corridor => (
              <Polyline
                key={corridor.id}
                positions={corridor.points}
                pathOptions={{
                  color:     corridorColor(corridor.count, maxCount),
                  weight:    corridorWeight(corridor.count, maxCount),
                  opacity:   0.88,
                  lineCap:   'round',
                  lineJoin:  'round',
                }}
              >
                <Tooltip sticky>
                  {corridor.label} — {corridor.count}&nbsp;
                  {corridor.count > 1 ? t.tooltipCits : t.tooltipCit}
                </Tooltip>
              </Polyline>
            ))}

            {/* Arrêts agrégés */}
            {result.stops.map(stop => (
              <CircleMarker
                key={stop.id}
                center={stop.pos}
                radius={Math.min(3 + stop.count / 6, 12)}
                pathOptions={{
                  color:       stop.type === 'station' ? '#e6b800' : '#ffffff',
                  fillColor:   stop.type === 'station' ? '#f1c40f' : '#1255a0',
                  fillOpacity: 0.85,
                  weight:      2,
                }}
              >
                <Tooltip>{stop.label} ({stop.count})</Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        )}

        {/* Légende */}
        {result && (
          <div className="rp-legend">
            <div className="rp-legend-title">{t.legendTitle}</div>
            <div className="rp-legend-row">
              <span className="rp-legend-line" style={{ background: '#e74c3c', height: '4px' }} />
              {t.legendHigh}
            </div>
            <div className="rp-legend-row">
              <span className="rp-legend-line" style={{ background: '#f39c12', height: '4px' }} />
              {t.legendMed}
            </div>
            <div className="rp-legend-row">
              <span className="rp-legend-line" style={{ background: '#3498db', height: '4px' }} />
              {t.legendLow}
            </div>
            <div className="rp-legend-row">
              <span className="rp-legend-dot-stop" />
              {t.legendStop}
            </div>
          </div>
        )}
      </div>

      {/* ── Update date ── */}
      <p className="rp-update-line">{t.updated} : {formattedDate}</p>

      {/* ── CTA ── */}
      <div className="rp-cta-card">
        <h2 className="rp-cta-title">{t.ctaTitle}</h2>
        <p className="rp-cta-body">{t.ctaBody}</p>
        <div className="rp-cta-row">
          <button className="rp-btn-draw" onClick={() => navigate('/map')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
            {t.ctaDraw}
          </button>
          <button className="rp-btn-validate" onClick={() => navigate('/page4')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {t.ctaValidate}
          </button>
        </div>
      </div>

    </div>
  )
}

export default ResultsPage
