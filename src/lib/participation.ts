import { getRoutes, getStops } from './storage'

// ─── Statistiques de participation ────────────────────────────────────────
// Lit les données locales (seeded + vraies soumissions) et compte
// les sessions uniques comme "participants".

export interface ParticipationStats {
  participants: number   // sessions uniques (= citoyens distincts)
  drawings:     number   // tracés soumis
  stopVotes:    number   // votes d'arrêts
}

export function getParticipationStats(): ParticipationStats {
  const routes   = getRoutes()
  const stops    = getStops()
  const sessions = new Set(routes.map(r => r.sessionId).filter(Boolean))
  return {
    participants: sessions.size,
    drawings:     routes.length,
    stopVotes:    stops.length,
  }
}

// ─── Gestion de l'état de permission ─────────────────────────────────────
// 'pending'   → jamais demandé
// 'granted'   → accordé
// 'denied'    → refusé par le navigateur
// 'dismissed' → l'utilisateur a cliqué "Non merci" dans le banner

const NOTIF_KEY = 'bmt_notif_status'

export type NotifStatus = 'pending' | 'granted' | 'denied' | 'dismissed'

export function getNotifStatus(): NotifStatus {
  return (localStorage.getItem(NOTIF_KEY) as NotifStatus) ?? 'pending'
}

function setNotifStatus(status: NotifStatus): void {
  localStorage.setItem(NOTIF_KEY, status)
}

// ─── Support de l'API Notification ───────────────────────────────────────

export function isNotifSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

// ─── Contenu des notifications (bilingue) ────────────────────────────────

const NOTIF_CONTENT: Record<'fr' | 'en', (stats: ParticipationStats) => { title: string; body: string }> = {
  fr: (s) => ({
    title: 'BMT — Construire Moncton Ensemble',
    body: s.participants > 0
      ? `${s.participants} citoyen${s.participants > 1 ? 's ont' : ' a'} déjà contribué${s.participants > 1 ? '' : ''} — ${s.drawings} tracés soumis. Nous vous tiendrons informé${s.participants > 1 ? 's' : '(e)'} des mises à jour de la carte.`
      : `Soyez parmi les premiers à dessiner le réseau de bus idéal pour Grand Moncton.`,
  }),
  en: (s) => ({
    title: 'BMT — Build Moncton Together',
    body: s.participants > 0
      ? `${s.participants} citizen${s.participants > 1 ? 's have' : ' has'} already contributed — ${s.drawings} routes submitted. We'll keep you informed about map updates.`
      : `Be among the first to design the ideal bus network for Greater Moncton.`,
  }),
}

// ─── Déclenchement de la notification système ────────────────────────────
// Appelée après que l'API navigateur a accordé la permission.

function fireNotification(lang: 'fr' | 'en', stats: ParticipationStats): void {
  const { title, body } = NOTIF_CONTENT[lang](stats)
  try {
    new Notification(title, {
      body,
      tag:  'bmt-participation',   // empêche les doublons
      icon: '/icons/icon-192.png', // fallback gracieux si absent
    })
  } catch {
    // Certains contextes Capacitor ne supportent pas toutes les options — fail silently
  }
}

// ─── Demande de permission + notification ────────────────────────────────
// Déclenche le dialogue natif du navigateur/OS.
// Retourne la permission résultante.

export async function requestPermissionAndNotify(
  lang:  'fr' | 'en',
  stats: ParticipationStats,
): Promise<NotifStatus> {
  if (!isNotifSupported()) return 'denied'

  const raw = await Notification.requestPermission()
  const status = raw as NotifStatus
  setNotifStatus(status)

  if (status === 'granted') {
    fireNotification(lang, stats)
  }

  return status
}

// ─── Rejet par l'utilisateur dans le banner ───────────────────────────────
// N'appelle pas l'API navigateur — respecte entièrement le choix.

export function dismissNotifications(): void {
  setNotifStatus('dismissed')
}

// ─── Notification de confirmation après soumission ───────────────────────
// Peut être appelée depuis Page4Form une fois le formulaire envoyé.

export function fireSubmissionConfirmation(lang: 'fr' | 'en'): void {
  if (!isNotifSupported() || Notification.permission !== 'granted') return
  const stats  = getParticipationStats()
  const { title } = NOTIF_CONTENT[lang](stats)
  const body = lang === 'fr'
    ? `Merci ! Votre contribution a bien été enregistrée. La carte sera mise à jour sous peu.`
    : `Thank you! Your contribution has been recorded. The map will be updated shortly.`
  try {
    new Notification(title, { body, tag: 'bmt-submission', icon: '/icons/icon-192.png' })
  } catch { /* fail silently */ }
}
