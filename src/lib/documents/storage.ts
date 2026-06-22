import { supabase } from '../supabase'
import { DocumentRow, DocumentType } from './types'

const BUCKET = 'documents'

export async function listDocuments(): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as DocumentRow[]
}

async function insertDocument(row: {
  title: string; type: DocumentType
  storage_path?: string | null; source_url?: string | null; description?: string | null
}): Promise<DocumentRow> {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('documents')
    .insert({ ...row, created_by: userData.user?.id ?? null })
    .select()
    .single()
  if (error) throw error
  return data as DocumentRow
}

// pdf / image — upload du fichier vers le bucket Storage `documents`, puis ligne
// `documents` référençant le chemin. Jina embarque directement le pdf/l'image
// (pas d'extraction de texte côté client) — voir supabase/functions/process-document.
export async function uploadFileDocument(file: File, title: string, type: DocumentType): Promise<DocumentRow> {
  const path = `${crypto.randomUUID()}-${file.name}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
  if (uploadError) throw uploadError
  const doc = await insertDocument({ title, type, storage_path: path })
  await triggerProcessing(doc.id)
  return doc
}

// link / html — pas de fichier, juste une URL ; le texte est récupéré côté serveur
// (Edge Function) pour éviter les soucis CORS d'un fetch direct depuis le navigateur.
export async function createLinkDocument(title: string, url: string): Promise<DocumentRow> {
  const doc = await insertDocument({ title, type: 'link', source_url: url })
  await triggerProcessing(doc.id)
  return doc
}

// vidéo — phase 1 : pas de transcription, l'admin décrit le contenu et c'est ce
// texte qui est embedé (cf. handoff.md, semaine 3).
export async function createVideoDocument(title: string, description: string): Promise<DocumentRow> {
  const doc = await insertDocument({ title, type: 'video', description })
  await triggerProcessing(doc.id)
  return doc
}

export async function deleteDocument(doc: DocumentRow): Promise<void> {
  if (doc.storage_path) {
    await supabase.storage.from(BUCKET).remove([doc.storage_path])
  }
  const { error } = await supabase.from('documents').delete().eq('id', doc.id)
  if (error) throw error
}

export async function triggerProcessing(documentId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('process-document', { body: { documentId } })
  if (error) throw error
}
