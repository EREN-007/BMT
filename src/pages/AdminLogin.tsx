import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLang, ADMIN_T } from '@/lib/lang'

interface Props {
  onAuth: () => void
}

function AdminLogin({ onAuth }: Props) {
  const navigate = useNavigate()
  const lang     = getLang()
  const t        = ADMIN_T[lang]

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError(t.loginErrFill)
      return
    }

    setLoading(true)

    setTimeout(() => {
      setLoading(false)
      if (
        (username.trim().toLowerCase() === 'admin' || username.trim().toLowerCase() === 'admin@bmt.ca') &&
        password === 'bmt2024'
      ) {
        onAuth()
        navigate('/dashboard')
      } else {
        setError(t.loginErrCreds)
      }
    }, 900)
  }

  return (
    <div className="al-root">
      <div className="al-card">

        {/* Logo */}
        <div className="al-brand">
          <div className="al-brand-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <h1 className="al-title">{t.loginTitle}</h1>
            <p className="al-subtitle">BMT · CME — Grand Moncton</p>
          </div>
        </div>

        <p className="al-instructions">
          {t.loginInstr}<br/>
          <span>{t.loginInstrSub}</span>
        </p>

        {/* Form */}
        <form className="al-form" onSubmit={handleSubmit} noValidate>

          <div className="al-field">
            <label className="al-label">{t.loginUser}</label>
            <div className="al-input-wrap">
              <svg className="al-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <input
                className="al-input"
                type="text"
                placeholder="admin"
                value={username}
                onChange={e => { setUsername(e.target.value); setError('') }}
                autoComplete="username"
                autoFocus
              />
            </div>
          </div>

          <div className="al-field">
            <label className="al-label">{t.loginPass}</label>
            <div className="al-input-wrap">
              <svg className="al-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                className="al-input"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="al-eye"
                onClick={() => setShowPass(v => !v)}
                title={showPass ? t.loginHide : t.loginShow}
              >
                {showPass ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="al-error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <button className="al-submit" type="submit" disabled={loading}>
            {loading ? (
              <span className="al-spinner" />
            ) : (
              <>
                <span>{t.loginBtn}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </>
            )}
          </button>

        </form>

        <p className="al-hint">
          {t.loginHint}<br/>
          <span>{t.loginHintSub}</span>
        </p>

      </div>
    </div>
  )
}

export default AdminLogin
