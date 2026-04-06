import React from 'react'
import { Link } from 'react-router-dom'

const Home: React.FC = () => {
  return (
    <section className="section">
      <h1>BMT App (TypeScript PWA + Capacitor)</h1>
      <p>Bienvenue. Choisissez une section :</p>
      <ul className="links">
        <li><Link to="/language">Language Choice</Link></li>
        <li><Link to="/admin-logo">Admin Logo</Link></li>
        <li><Link to="/auth">Auth</Link></li>
        <li><Link to="/form4">Form Page 4</Link></li>
      </ul>
    </section>
  )
}

export default Home
