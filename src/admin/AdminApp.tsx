import React from 'react'
import { Routes, Route, Link, Navigate } from 'react-router-dom'

const AdminLogo: React.FC = () => (
  <section className="section">
    <h2>Admin Logo</h2>
    <p>Gestion du logo BMT/CME.</p>
    <div className="logo-card">
      <img src="/icon.svg" alt="BMT" width={96} height={96} />
    </div>
  </section>
)

const Auth: React.FC = () => {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    alert(`Auth admin: ${email}`)
  }

  return (
    <section className="section">
      <h2>Connexion admin</h2>
      <form onSubmit={onSubmit} className="form">
        <label>
          <span>Courriel</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        <label>
          <span>Mot de passe</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </label>
        <button className="btn" type="submit">Se connecter</button>
      </form>
    </section>
  )
}

function AdminApp() {
  return (
    <div className="container">
      <header className="app-header">
        <Link to="/" className="brand">
          <img src="/icon.svg" alt="BMT" />
          <span>BMT Admin</span>
        </Link>
        <nav className="nav">
          <Link to="/">Logo</Link>
          <Link to="/auth">Connexion</Link>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<AdminLogo />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="app-footer">
        <small>© {new Date().getFullYear()} BMT/CME — Grand Moncton, NB</small>
      </footer>
    </div>
  )
}

export default AdminApp
