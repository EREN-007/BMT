import { supabase } from '../supabase'
import { UnitCost } from './types'
import { DEFAULT_UNIT_COSTS } from './index'

// ─── Coûts unitaires (table `budget_costs`, admin uniquement) ─────────────
// La table est seedée par la migration (supabase/migrations/0005_budget_costs.sql)
// avec les mêmes valeurs que DEFAULT_UNIT_COSTS ci-dessus. Si la migration n'a pas
// encore été exécutée (table absente) ou que la requête échoue pour une autre
// raison, on retombe sur les valeurs par défaut en mémoire plutôt que de bloquer
// l'onglet Budget.

export async function getBudgetCosts(): Promise<UnitCost[]> {
  try {
    const { data, error } = await supabase
      .from('budget_costs')
      .select('id, label, value, unit')
      .order('id')
    if (error || !data || data.length === 0) return DEFAULT_UNIT_COSTS
    return data as UnitCost[]
  } catch {
    return DEFAULT_UNIT_COSTS
  }
}

export async function saveBudgetCosts(costs: UnitCost[]): Promise<void> {
  const { error } = await supabase
    .from('budget_costs')
    .upsert(
      costs.map(c => ({ id: c.id, label: c.label, value: c.value, unit: c.unit, updated_at: new Date().toISOString() })),
      { onConflict: 'id' },
    )
  if (error) throw error
}
