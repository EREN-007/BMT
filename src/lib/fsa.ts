// ─── Filtrage géographique par code postal (FSA) ──────────────────────────
// Seuls les citoyens du Grand Moncton (Moncton, Riverview, Dieppe) peuvent
// participer. Au Canada, les codes postaux du Grand Moncton commencent tous
// par "E1" (zone distincte de Saint John = E2, Fredericton = E3, etc.).
// Cette règle au niveau région (2 caractères) est une simplification
// volontaire — à resserrer FSA par FSA (3 caractères) si une granularité
// plus fine est requise un jour ; à valider avec les limites officielles
// de Postes Canada avant une présentation officielle.
const ALLOWED_FSA_REGION = 'E1'

const FSA_RE = /^[A-Z]\d[A-Z]$/

export function extractFsa(postalCode: string): string {
  return postalCode.trim().toUpperCase().replace(/\s/g, '').slice(0, 3)
}

export function isValidFsa(fsa: string): boolean {
  const clean = fsa.trim().toUpperCase()
  return FSA_RE.test(clean) && clean.startsWith(ALLOWED_FSA_REGION)
}
