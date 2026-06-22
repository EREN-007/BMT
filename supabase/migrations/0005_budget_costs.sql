-- BMT — semaine 3 : table de coûts unitaires pour le moteur de budget
-- À exécuter après 0004_input_guardrails.sql dans le SQL Editor Supabase.
--
-- Couvre l'item handoff.md "Table de coûts unitaires configurable par l'admin"
-- (coût/km de ligne, coût/abribus, coût/heure-véhicule, etc.). Réservée à l'admin
-- (RLS) — ces chiffres servent uniquement à la planification interne, aucun
-- intérêt à les exposer côté citoyen.

create table if not exists budget_costs (
  id          text primary key,
  label       text not null,
  value       numeric not null,
  unit        text not null,
  updated_at  timestamptz not null default now()
);

alter table budget_costs enable row level security;

drop policy if exists "admin read budget_costs" on budget_costs;
create policy "admin read budget_costs" on budget_costs
  for select using (exists (select 1 from admins a where a.user_id = auth.uid()));

drop policy if exists "admin insert budget_costs" on budget_costs;
create policy "admin insert budget_costs" on budget_costs
  for insert with check (exists (select 1 from admins a where a.user_id = auth.uid()));

drop policy if exists "admin update budget_costs" on budget_costs;
create policy "admin update budget_costs" on budget_costs
  for update using (exists (select 1 from admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from admins a where a.user_id = auth.uid()));

-- Valeurs de départ — illustratives (ordre de grandeur municipal canadien),
-- PAS des références validées pour Moncton/N.-B. À ajuster depuis l'onglet
-- Budget de l'admin avant toute présentation officielle (cf. handoff.md,
-- section Risques : "Coûts unitaires réels"). Mêmes valeurs que
-- src/lib/budget/index.ts::DEFAULT_UNIT_COSTS, utilisé comme repli si cette
-- table est absente ou vide.
insert into budget_costs (id, label, value, unit) values
  ('cost_per_km',           'Infrastructure / km de ligne',           150000, '$/km'),
  ('cost_per_busstop',      'Arrêt de bus (abribus, signalisation)',  8000,   '$/arrêt'),
  ('cost_per_station',      'Station / pôle d''échange',              250000, '$/station'),
  ('cost_per_bus',          'Véhicule (autobus conventionnel)',       650000, '$/véhicule'),
  ('cost_per_vehicle_hour', 'Exploitation (heure-véhicule)',          120,    '$/heure')
on conflict (id) do nothing;
