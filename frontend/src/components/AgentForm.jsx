import { useEffect, useState } from 'react'
import { ImagePlus, UserPlus, X } from 'lucide-react'
import api from '../api/axiosInstance'

const inputClass = 'min-h-11 w-full rounded-md border border-[#cbd6ce] bg-white px-3 text-sm text-[#273b35] outline-none transition focus:border-[#1e5144] focus:ring-2 focus:ring-[#1e5144]/15'

function AgentForm({ onCancel, onCreated }) {
  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    idNumber: '',
    email: '',
    password: '',
    commissionPercentage: '0',
  })
  const [photo, setPhoto] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function update(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }))
    setError('')
  }

  function updatePhoto(event) {
    const selectedPhoto = event.target.files?.[0] ?? null
    setError('')
    if (selectedPhoto && !['image/jpeg', 'image/png', 'image/webp'].includes(selectedPhoto.type)) {
      setError('Choose a JPG, PNG, or WebP photo.')
      event.target.value = ''
      setPhoto(null)
      return
    }
    if (selectedPhoto && selectedPhoto.size > 3 * 1024 * 1024) {
      setError('Profile photos must be smaller than 3 MB.')
      event.target.value = ''
      setPhoto(null)
      return
    }
    setPreviewUrl(selectedPhoto ? URL.createObjectURL(selectedPhoto) : '')
    setPhoto(selectedPhoto)
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const payload = new FormData()
    Object.entries(values).forEach(([key, value]) => payload.set(key, value))
    if (photo) payload.set('profilePhoto', photo)

    try {
      await api.post('/agents', payload, { headers: { 'Content-Type': 'multipart/form-data' } })
      onCreated()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to create this sales agent.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="new-agent-title" className="rounded-lg border border-[#cbd9ce] bg-[#edf4ee] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] text-[#6c8375]">TEAM MEMBER</p>
          <h2 className="mt-1 text-base font-bold text-[#172b28]" id="new-agent-title">Create sales agent</h2>
        </div>
        <button aria-label="Close create agent form" className="grid h-9 w-9 place-items-center rounded-md text-[#68766f] transition hover:bg-white hover:text-[#172b28] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1e5144]" onClick={onCancel} type="button">
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      {error && <p className="mt-4 rounded-md border border-[#edc9c0] bg-[#fff0eb] px-3 py-2 text-sm text-[#a34435]" role="alert">{error}</p>}
      <form className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submit}>
        <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="agent-first-name">
          First name <span aria-hidden="true" className="text-[#bb5547]">*</span>
          <input autoComplete="given-name" className={inputClass} id="agent-first-name" maxLength={80} name="firstName" onChange={update} required value={values.firstName} />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="agent-last-name">
          Last name <span aria-hidden="true" className="text-[#bb5547]">*</span>
          <input autoComplete="family-name" className={inputClass} id="agent-last-name" maxLength={80} name="lastName" onChange={update} required value={values.lastName} />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="agent-phone">
          Phone number <span aria-hidden="true" className="text-[#bb5547]">*</span>
          <input autoComplete="tel" className={inputClass} id="agent-phone" maxLength={32} name="phoneNumber" onChange={update} required type="tel" value={values.phoneNumber} />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="agent-email">
          Work email <span aria-hidden="true" className="text-[#bb5547]">*</span>
          <input autoComplete="email" className={inputClass} id="agent-email" name="email" onChange={update} required type="email" value={values.email} />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="agent-initial-password">
          Initial password <span aria-hidden="true" className="text-[#bb5547]">*</span>
          <input autoComplete="new-password" className={inputClass} id="agent-initial-password" minLength={8} name="password" onChange={update} required type="password" value={values.password} />
          <span className="block text-[10px] font-normal text-[#829087]">At least 8 characters</span>
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="agent-commission">
          Commission percentage
          <span className="relative block">
            <input className={`${inputClass} pr-9`} id="agent-commission" max="100" min="0" name="commissionPercentage" onChange={update} required step="0.01" type="number" value={values.commissionPercentage} />
            <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#829087]">%</span>
          </span>
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="agent-id-number">
          ID number <span className="font-normal text-[#829087]">(optional)</span>
          <input autoComplete="off" className={inputClass} id="agent-id-number" maxLength={80} name="idNumber" onChange={update} value={values.idNumber} />
        </label>

        <div className="sm:col-span-2 lg:col-span-3">
          <label className="block text-xs font-semibold text-[#52655b]" htmlFor="agent-photo">Profile photo <span className="font-normal text-[#829087]">(optional · JPG, PNG, WebP · max 3 MB)</span></label>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-[#cbd6ce] bg-white px-3 text-sm font-semibold text-[#354941] transition hover:bg-[#f8faf7]">
              <ImagePlus aria-hidden="true" size={16} /> Choose photo
              <input accept="image/jpeg,image/png,image/webp" className="sr-only" id="agent-photo" onChange={updatePhoto} type="file" />
            </label>
            {previewUrl && <img alt="Selected agent profile preview" className="h-14 w-14 rounded-full border border-[#cbd6ce] object-cover" src={previewUrl} />}
            <span className="text-xs text-[#829087]">{photo?.name ?? 'No photo selected'}</span>
          </div>
        </div>

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#1e5144] px-4 text-sm font-bold text-white transition hover:bg-[#163d35] disabled:cursor-wait disabled:opacity-60" disabled={saving} type="submit">
            <UserPlus aria-hidden="true" size={16} /> {saving ? 'Creating agent…' : 'Create agent'}
          </button>
          <button className="min-h-10 rounded-md px-4 text-sm font-semibold text-[#68766f] transition hover:bg-white" onClick={onCancel} type="button">Cancel</button>
        </div>
      </form>
    </section>
  )
}

export default AgentForm