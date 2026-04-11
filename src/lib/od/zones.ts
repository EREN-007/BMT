import { ODZone } from './types'

// ─── 10 zones couvrant le Grand Moncton ───────────────────────────────────
// Les centroïdes coïncident avec des nœuds d'activité réels.
// La zone est assignée par distance au centroïde le plus proche —
// toute la bbox est donc toujours couverte (pas de "trou").
//
// Repères géographiques vérifiés :
//   46.0878 / -64.7782  → Highfield & Main (centre-ville Moncton)
//   46.0975 / -64.7440  → Champlain Place  (cœur commercial Dieppe)
//   46.1020 / -64.7600  → Campus U de Moncton
//   46.0630 / -64.7970  → Riverview Civic Centre

export const OD_ZONES: ODZone[] = [
  { id: 'Z01', name: 'Centre-ville Moncton',    center: [46.0878, -64.7782] },
  { id: 'Z02', name: 'Highfield / Elmwood',     center: [46.0938, -64.7885] },
  { id: 'Z03', name: 'Mountain Rd / Nord',      center: [46.1010, -64.7730] },
  { id: 'Z04', name: 'Université de Moncton',   center: [46.1020, -64.7600] },
  { id: 'Z05', name: 'Champlain / Mapleton',    center: [46.0835, -64.7680] },
  { id: 'Z06', name: 'Dieppe Centre',           center: [46.0975, -64.7440] },
  { id: 'Z07', name: 'Dieppe Est',              center: [46.0968, -64.7200] },
  { id: 'Z08', name: 'Moncton Ouest',           center: [46.0820, -64.8100] },
  { id: 'Z09', name: 'Riverview Nord',          center: [46.0690, -64.7910] },
  { id: 'Z10', name: 'Riverview Sud',           center: [46.0530, -64.7980] },
]
