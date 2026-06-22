-- BMT — semaine 3 : base de connaissances RAG (upload de documents + embeddings)
-- À exécuter après 0005_budget_costs.sql dans le SQL Editor Supabase.
--
-- Couvre les items handoff.md "Interface admin d'upload de documents de référence
-- (PDF, vidéo, lien, HTML, image)" et "Pipeline d'embedding : extraction de texte →
-- embeddings → stockage pgvector".
--
-- Ingestion uniquement (cette migration). La recherche par similarité (utilisée par
-- l'agent IA, semaine 4) viendra dans une migration de suivi une fois l'agent posé.
--
-- Fournisseur d'embeddings : Jina AI (jina-embeddings-v4, gratuit jusqu'à 1M tokens/
-- mois, sans carte de crédit) — choisi pour son support natif multimodal (texte +
-- image + PDF directement, sans étape séparée d'OCR/captioning) et multilingue
-- (89 langues dont le français). Dimension choisie : 1024 (compromis taille/qualité,
-- cf. src/lib/documents/types.ts::EMBEDDING_DIM).

create extension if not exists vector;

-- ─── Stockage des fichiers (bucket privé, admin uniquement) ───────────────────
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "admin manage documents bucket" on storage.objects;
create policy "admin manage documents bucket" on storage.objects
  for all using (
    bucket_id = 'documents'
    and exists (select 1 from admins a where a.user_id = auth.uid())
  )
  with check (
    bucket_id = 'documents'
    and exists (select 1 from admins a where a.user_id = auth.uid())
  );

-- ─── documents ──────────────────────────────────────────────────────────────
-- Une ligne par document de référence ajouté par l'admin. `storage_path` pour les
-- fichiers uploadés (pdf/image), `source_url` pour un lien externe (html), `description`
-- sert de contenu à embedder pour le type vidéo en phase 1 (pas de transcription —
-- cf. handoff.md, "métadonnée simple en phase 1 si le temps manque").
create table if not exists documents (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  type           text not null check (type in ('pdf', 'video', 'link', 'html', 'image')),
  storage_path   text,
  source_url     text,
  description    text,
  status         text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  error_message  text,
  created_by     uuid references admins(user_id) on delete set null,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);

-- ─── document_chunks ────────────────────────────────────────────────────────
-- Un document peut produire plusieurs chunks (texte découpé pour les pages html/lien)
-- ou un seul (pdf/image/vidéo embedés en un bloc en phase 1 — cf. process-document).
create table if not exists document_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  chunk_index   int not null default 0,
  content       text,
  embedding     vector(1024),
  created_at    timestamptz not null default now(),
  unique (document_id, chunk_index)
);

alter table documents       enable row level security;
alter table document_chunks enable row level security;

-- Lecture/écriture admin uniquement depuis le client (l'Edge Function de traitement
-- utilise la clé service_role, qui contourne RLS, pour écrire les chunks/embeddings).
drop policy if exists "admin all documents" on documents;
create policy "admin all documents" on documents
  for all using (exists (select 1 from admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from admins a where a.user_id = auth.uid()));

drop policy if exists "admin read document_chunks" on document_chunks;
create policy "admin read document_chunks" on document_chunks
  for select using (exists (select 1 from admins a where a.user_id = auth.uid()));
