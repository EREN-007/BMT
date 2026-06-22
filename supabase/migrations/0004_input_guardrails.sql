-- BMT — garde-fous serveur sur les entrées citoyennes (checklist Sécurité, handoff.md)
-- À exécuter après 0003_clear_test_data.sql dans le SQL Editor Supabase.
--
-- Couvre deux écarts ouverts notés dans handoff.md au 22 juin :
--   1. Aucune borne géographique/nombre de points sur routes.points / stops.pos —
--      un client malveillant pouvait soumettre des tracés hors Grand Moncton ou des
--      payloads de milliers de points.
--   2. Aucun rate limiting sur la création de soumissions — un script pouvait
--      spammer saveSubmission() sans limite, polluant l'agrégation.

-- ─── Bornes géographiques ────────────────────────────────────────────────────
-- Calquées sur BBOX dans src/lib/aggregation/grid.ts (46.040–46.130 lat,
-- -64.860 à -64.680 lng), avec une marge de ~0.05° (~5km) pour ne pas rejeter un
-- tracé légitime qui déborde un peu de la grille d'agrégation — le but ici est
-- d'écarter les payloads aberrants (mauvaise région, données de test, bug client),
-- pas de reproduire la grille au degré près.
create or replace function is_valid_route_points(points jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  n  int;
  pt jsonb;
  lat numeric;
  lng numeric;
begin
  if jsonb_typeof(points) is distinct from 'array' then
    return false;
  end if;

  n := jsonb_array_length(points);
  if n < 2 or n > 500 then
    return false;
  end if;

  for pt in select * from jsonb_array_elements(points)
  loop
    if jsonb_typeof(pt) is distinct from 'array' or jsonb_array_length(pt) <> 2 then
      return false;
    end if;
    lat := (pt->>0)::numeric;
    lng := (pt->>1)::numeric;
    if lat < 45.99 or lat > 46.18 or lng < -64.91 or lng > -64.63 then
      return false;
    end if;
  end loop;

  return true;
exception when others then
  -- payload malformé (types inattendus, valeurs non numériques, etc.) → invalide
  return false;
end;
$$;

create or replace function is_valid_stop_pos(pos jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  lat numeric;
  lng numeric;
begin
  if jsonb_typeof(pos) is distinct from 'array' or jsonb_array_length(pos) <> 2 then
    return false;
  end if;
  lat := (pos->>0)::numeric;
  lng := (pos->>1)::numeric;
  return lat between 45.99 and 46.18 and lng between -64.91 and -64.63;
exception when others then
  return false;
end;
$$;

alter table routes drop constraint if exists routes_points_valid;
alter table routes add constraint routes_points_valid
  check (is_valid_route_points(points));

alter table stops drop constraint if exists stops_pos_valid;
alter table stops add constraint stops_pos_valid
  check (is_valid_stop_pos(pos));

-- ─── Rate limiting sur les soumissions ───────────────────────────────────────
-- Plafond généreux pour ne jamais gêner un citoyen réel qui corrige/refait son
-- tracé plusieurs fois, mais qui bloque un script en boucle. Limite par user_id
-- uniquement (pas d'IP côté Postgres) — un contournement par création de comptes
-- anonymes multiples reste possible, à traiter séparément si ça devient un
-- problème observé (ex. captcha, throttling côté Edge Function).
create or replace function enforce_submission_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
    from submissions
    where user_id = new.user_id
      and created_at > now() - interval '1 hour';

  if recent_count >= 30 then
    raise exception 'Trop de soumissions récentes — réessayez plus tard.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_submission_rate_limit on submissions;
create trigger trg_submission_rate_limit
  before insert on submissions
  for each row
  execute function enforce_submission_rate_limit();
