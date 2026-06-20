import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLang, POSTAL_T } from '@/lib/lang'
import { extractFsa, isValidFsa } from '@/lib/fsa'
import { setPostalCode } from '@/lib/auth'

function PostalCodePage() {
  const navigate = useNavigate()
  const lang     = getLang()
  const t        = POSTAL_T[lang]

  const [value,    setValue]    = useState('')
  const [error,    setError]    = useState('')
  const [outOfZone,setOutOfZone]= useState(false)
  const [saving,   setSaving]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOutOfZone(false)

    if (!value.trim()) {
      setError(t.required)
      return
    }

    const fsa = extractFsa(value)
    if (!/^[A-Z]\d[A-Z]$/.test(fsa)) {
      setError(t.invalidFormat)
      return
    }
    if (!isValidFsa(fsa)) {
      setOutOfZone(true)
      return
    }

    setSaving(true)
    try {
      await setPostalCode(fsa)
      navigate('/map')
    } catch {
      setError(t.invalidFormat)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="f4-root">
      <div className="f4-card">

        <div className="f4-header">
          <div className="f4-header-text">
            <h1 className="f4-title">{t.title}</h1>
            <p className="f4-subtitle">{t.subtitle}</p>
          </div>
          <div className="f4-logo">BMT</div>
        </div>

        <form className="f4-form" onSubmit={handleSubmit} noValidate>
          <p className="f4-subtitle" style={{ marginBottom: '1rem' }}>{t.instr}</p>

          <div className="f4-field">
            <label className="f4-label">{t.label} <span>/ {t.labelSub}</span></label>
            <input
              className={`f4-input ${error || outOfZone ? 'f4-input-error' : ''}`}
              type="text"
              placeholder={t.placeholder}
              value={value}
              onChange={e => { setValue(e.target.value); setError(''); setOutOfZone(false) }}
              autoFocus
            />
            {error && <span className="f4-error">{error}</span>}
          </div>

          {outOfZone && (
            <p className="f4-error" style={{ fontSize: '0.95rem' }}>
              {t.outOfZone}<br/>
              <span style={{ opacity: 0.7 }}>{t.outOfZoneSub}</span>
            </p>
          )}

          <button className="f4-submit" type="submit" disabled={saving}>
            <span>{t.continue}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}

export default PostalCodePage
