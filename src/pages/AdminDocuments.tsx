import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLang, ADMIN_T } from '@/lib/lang'
import { DocumentRow, DocumentType, DocumentStatus } from '@/lib/documents/types'
import {
  listDocuments, uploadFileDocument, createLinkDocument, createVideoDocument, deleteDocument,
} from '@/lib/documents/storage'

interface Props {
  onLogout: () => void
}

const STATUS_COLOR: Record<DocumentStatus, string> = {
  pending:    '#f39c12',
  processing: '#3498db',
  done:       '#2ecc71',
  error:      '#e74c3c',
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const t     = ADMIN_T[getLang()]
  const color = STATUS_COLOR[status]
  const label = {
    pending: t.docsStatusPending, processing: t.docsStatusProcessing,
    done: t.docsStatusDone, error: t.docsStatusError,
  }[status]
  return (
    <span className="db-badge" style={{ background: `${color}22`, color, borderColor: `${color}55` }}>
      {label}
    </span>
  )
}

function AdminDocuments({ onLogout }: Props) {
  const navigate = useNavigate()
  const t        = ADMIN_T[getLang()]

  const [docs, setDocs]         = useState<DocumentRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [type, setType]         = useState<DocumentType>('pdf')
  const [title, setTitle]       = useState('')
  const [url, setUrl]           = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile]         = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)

  const refresh = useCallback(() => {
    listDocuments().then(setDocs).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Tant qu'un document est en traitement, on revérifie périodiquement son statut
  // (l'Edge Function process-document tourne de façon asynchrone côté serveur).
  useEffect(() => {
    const hasPending = docs.some(d => d.status === 'pending' || d.status === 'processing')
    if (!hasPending) return
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [docs, refresh])

  const resetForm = () => { setTitle(''); setUrl(''); setDescription(''); setFile(null) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!title.trim()) { setFormError(t.docsFieldsRequired); return }
    if ((type === 'pdf' || type === 'image') && !file) { setFormError(t.docsFieldsRequired); return }
    if (type === 'link' && !url.trim()) { setFormError(t.docsFieldsRequired); return }
    if (type === 'video' && !description.trim()) { setFormError(t.docsFieldsRequired); return }

    setSubmitting(true)
    try {
      if (type === 'pdf' || type === 'image') {
        await uploadFileDocument(file as File, title.trim(), type)
      } else if (type === 'link') {
        await createLinkDocument(title.trim(), url.trim())
      } else {
        await createVideoDocument(title.trim(), description.trim())
      }
      resetForm()
      refresh()
    } catch {
      setFormError(t.docsUploadError)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (doc: DocumentRow) => {
    if (!confirm(t.docsConfirmDelete)) return
    await deleteDocument(doc)
    refresh()
  }

  return (
    <div className="db-root">

      {/* ── Sidebar ── */}
      <aside className="db-sidebar">
        <div className="db-sidebar-brand">
          <span className="db-brand-main">BMT</span>
          <span className="db-brand-sep">·</span>
          <span className="db-brand-main">CME</span>
        </div>
        <p className="db-sidebar-city">Grand Moncton, NB</p>

        <nav className="db-nav">
          <a className="db-nav-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            {t.navDash}
          </a>
          <a className="db-nav-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/carte')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
              <line x1="8" y1="2" x2="8" y2="18"/>
              <line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
            {t.navMap}
          </a>
          <a className="db-nav-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/simulateur')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            {t.navSim}
          </a>
          <a className="db-nav-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/carte-finale')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
            </svg>
            {t.navFinal}
          </a>
          <a className="db-nav-item db-nav-active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            {t.navDocs}
          </a>
        </nav>

        <button className="db-logout" onClick={onLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          {t.navLogout}
        </button>
      </aside>

      {/* ── Main content ── */}
      <main className="db-main">
        <header className="db-topbar">
          <div>
            <h1 className="db-page-title">{t.docsTitle}</h1>
            <p className="db-page-sub">{t.docsSub}</p>
          </div>
        </header>

        <section style={{ padding: '0 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Formulaire d'ajout ── */}
          <div className="db-panel">
            <div className="db-panel-header">
              <h2 className="db-panel-title">{t.docsAddTitle}</h2>
            </div>
            <form className="f4-form" style={{ padding: '16px 20px' }} onSubmit={handleSubmit}>
              <div className="f4-row">
                <div className="f4-field">
                  <label className="f4-label">{t.docsType}</label>
                  <select
                    className="f4-input"
                    value={type}
                    onChange={e => setType(e.target.value as DocumentType)}
                  >
                    <option value="pdf">{t.docsTypePdf}</option>
                    <option value="image">{t.docsTypeImage}</option>
                    <option value="link">{t.docsTypeLink}</option>
                    <option value="video">{t.docsTypeVideo}</option>
                  </select>
                </div>
                <div className="f4-field">
                  <label className="f4-label">{t.docsTitleField}</label>
                  <input className="f4-input" value={title} onChange={e => setTitle(e.target.value)} />
                </div>
              </div>

              {(type === 'pdf' || type === 'image') && (
                <div className="f4-field">
                  <label className="f4-label">{t.docsFile}</label>
                  <input
                    className="f4-input"
                    type="file"
                    accept={type === 'pdf' ? 'application/pdf' : 'image/*'}
                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              )}

              {type === 'link' && (
                <div className="f4-field">
                  <label className="f4-label">{t.docsUrl}</label>
                  <input className="f4-input" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
                </div>
              )}

              {type === 'video' && (
                <div className="f4-field">
                  <label className="f4-label">{t.docsDescription}</label>
                  <textarea className="f4-textarea" value={description} onChange={e => setDescription(e.target.value)} rows={4} />
                </div>
              )}

              {formError && <span className="f4-error">{formError}</span>}

              <button className="f4-submit" type="submit" disabled={submitting}>
                {submitting ? t.docsUploading : t.docsSubmit}
              </button>
            </form>
          </div>

          {/* ── Liste des documents ── */}
          <div className="db-panel">
            <div className="db-panel-header">
              <h2 className="db-panel-title">{t.docsListTitle} <span>({docs.length})</span></h2>
              <button className="db-filter-btn" onClick={refresh} type="button">{t.docsRefresh}</button>
            </div>
            <div className="db-table-wrap">
              {loading ? null : docs.length === 0 ? (
                <p style={{ padding: '16px 20px', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>{t.docsEmpty}</p>
              ) : (
                <table className="db-table">
                  <thead>
                    <tr>
                      <th>{t.docsTitleField}</th>
                      <th>{t.docsType}</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map(d => (
                      <tr className="db-table-row" key={d.id}>
                        <td className="db-td-name">{d.title}</td>
                        <td className="db-td-muted">{d.type}</td>
                        <td>
                          <StatusBadge status={d.status} />
                          {d.status === 'error' && d.error_message && (
                            <div style={{ fontSize: '0.65rem', color: 'rgba(231,76,60,0.7)', marginTop: 4, maxWidth: 280 }}>
                              {d.error_message}
                            </div>
                          )}
                        </td>
                        <td>
                          <button
                            className="db-filter-btn"
                            type="button"
                            onClick={() => handleDelete(d)}
                          >
                            {t.docsDelete}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </section>
      </main>
    </div>
  )
}

export default AdminDocuments
