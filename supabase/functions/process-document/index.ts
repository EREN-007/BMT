// BMT — Edge Function : pipeline d'embedding pour la base de connaissances RAG
// (handoff.md, semaine 3). Déployée manuellement (pas d'accès CLI/identifiants
// Supabase depuis l'environnement de développement) :
//   supabase functions deploy process-document
//   supabase secrets set JINA_API_KEY=...
//
// Fournisseur : Jina AI (jina-embeddings-v4) — gratuit jusqu'à 1M tokens/mois, pas de
// carte de crédit. Choisi pour son support natif multimodal : un pdf/une image est
// envoyé directement en base64 et embedé sans étape séparée d'OCR/captioning.
// Dimension de sortie fixée à 1024 (cf. src/lib/documents/types.ts::EMBEDDING_DIM —
// garder synchronisé si l'une des deux valeurs change).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

const EMBEDDING_DIM = 1024
const JINA_URL = 'https://api.jina.ai/v1/embeddings'
const JINA_API_KEY = Deno.env.get('JINA_API_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function embed(input: Record<string, string>[]): Promise<number[][]> {
  const res = await fetch(JINA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${JINA_API_KEY}` },
    body: JSON.stringify({
      model: 'jina-embeddings-v4',
      task: 'retrieval.passage',
      dimensions: EMBEDDING_DIM,
      input,
    }),
  })
  if (!res.ok) throw new Error(`Jina API ${res.status}: ${await res.text()}`)
  const out = await res.json()
  return out.data.map((d: { embedding: number[] }) => d.embedding)
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Découpage simple par taille fixe (pas de découpage sémantique) — suffisant pour
// une base de connaissances de quelques dizaines de pages en phase 1.
function chunkText(text: string, size = 3000): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks.length > 0 ? chunks : ['']
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  // Vérifie que l'appelant est un admin avant toute écriture — la clé service_role
  // utilisée plus bas contourne RLS, donc ce contrôle est la seule barrière.
  const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData.user) return json({ error: 'unauthorized' }, 401)
  const { data: adminRow } = await authClient
    .from('admins').select('user_id').eq('user_id', userData.user.id).maybeSingle()
  if (!adminRow) return json({ error: 'forbidden' }, 403)

  const admin = createClient(supabaseUrl, serviceKey)

  let documentId: string
  try {
    ({ documentId } = await req.json())
    if (!documentId) throw new Error('documentId manquant')
  } catch {
    return json({ error: 'invalid request body' }, 400)
  }

  const { data: doc, error: docError } = await admin
    .from('documents').select('*').eq('id', documentId).single()
  if (docError || !doc) return json({ error: 'document introuvable' }, 404)

  await admin.from('documents').update({ status: 'processing' }).eq('id', documentId)

  try {
    let chunks: { content: string | null; embedding: number[] }[]

    if (doc.type === 'pdf' || doc.type === 'image') {
      if (!doc.storage_path) throw new Error('storage_path manquant')
      const { data: blob, error: dlError } = await admin.storage.from('documents').download(doc.storage_path)
      if (dlError || !blob) throw new Error(`téléchargement échoué : ${dlError?.message ?? 'inconnu'}`)
      const base64 = encodeBase64(new Uint8Array(await blob.arrayBuffer()))
      const [embedding] = await embed([{ bytes: base64 }])
      chunks = [{ content: null, embedding }]

    } else if (doc.type === 'video') {
      const text = doc.description ?? doc.title
      const [embedding] = await embed([{ text }])
      chunks = [{ content: text, embedding }]

    } else {
      // link / html — récupération côté serveur pour éviter les soucis CORS d'un
      // fetch direct depuis le navigateur admin.
      if (!doc.source_url) throw new Error('source_url manquant')
      const pageRes = await fetch(doc.source_url)
      if (!pageRes.ok) throw new Error(`fetch ${doc.source_url} → ${pageRes.status}`)
      const text = htmlToText(await pageRes.text())
      const pieces = chunkText(text)
      const embeddings = await embed(pieces.map(text => ({ text })))
      chunks = pieces.map((content, i) => ({ content, embedding: embeddings[i] }))
    }

    await admin.from('document_chunks').delete().eq('document_id', documentId)
    const { error: insertError } = await admin.from('document_chunks').insert(
      chunks.map((c, i) => ({ document_id: documentId, chunk_index: i, content: c.content, embedding: c.embedding })),
    )
    if (insertError) throw insertError

    await admin.from('documents')
      .update({ status: 'done', processed_at: new Date().toISOString(), error_message: null })
      .eq('id', documentId)

    return json({ ok: true, chunks: chunks.length })
  } catch (err) {
    await admin.from('documents')
      .update({ status: 'error', error_message: err instanceof Error ? err.message : String(err) })
      .eq('id', documentId)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
