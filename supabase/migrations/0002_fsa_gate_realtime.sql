-- BMT — semaine 2 : filtrage géographique côté serveur + carte admin en direct
-- À exécuter après 0001_init.sql dans le SQL Editor Supabase.

-- ─── Validation FSA côté serveur ──────────────────────────────────────────────
-- Miroir de src/lib/fsa.ts : seuls les codes postaux du Grand Moncton (préfixe
-- régional "E1") sont acceptés. Ne fait confiance à aucune validation client —
-- un citoyen malveillant pourrait contourner le JS, donc la base l'impose aussi.
create or replace function is_valid_fsa(fsa text)
returns boolean
language sql
immutable
as $$
  select fsa ~ '^[A-Z][0-9][A-Z]$' and left(fsa, 2) = 'E1'
$$;

alter table users drop constraint if exists users_fsa_prefix_valid;
alter table users add constraint users_fsa_prefix_valid
  check (fsa_prefix is null or is_valid_fsa(fsa_prefix));

-- ─── fsa_prefix obligatoire avant toute soumission ───────────────────────────
-- f9e1b50/0001_init.sql laissait fsa_prefix nullable le temps que l'écran de
-- saisie du code postal soit livré (src/pages/PostalCodePage.tsx, semaine 2).
-- Cette policy resserre l'accès en écriture : sans préfixe valide enregistré,
-- impossible de créer une soumission, même en contournant l'UI.
drop policy if exists "submissions insert own" on submissions;
create policy "submissions insert own" on submissions
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from users u
      where u.id = user_id
        and u.fsa_prefix is not null
        and is_valid_fsa(u.fsa_prefix)
    )
  );

-- ─── Carte admin en direct ────────────────────────────────────────────────────
-- AdminMapPage.tsx s'abonne désormais aux INSERT sur routes/stops via Supabase
-- Realtime — il faut explicitement ajouter ces tables à la publication pour que
-- les événements postgres_changes soient diffusés (pas activé par défaut).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'routes'
  ) then
    alter publication supabase_realtime add table routes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'stops'
  ) then
    alter publication supabase_realtime add table stops;
  end if;
end $$;
