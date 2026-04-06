import React, { useState } from 'react'

type FormState = {
  firstName: string
  lastName: string
  email: string
  phone: string
}

function FormPage4() {
  const [form, setForm] = useState<FormState>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  })

  const onChange = (e: any) => {
    const { name, value } = e.target as HTMLInputElement
    setForm({ ...form, [name]: value } as FormState)
  }

  const onSubmit = (e: any) => {
    e.preventDefault()
    alert(`Form submitted: ${JSON.stringify(form, null, 2)}`)
  }

  return (
    <section className="section">
      <h2>Formulaire - Page 4</h2>
      <form onSubmit={onSubmit} className="form">
        <label>
          <span>Prénom</span>
          <input name="firstName" value={form.firstName} onChange={onChange} required />
        </label>
        <label>
          <span>Nom</span>
          <input name="lastName" value={form.lastName} onChange={onChange} required />
        </label>
        <label>
          <span>Email</span>
          <input type="email" name="email" value={form.email} onChange={onChange} required />
        </label>
        <label>
          <span>Téléphone</span>
          <input name="phone" value={form.phone} onChange={onChange} />
        </label>
        <button className="btn" type="submit">Envoyer</button>
      </form>
    </section>
  )
}

export default FormPage4
