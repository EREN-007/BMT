export interface UnitCost {
  id: string
  label: string
  value: number
  unit: string
}

export interface BudgetLineItem {
  id: string
  label: string
  quantity: number
  quantityUnit: string
  unitCost: number
  total: number
}

export interface BudgetResult {
  capitalItems: BudgetLineItem[]
  capitalTotal: number
  operatingAnnual: BudgetLineItem[]
  operatingAnnualTotal: number
  grandTotalYear1: number
  computeTimeMs: number
}
