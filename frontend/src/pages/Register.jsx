import { useState } from 'react'
import { ArrowRight, AtSign, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import InputField from '../components/InputField'
import { useAuth } from '../context/useAuth'

function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({ username: '', email: '', password: '', confirmPassword: '', role: 'sales_agent', managerInviteCode: '' })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }))
    setErrors((current) => ({ ...current, [event.target.name]: '' }))
    setApiError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!values.username.trim()) nextErrors.username = 'Enter a username.'
    if (!values.email.trim()) nextErrors.email = 'Enter your email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) nextErrors.email = 'Enter a valid email address.'
    if (!values.password) nextErrors.password = 'Create a password.'
    else if (values.password.length < 8) nextErrors.password = 'Use at least 8 characters.'
    if (!values.confirmPassword) nextErrors.confirmPassword = 'Confirm your password.'
    else if (values.password !== values.confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.'
    if (values.role === 'manager' && !values.managerInviteCode.trim()) nextErrors.managerInviteCode = 'Enter your manager invitation code.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setSubmitting(true)
    setApiError('')
    try {
      await register(values.username.trim(), values.email.trim(), values.password, values.role, values.managerInviteCode.trim())
      navigate('/login', { replace: true, state: { notice: 'Your account is ready. Sign in to continue.' } })
    } catch (error) {
      setApiError(error.response?.data?.message || 'We could not create your account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="A GOOD PLACE TO BEGIN"
      title="Create your account"
      subtitle="A few details, then you are all set."
      footer={<>Already have an account? <Link className="ml-1 font-bold text-[#1e5144] underline decoration-[#9bb7a3] underline-offset-4 hover:text-[#163d35]" to="/login">Sign in</Link></>}
    >
      {apiError && <div className="mb-5 rounded-md border border-[#edc9c0] bg-[#fff0eb] px-4 py-3 text-sm font-medium text-[#a34435]" role="alert">{apiError}</div>}
      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        <InputField autoComplete="username" error={errors.username} icon={UserRound} id="register-username" label="Username" name="username" onChange={update} placeholder="How should we call you?" value={values.username} />
        <InputField autoComplete="email" error={errors.email} icon={AtSign} id="register-email" label="Email address" name="email" onChange={update} placeholder="you@example.com" value={values.email} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-[#273b35]">Account type</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${values.role === 'sales_agent' ? 'border-[#1e5144] bg-[#edf4ee] text-[#1e5144]' : 'border-[#dce4dd] bg-white text-[#68766f]'}`}>
              <input checked={values.role === 'sales_agent'} className="accent-[#1e5144]" name="role" onChange={update} type="radio" value="sales_agent" />
              Sales agent
            </label>
            <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${values.role === 'manager' ? 'border-[#1e5144] bg-[#edf4ee] text-[#1e5144]' : 'border-[#dce4dd] bg-white text-[#68766f]'}`}>
              <input checked={values.role === 'manager'} className="accent-[#1e5144]" name="role" onChange={update} type="radio" value="manager" />
              Manager
            </label>
          </div>
        </fieldset>
        {values.role === 'manager' && <InputField autoComplete="off" error={errors.managerInviteCode} icon={ShieldCheck} id="manager-invite-code" label="Manager invitation code" name="managerInviteCode" onChange={update} placeholder="Enter your invitation code" type="password" value={values.managerInviteCode} />}
        <InputField autoComplete="new-password" error={errors.password} icon={LockKeyhole} id="register-password" label="Password" name="password" onChange={update} placeholder="At least 8 characters" type="password" value={values.password} />
        <InputField autoComplete="new-password" error={errors.confirmPassword} icon={LockKeyhole} id="register-confirm-password" label="Confirm password" name="confirmPassword" onChange={update} placeholder="Enter it once more" type="password" value={values.confirmPassword} />
        <button className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#1e5144] px-5 text-sm font-bold text-white transition hover:bg-[#163d35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e5144] disabled:cursor-wait disabled:opacity-60" disabled={submitting} type="submit">
          {submitting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Creating account</> : <>Create account <ArrowRight aria-hidden="true" size={16} /></>}
        </button>
      </form>
    </AuthLayout>
  )
}

export default Register