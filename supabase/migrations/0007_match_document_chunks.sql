-- BMT — semaine 4 : recherche par similarité dans le corpus RAG
-- À exécuter après 0006_documents_rag.sql dans le SQL Editor Supabase.
--
-- Ajoute la fonction RPC utilisée par l'Edge Function `generate-report` pour
-- retrouver les passages du corpus les plus pertinents (similarité cosinus
-- pgvector) avant d'appeler Claude. L'ingestion (0006) ne couvrait que
-- l'écriture des chunks/embeddings, pas leur lecture par similarité.
--
-- Exécution réservée à service_role : cette fonction n'est jamais appelée
-- depuis le client (citoyen ou admin), seulement depuis l'Edge Function, qui
-- utilise déjà la clé service_role pour écrire les chunks. On retire donc
-- l'exécution par défaut accordée à anon/authenticated pour qu'un citoyen ne
-- puisse pas lire le contenu du corpus admin via un appel RPC direct.

create or replace function match_document_chunks(
  query_embedding vector(1024),
  match_count      int default 6
)
returns table (
  id              uuid,
  document_id     uuid,
  content         text,
  similarity      float,
  document_title  text,
  document_type   text
)
language sql
stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity,
    d.title as document_title,
    d.type  as document_type
  from document_chunks dc
  join documents d on d.id = dc.document_id
  where dc.embedding is not null
    and d.status = 'done'
  order by dc.embedding <=> query_embedding
  limit match_count
$$;

revoke all on function match_document_chunks(vector(1024), int) from public;
revoke all on function match_document_chunks(vector(1024), int) from anon, authenticated;
grant execute on function match_document_chunks(vector(1024), int) to service_role;
