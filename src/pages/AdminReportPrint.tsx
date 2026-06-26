import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getLang, ADMIN_T } from '@/lib/lang'
import { ReportPrintState, REPORT_PRINT_STATE_KEY } from '@/lib/reportPrintState'
import { FinalRoute, FinalStop } from '@/lib/finalState'

// Carto Positron — fond clair, adapté à l'impression, sans clé
const CARTO_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'
const CARTO_ATTR  = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const MONCTON_CENTER: [number, number] = [46.075, -64.760]

delete (L.Icon.Default.prototype as any)._getIconUrl

function FitToRoutes({ routes }: { routes: FinalRoute[] }) {
  const map = useMap()
  useEffect(() => {
    const allPoints = routes.flatMap(r => r.points)
    if (allPoints.length > 0) map.fitBounds(allPoints, { padding: [20, 20] })
    map.invalidateSize()
  }, [map, routes])
  return null
}

function routeBadge(number: string, color: string) {
  return L.divIcon({
    html: `<div style="background:${color};color:white;font-weight:900;font-size:11px;
      width:22px;height:22px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;border:2px solid rgba(255,255,255,0.9);
      box-shadow:0 1px 6px rgba(0,0,0,0.35);font-family:sans-serif;">${number}</div>`,
    className: '', iconSize: [22, 22], iconAnchor: [11, 11],
  })
}

