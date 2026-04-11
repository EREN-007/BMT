import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fireSubmissionConfirmation } from '@/lib/participation'

interface FormData {
  nom: string
  prenom: string
  adresse: string
  email: string
  suggestion: string
}

const EMPTY: FormData = { nom: '', prenom: '', adresse: '', email: '', suggestion: '' }

function Page4Form() {
  const navigate = useNavigate()
  const [form, setForm]       = useState<FormData>(EMPTY)
  const [sent, setSent]       = useState(false)
  const [errors, setErrors]   = useState<Partial<FormData>>({})

  const set = (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))

  const validate = (): boolean => {
    const e: Partial<FormData> = {}
    if (!form.nom.trim())       e.nom       = 'Requis'
    if (!form.prenom.trim())    e.prenom    = 'Requis'
    if (!form.adresse.trim())   e.adresse   = 'Requis'
    if (!form.email.trim())     e.email     = 'Requis'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                                e.email     = 'Courriel invalide'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSent(true)
    // Notification de confirmation si permission accordée
    fireSubmissionConfirmation('fr')
  }

  if (sent) {
    return (
      <div className="f4-root">
        <div className="f4-success">
          <div className="f4-success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
          </div>
          <h2 className="f4-success-title">Merci !</h2>
          <p className="f4-success-sub">
            Votre suggestion a bien été reçue.<br/>
            <span>Thank you! Your suggestion has been received.</span>
          </p>
          <button className="f4-results-btn" onClick={() => navigate('/results')}>
            Voir la carte citoyenne →
          </button>
          <button className="f4-back-btn" onClick={() => navigate('/map')}>
            ← Retour à la carte
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="f4-root">
      <div className="f4-card">

        {/* Header */}
        <div className="f4-header">
          <button className="f4-back" onClick={() => navigate('/map')} title="Retour">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div className="f4-header-text">
            <h1 className="f4-title">Vos informations</h1>
            <p className="f4-subtitle">Your information</p>
          </div>
          <div className="f4-logo">BMT</div>
        </div>

        {/* Form */}
        <form className="f4-form" onSubmit={handleSubmit} noValidate>

          <div className="f4-row">
            <div className="f4-field">
              <label className="f4-label">Nom <span>/ Last name</span></label>
              <input
                className={`f4-input ${errors.nom ? 'f4-input-error' : ''}`}
                type="text"
                placeholder="Tremblay"
                value={form.nom}
                onChange={set('nom')}
              />
              {errors.nom && <span className="f4-error">{errors.nom}</span>}
            </div>

            <div className="f4-field">
              <label className="f4-label">Prénom <span>/ First name</span></label>
              <input
                className={`f4-input ${errors.prenom ? 'f4-input-error' : ''}`}
                type="text"
                placeholder="Marie"
                value={form.prenom}
                onChange={set('prenom')}
              />
              {errors.prenom && <span className="f4-error">{errors.prenom}</span>}
            </div>
          </div>

          <div className="f4-field">
            <label className="f4-label">Adresse <span>/ Address</span></label>
            <input
              className={`f4-input ${errors.adresse ? 'f4-input-error' : ''}`}
              type="text"
              placeholder="123 rue Main, Moncton, NB"
              value={form.adresse}
              onChange={set('adresse')}
            />
            {errors.adresse && <span className="f4-error">{errors.adresse}</span>}
          </div>

          <div className="f4-field">
            <label className="f4-label">Courriel <span>/ Email</span></label>
            <input
              className={`f4-input ${errors.email ? 'f4-input-error' : ''}`}
              type="email"
              placeholder="marie@exemple.ca"
              value={form.email}
              onChange={set('email')}
            />
            {errors.email && <span className="f4-error">{errors.email}</span>}
          </div>

          <div className="f4-field">
            <label className="f4-label">Suggestion <span>/ Suggestion</span></label>
            <textarea
              className="f4-textarea"
              placeholder="Décrivez votre suggestion de ligne de bus… / Describe your bus route suggestion…"
              value={form.suggestion}
              onChange={set('suggestion')}
              rows={4}
            />
          </div>

          <button className="f4-submit" type="submit">
            <span>Envoyer / Send</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>

        </form>
      </div>
    </div>
  )
}

export default Page4Form
