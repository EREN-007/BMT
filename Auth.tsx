import React from 'react'

const Auth: React.FC = () => {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    alert(`Auth demo for ${email}`)
  }

  return (
    <section className="section">
      <h2>Authentication</h2>
      <form onSubmit={onSubmit} className="form">
        <label>
          <span>Email</span>
          <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
        </label>
        <button className="btn" type="submit">Sign In</button>
      </form>
    </section>
  )
}

export default Auth
