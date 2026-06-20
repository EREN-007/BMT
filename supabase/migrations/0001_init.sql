-- BMT — schéma initial (semaine 1 du plan handoff.md)
-- À exécuter dans Supabase SQL Editor (ou via `supabase db push` une fois le CLI lié).

create extension if not exists postgis;

-- ─── Rôle admin ──────────────────────────────────────────────────────────────
-- Pas de mot de passe en dur côté client : l'admin est un vrai compte Supabase Auth
-- (email/password), distingué par une ligne dans `admins` plutôt qu'un rôle Postgres
-- custom — plus simple à gérer depuis le dashboard Supabase, et vérifiable via RLS.
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ─── Citoyens ──────────────────────────────────────────────────────────────────
-- Un user = un compte Supabase Auth anonyme (ou email plus tard). On ne stocke que
-- le préfixe FSA du code postal (3 caractères), jamais le code complet, pour limiter
-- la donnée personnelle conservée (cf. section Sécurité du plan).
create table if not exists users (
  id          uuid primary key references auth.users(id) on delete cascade,
  fsa_prefix  text not null check (char_length(fsa_prefix) = 3),
  created_at  timestamptz not null default now()
);

create table if not exists submissions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  submission_number  int not null,
  created_at         timestamptz not null default now(),
  unique (user_id, submission_number)
);

create table if not exists routes (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  points        geography(LineString, 4326) not null,
  color         text not null,
  created_at    timestamptz not null default now()
);

create table if not exists stops (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  pos           geography(Point, 4326) not null,
  type          text not null check (type in ('busstop', 'station')),
  label         text not null,
  created_at    timestamptz not null default now()
);

create table if not exists forms (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  answers       jsonb not null,
  created_at    timestamptz not null default now()
);

-- ─── submission_number auto-incrémenté par user ─────────────────────────────────
create or replace function next_submission_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(submission_number), 0) + 1
    into new.submission_number
    from submissions
    where user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_submission_number on submissions;
create trigger trg_submission_number
  before insert on submissions
  for each row
  execute function next_submission_number();

-- ─── Row Level Security ──────────────────────────────────────────────────────
alter table users        enable row level security;
alter table submissions  enable row level security;
alter table routes       enable row level security;
alter table stops        enable row level security;
alter table forms        enable row level security;
alter table admins       enable row level security;

-- Un citoyen ne touche que ses propres données.
create policy "users select own" on users
  for select using (auth.uid() = id);
create policy "users insert own" on users
  for insert with check (auth.uid() = id);

create policy "submissions select own" on submissions
  for select using (auth.uid() = user_id);
create policy "submissions insert own" on submissions
  for insert with check (auth.uid() = user_id);

create policy "routes select own" on routes
  for select using (
    exists (select 1 from submissions s where s.id = submission_id and s.user_id = auth.uid())
  );
create policy "routes insert own" on routes
  for insert with check (
    exists (select 1 from submissions s where s.id = submission_id and s.user_id = auth.uid())
  );

create policy "stops select own" on stops
  for select using (
    exists (select 1 from submissions s where s.id = submission_id and s.user_id = auth.uid())
  );
create policy "stops insert own" on stops
  for insert with check (
    exists (select 1 from submissions s where s.id = submission_id and s.user_id = auth.uid())
  );

create policy "forms select own" on forms
  for select using (
    exists (select 1 from submissions s where s.id = submission_id and s.user_id = auth.uid())
  );
create policy "forms insert own" on forms
  for insert with check (
    exists (select 1 from submissions s where s.id = submission_id and s.user_id = auth.uid())
  );

-- L'admin (présent dans `admins`) peut tout lire, sur toutes les tables — c'est ce
-- qui remplace l'accès "service_role only" pour la lecture en lecture seule depuis
-- le client admin authentifié, sans jamais exposer la clé service_role au navigateur.
create policy "admin read all submissions" on submissions
  for select using (exists (select 1 from admins a where a.user_id = auth.uid()));
create policy "admin read all routes" on routes
  for select using (exists (select 1 from admins a where a.user_id = auth.uid()));
create policy "admin read all stops" on stops
  for select using (exists (select 1 from admins a where a.user_id = auth.uid()));
create policy "admin read all forms" on forms
  for select using (exists (select 1 from admins a where a.user_id = auth.uid()));
create policy "admin read all users" on users
  for select using (exists (select 1 from admins a where a.user_id = auth.uid()));

create policy "admins self check" on admins
  for select using (auth.uid() = user_id);
