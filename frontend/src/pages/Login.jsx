import { useState } from 'react'
import { ArrowRight, AtSign, LockKeyhole } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import InputField from '../components/InputField'
import { useAuth } from '../context/useAuth'

function Login() {
  const { login } = useAuth()
  const location = useLocation()
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const notice = location.state?.notice

  function update(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }))
    setErrors((current) => ({ ...current, [event.target.name]: '' }))
    setApiError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!values.email.trim()) nextErrors.email = 'Enter your email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) nextErrors.email = 'Enter a valid email address.'
    if (!values.password) nextErrors.password = 'Enter your password.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setSubmitting(true)
    setApiError('')
    try {
      await login(values.email.trim(), values.password)
    } catch (error) {
      setApiError(error.response?.data?.message || 'We could not sign you in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="WELCOME BACK"
      title="Sign in"
      subtitle="Your space is right where you left it."
      footer={<>New to Morrow? <Link className="ml-1 font-bold text-[#1e5144] underline decoration-[#9bb7a3] underline-offset-4 hover:text-[#163d35]" to="/register">Create an account</Link></>}
    >
      {notice && <div className="mb-5 rounded-md border border-[#c8dfce] bg-[#eaf4ec] px-4 py-3 text-sm font-medium text-[#286344]" role="status">{notice}</div>}
      {apiError && <div className="mb-5 rounded-md border border-[#edc9c0] bg-[#fff0eb] px-4 py-3 text-sm font-medium text-[#a34435]" role="alert">{apiError}</div>}
      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        <InputField autoComplete="email" error={errors.email} icon={AtSign} id="login-email" label="Email address" name="email" onChange={update} placeholder="you@example.com" value={values.email} />
        <InputField autoComplete="current-password" error={errors.password} icon={LockKeyhole} id="login-password" label="Password" name="password" onChange={update} placeholder="Your password" type="password" value={values.password} />
        <button className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#1e5144] px-5 text-sm font-bold text-white transition hover:bg-[#163d35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e5144] disabled:cursor-wait disabled:opacity-60" disabled={submitting} type="submit">
          {submitting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Signing in</> : <>Continue <ArrowRight aria-hidden="true" size={16} /></>}
        </button>
      </form>
      <p className="mt-6 text-center text-xs leading-5 text-[#8a968f]">Your account details stay private and are only used to manage your profile.</p>
    </AuthLayout>
  )
}

export default Login