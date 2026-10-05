import { useEffect, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import api from '../api/axiosInstance'

const inputClass = 'min-h-11 w-full rounded-md border border-[#cbd6ce] bg-white px-3 text-sm text-[#273b35] outline-none transition focus:border-[#1e5144] focus:ring-2 focus:ring-[#1e5144]/15'

function photoUrl(filename) {
  return filename ? `/uploads/client-shops/${encodeURIComponent(filename)}` : ''
}

function ClientForm({ client, isManager, onCancel, onSaved }) {
  const [values, setValues] = useState({
    shopName: client?.shop_name ?? '',
    firstName: client?.first_name ?? '',
    lastName: client?.last_name ?? '',
    phoneNumber: client?.phone_number ?? '',
    address: client?.address ?? '',
    location: client?.location ?? '',
    assignedAgentId: client?.assigned_agent_id ? String(client.assigned_agent_id) : '',
  })
  const [agents, setAgents] = useState([])
  const [shopPhoto, setShopPhoto] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(photoUrl(client?.shop_photo_path))
  const [error, setError] = useState('')
  const [loadingAgents, setLoadingAgents] = useState(isManager)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!previewUrl.startsWith('blob:')) return undefined
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    if (!isManager) return undefined
    const controller = new AbortController()
    api.get('/invoices/agents', { signal: controller.signal })
      .then((response) => setAgents(response.data.agents))
      .catch((requestError) => {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message || 'Unable to load sales agents.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingAgents(false)
      })
    return () => controller.abort()
  }, [isManager])

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
      return
    }
    if (selectedPhoto && selectedPhoto.size > 3 * 1024 * 1024) {
      setError('Shop photos must be smaller than 3 MB.')
      event.target.value = ''
      return
    }
    setShopPhoto(selectedPhoto)
    setPreviewUrl(selectedPhoto ? URL.createObjectURL(selectedPhoto) : photoUrl(client?.shop_photo_path))
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const payload = new FormData()
    for (const key of ['shopName', 'firstName', 'lastName', 'phoneNumber', 'address', 'location']) {
      payload.set(key, values[key])
    }
    if (isManager) payload.set('assignedAgentId', values.assignedAgentId)
    if (shopPhoto) payload.set('shopPhoto', shopPhoto)

    try {
      const requestOptions = { headers: { 'Content-Type': 'multipart/form-data' } }
      if (client) await api.patch(`/clients/${client.id}`, payload, requestOptions)
      else await api.post('/clients', payload, requestOptions)
      onSaved()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save this client.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      {error && <p className="rounded-md border border-[#edc9c0] bg-[#fff0eb] px-3 py-2.5 text-sm text-[#a34435] sm:col-span-2" role="alert">{error}</p>}
      <label className="space-y-1.5 text-xs font-semibold text-[#52655b] sm:col-span-2" htmlFor="client-shop-name">
        Shop name <span aria-hidden="true" className="text-[#bb5547]">*</span>
        <input autoComplete="organization" className={inputClass} id="client-shop-name" maxLength={120} name="shopName" onChange={update} required value={values.shopName} />
      </label>
      <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="client-first-name">
        First name <span aria-hidden="true" className="text-[#bb5547]">*</span>
        <input autoComplete="given-name" className={inputClass} id="client-first-name" maxLength={80} name="firstName" onChange={update} required value={values.firstName} />
      </label>
      <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="client-last-name">
        Last name <span aria-hidden="true" className="text-[#bb5547]">*</span>
        <input autoComplete="family-name" className={inputClass} id="client-last-name" maxLength={80} name="lastName" onChange={update} required value={values.lastName} />
      </label>
      <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="client-phone">
        Phone number <span aria-hidden="true" className="text-[#bb5547]">*</span>
        <input autoComplete="tel" className={inputClass} id="client-phone" maxLength={32} name="phoneNumber" onChange={update} required type="tel" value={values.phoneNumber} />
      </label>
      <label className="space-y-1.5 text-xs font-semibold text-[#52655b] sm:col-span-2" htmlFor="client-address">
        Address <span aria-hidden="true" className="text-[#bb5547]">*</span>
        <textarea autoComplete="street-address" className={`${inputClass} min-h-20 py-2.5`} id="client-address" maxLength={300} name="address" onChange={update} required rows="2" value={values.address} />
      </label>
      <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="client-location">
        Location <span className="font-normal text-[#829087]">(optional)</span>
        <input autoComplete="address-level2" className={inputClass} id="client-location" maxLength={200} name="location" onChange={update} value={values.location} />
      </label>

      {isManager && <label className="space-y-1.5 text-xs font-semibold text-[#52655b] sm:col-span-2" htmlFor="client-agent">
        Working with <span className="font-normal text-[#829087]">(optional)</span>
        <select className={inputClass} disabled={loadingAgents} id="client-agent" name="assignedAgentId" onChange={update} value={values.assignedAgentId}>
          <option value="">{loadingAgents ? 'Loading agents…' : 'No agent assigned'}</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.first_name && agent.last_name ? `${agent.first_name} ${agent.last_name}` : agent.username} · {agent.agent_code}</option>)}
        </select>
      </label>}

      <div className="sm:col-span-2">
        <label className="block text-xs font-semibold text-[#52655b]" htmlFor="client-shop-photo">Shop photo <span className="font-normal text-[#829087]">(optional · JPG, PNG, WebP · max 3 MB)</span></label>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-[#cbd6ce] bg-white px-3 text-sm font-semibold text-[#354941] transition hover:bg-[#f8faf7]">
            <ImagePlus aria-hidden="true" size={16} /> Choose photo
            <input accept="image/jpeg,image/png,image/webp" className="sr-only" id="client-shop-photo" onChange={updatePhoto} type="file" />
          </label>
          {previewUrl && <img alt="Shop photo preview" className="h-16 w-20 rounded-md border border-[#cbd6ce] object-cover" src={previewUrl} />}
          <span className="text-xs text-[#829087]">{shopPhoto?.name ?? (client?.shop_photo_path ? 'Current shop photo' : 'No photo selected')}</span>
        </div>
      </div>

      {!isManager && <p className="text-xs text-[#829087] sm:col-span-2">This client will be assigned to you.</p>}
      <div className="flex justify-end gap-2 border-t border-[#e1e8e2] pt-4 sm:col-span-2">
        <button className="min-h-10 rounded-md px-4 text-sm font-semibold text-[#68766f] transition hover:bg-[#f1f5f1]" onClick={onCancel} type="button">Cancel</button>
        <button className="min-h-10 rounded-md bg-[#1e5144] px-4 text-sm font-bold text-white transition hover:bg-[#163d35] disabled:cursor-wait disabled:opacity-60" disabled={saving} type="submit">{saving ? 'Saving…' : client ? 'Save client' : 'Create client'}</button>
      </div>
    </form>
  )
}

export default ClientForm