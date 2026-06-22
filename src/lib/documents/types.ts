export type DocumentType   = 'pdf' | 'video' | 'link' | 'html' | 'image'
export type DocumentStatus = 'pending' | 'processing' | 'done' | 'error'

export interface DocumentRow {
  id:            string
  title:         string
  type:          DocumentType
  storage_path:  string | null
  source_url:    string | null
  description:   string | null
  status:        DocumentStatus
  error_message: string | null
  created_at:    string
  processed_at:  string | null
}

// Dimension des embeddings Jina v4 utilisée par la table document_chunks
// (supabase/migrations/0006_documents_rag.sql) et l'Edge Function process-document.
export const EMBEDDING_DIM = 1024