function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function NetworkMap({ routes }: { routes: FinalRoute[] }) {
  return (
    <div className="arp-map-wrap">
      <MapContainer center={MONCTON_CENTER} zoom={13} className="arp-map" zoomControl={false} dragging={false} scrollWheelZoom={false}>
        <FitToRoutes routes={routes} />
        <TileLayer url={CARTO_LIGHT} attribution={CARTO_ATTR} subdomains={['a','b','c','d']} />
        {routes.map(r => (
          <React.Fragment key={r.id}>
            {/* Contour neutre pour séparer les lignes superposées */}
            <Polyline positions={r.points} pathOptions={{ color: 'white', weight: 9, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }} />
            <Polyline positions={r.points} pathOptions={{ color: r.color, weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
          </React.Fragment>
        ))}
        {routes.map(r => (
          <Marker key={`b-${r.id}`} position={r.midpoint} icon={routeBadge(r.number, r.color)} interactive={false} />
        ))}
      </MapContainer>
    </div>
  )
}

function AdminReportPrint() {
  const navigate = useNavigate()
  const lang = getLang()
  const t = ADMIN_T[lang]

  const [state] = useState<ReportPrintState | null>(() => {
    try {
      const raw = localStorage.getItem(REPORT_PRINT_STATE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as ReportPrintState
    } catch {
      return null
    }
  })

  if (!state) {
    return (
      <div className="arp-root">
        <p style={{ padding: 24 }}>{t.rpEmpty}</p>
      </div>
    )
  }

  const { report, routes, stops } = state
  const { data, narrative, sources, generatedAt } = report

  return (
    <div className="arp-root">

      <div className="arp-toolbar">
        <button className="sim-btn" onClick={() => navigate(-1)}>{t.rpBack}</button>
        <button className="sim-btn sim-btn-add" onClick={() => window.print()}>{t.rpPrint}</button>
      </div>

      <div className="arp-page">

        <header className="arp-header">
          <div>
            <div className="arp-h-main">GRAND MONCTON TRANSIT</div>
            <div className="arp-h-sub">{t.rpTitle}</div>
            <div className="arp-h-meta">{t.rpSub} · {new Date(generatedAt).toLocaleString()}</div>
          </div>
        </header>

        <section>
          <h2 className="arp-section-title">{t.rpNetworkMap}</h2>
          <NetworkMap routes={routes} />
        </section>

        <section className="arp-kpi-row">
          <div className="arp-kpi"><span>{narrative.connectivity_score}/100</span>{t.reportConnectivity}</div>
          <div className="arp-kpi"><span>{data.ridership.totalDailyRiders.toLocaleString()}</span>{t.rpDailyRiders}</div>
          <div className="arp-kpi"><span>{Math.round(data.ridership.fareboxRecovery * 100)}%</span>{t.rpFareboxRecovery}</div>
          <div className="arp-kpi"><span>{data.ridership.busesRequired}</span>{t.rpBusesRequired}</div>
        </section>

        <section>
          <h2 className="arp-section-title">{t.reportExecSummary}</h2>
          <p className="arp-text">{narrative.executive_summary}</p>
        </section>

        <section>
          <h2 className="arp-section-title">{t.reportRidership}</h2>
          <p className="arp-text">{narrative.ridership_analysis}</p>
        </section>

        <section>
          <h2 className="arp-section-title">{t.reportEquity}</h2>
          <p className="arp-text">{narrative.equity_analysis}</p>
          {data.equity.criticalZones.length > 0 && (
            <>
              <p className="arp-table-label">{t.rpCriticalZones}</p>
              <table className="arp-table">
                <tbody>
                  {data.equity.criticalZones.map((z, i) => (
                    <tr key={i}><td>{z.name}</td><td className="arp-num">{t.rpZoneGap} {z.gap.toFixed(1)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {data.equity.moderateZones.length > 0 && (
            <>
              <p className="arp-table-label">{t.rpModerateZones}</p>
              <table className="arp-table">
                <tbody>
                  {data.equity.moderateZones.map((z, i) => (
                    <tr key={i}><td>{z.name}</td><td className="arp-num">{t.rpZoneGap} {z.gap.toFixed(1)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section>
          <h2 className="arp-section-title">{t.reportConnectivity}</h2>
          <p className="arp-text">{narrative.connectivity_analysis}</p>
        </section>

        <section>
          <h2 className="arp-section-title">{t.reportIndustry}</h2>
          <p className="arp-text">{narrative.industry_comparison}</p>
        </section>

        <section className="arp-avoid-break">
          <h2 className="arp-section-title">{t.rpBudgetTable}</h2>
          <p className="arp-text">{narrative.budget_narrative}</p>
          <div className="arp-budget-cols">
            <div>
              <p className="arp-table-label">{t.rpCapital}</p>
              <table className="arp-table">
                <tbody>
                  {data.budget.capitalItems.map((it, i) => (
                    <tr key={i}><td>{it.label}</td><td className="arp-num">{fmtMoney(it.total)} $</td></tr>
                  ))}
                  <tr className="arp-table-total"><td>{t.rpCapital}</td><td className="arp-num">{fmtMoney(data.budget.capitalTotal)} $</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <p className="arp-table-label">{t.rpOperating}</p>
              <table className="arp-table">
                <tbody>
                  {data.budget.operatingAnnual.map((it, i) => (
                    <tr key={i}><td>{it.label}</td><td className="arp-num">{fmtMoney(it.total)} $</td></tr>
                  ))}
                  <tr className="arp-table-total"><td>{t.rpOperating}</td><td className="arp-num">{fmtMoney(data.budget.operatingAnnualTotal)} $</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="arp-grand-total">{t.rpGrandTotal} : {fmtMoney(data.budget.grandTotalYear1)} $</p>
        </section>

        <section className="arp-avoid-break">
          <h2 className="arp-section-title">{t.reportRecommendations}</h2>
          <ul className="arp-rec-list">
            {narrative.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
          </ul>
        </section>

        <section className="arp-avoid-break">
          <h2 className="arp-section-title">{t.reportSources}</h2>
          {sources.length === 0 ? (
            <p className="arp-text-muted">{t.reportNoSources}</p>
          ) : (
            <ul className="arp-source-list">
              {sources.map((s, i) => (
                <li key={i}>{s.document_title} <span className="arp-text-muted">({Math.round(s.similarity * 100)}%)</span></li>
              ))}
            </ul>
          )}
        </section>

        <footer className="arp-footer">
          {stops.length} {t.finalStops} · {routes.length} {t.finalLines}
        </footer>

      </div>
    </div>
  )
}

export default AdminReportPrint
