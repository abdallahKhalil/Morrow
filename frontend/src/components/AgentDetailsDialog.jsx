import { useEffect, useState } from 'react'
import { Ban, Check, Percent, ShieldCheck, UserRound, X } from 'lucide-react'
import api from '../api/axiosInstance'
import { createReportingPeriods } from '../utils/reportingPeriods'

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function formatCreatedAt(value) {
  if (!value) return '—'
  const date = new Date(`${value.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date)
}

function AgentDetailsDialog({ agentId, onClose, onUpdated }) {
  const [agent, setAgent] = useState(null)
  const [commissionPercentage, setCommissionPercentage] = useState('0')
  const [commissionPeriod, setCommissionPeriod] = useState('this-month')
  const [commissionRefresh, setCommissionRefresh] = useState(0)
  const [commissionReport, setCommissionReport] = useState(null)
  const [commissionLoading, setCommissionLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmingBlock, setConfirmingBlock] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api.get(`/agents/${agentId}`, { signal: controller.signal })
      .then((response) => {
        setAgent(response.data.agent)
        setCommissionPercentage(String(response.data.agent.commission_rate_basis_points / 100))
      })
      .catch((requestError) => {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message || 'Unable to load this sales agent.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [agentId])

  useEffect(() => {
    const controller = new AbortController()
    api.get(`/agents/${agentId}/commission`, { params: { period: commissionPeriod }, signal: controller.signal })
      .then((response) => setCommissionReport(response.data))
      .catch((requestError) => {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message || 'Unable to load commission totals.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCommissionLoading(false)
      })
    return () => controller.abort()
  }, [agentId, commissionPeriod, commissionRefresh])

  async function setBlocked(blocked) {
    setSaving(true)
    setError('')
    try {
      const response = await api.patch(`/agents/${agentId}/block`, { blocked })
      setAgent(response.data.agent)
      setConfirmingBlock(false)
      onUpdated()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update this agent account.')
    } finally {
      setSaving(false)
    }
  }

  async function saveCommission(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await api.patch(`/agents/${agentId}`, { commissionPercentage: Number(commissionPercentage) })
      setAgent(response.data.agent)
      setCommissionLoading(true)
      setCommissionRefresh((current) => current + 1)
      onUpdated()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update commission percentage.')
    } finally {
      setSaving(false)
    }
  }

  const fullName = agent ? `${agent.first_name || ''} ${agent.last_name || ''}`.trim() || agent.username : ''
  const blocked = Boolean(agent?.is_blocked)
  const photoUrl = agent?.profile_photo_path
    ? `/uploads/agent-profiles/${encodeURIComponent(agent.profile_photo_path)}`
    : ''
  const commissionPeriods = createReportingPeriods()
  const money = (cents = 0) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#172b28]/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section aria-labelledby="agent-dialog-title" aria-modal="true" className="max-h-[92svh] w-full max-w-xl overflow-y-auto rounded-lg border border-[#dce4dd] bg-[#f8faf7] shadow-[0_20px_70px_rgba(23,43,40,0.24)]" role="dialog">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e1e8e2] bg-[#f8faf7] px-5 py-4 sm:px-7">
          <div>
            <p className="font-mono text-[10px] text-[#7f8c84]">SALES AGENT</p>
            <h2 className="mt-1 text-lg font-bold text-[#172b28]" id="agent-dialog-title">{agent ? fullName : 'Agent details'}</h2>
          </div>
          <button aria-label="Close agent details" autoFocus className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[#68766f] transition hover:bg-[#eaf0eb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1e5144]" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {loading && <p className="px-6 py-10 text-center text-sm text-[#829087]" role="status">Loading agent…</p>}
        {!loading && agent && <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
          {error && <p className="rounded-md border border-[#edc9c0] bg-[#fff0eb] px-3 py-2.5 text-sm text-[#a34435]" role="alert">{error}</p>}

          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-[#e1e8e2] bg-white p-4">
            {photoUrl
              ? <img alt={`${fullName} profile`} className="h-16 w-16 rounded-full border border-[#dce4dd] object-cover" src={photoUrl} />
              : <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-[#e8f0e9] text-[#527264]">{fullName ? <span className="text-lg font-extrabold">{fullName.charAt(0).toUpperCase()}</span> : <UserRound size={22} />}</span>}
            <div className="min-w-0">
              <p className="break-all text-sm font-bold text-[#273b35]">{agent.email}</p>
              <p className="mt-1 font-mono text-xs text-[#7b8981]">Agent reference · {agent.agent_code}</p>
              <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${blocked ? 'bg-[#fbecef] text-[#b6495a]' : 'bg-[#e6f3e9] text-[#286344]'}`}>
                {blocked ? <Ban aria-hidden="true" size={12} /> : <Check aria-hidden="true" size={12} />}
                {blocked ? 'Access blocked' : 'Active'}
              </span>
            </div>
          </div>

          <dl className="grid gap-x-6 gap-y-4 rounded-lg border border-[#e1e8e2] bg-white p-4 sm:grid-cols-2">
            <div><dt className="text-[11px] font-semibold uppercase text-[#829087]">First name</dt><dd className="mt-1 break-words text-sm font-semibold text-[#354941]">{agent.first_name || '—'}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase text-[#829087]">Last name</dt><dd className="mt-1 break-words text-sm font-semibold text-[#354941]">{agent.last_name || '—'}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase text-[#829087]">Phone number</dt><dd className="mt-1 break-words text-sm font-semibold text-[#354941]">{agent.phone_number || '—'}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase text-[#829087]">ID number</dt><dd className="mt-1 break-words text-sm font-semibold text-[#354941]">{agent.id_number || 'Not provided'}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase text-[#829087]">Account created</dt><dd className="mt-1 text-sm font-semibold text-[#354941]">{formatCreatedAt(agent.created_at)}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase text-[#829087]">Invoice access</dt><dd className="mt-1 text-sm font-semibold text-[#354941]">{blocked ? 'Disabled' : 'Enabled'}</dd></div>
          </dl>

          <section aria-labelledby="agent-commission-title" className="rounded-lg border border-[#dce4dd] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#273b35]" id="agent-commission-title">Commission</h3>
                <p className="mt-1 text-xs text-[#829087]">Rate applied to this agent’s invoices.</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-[#52655b]" htmlFor="agent-detail-commission">
                <span className="sr-only">Commission percentage</span>
                <span className="relative block w-28">
                  <input className="min-h-10 w-full rounded-md border border-[#cbd6ce] bg-white px-3 pr-8 text-sm text-[#273b35] outline-none focus:border-[#1e5144] focus:ring-2 focus:ring-[#1e5144]/15" id="agent-detail-commission" max="100" min="0" onChange={(event) => setCommissionPercentage(event.target.value)} required step="0.01" type="number" value={commissionPercentage} />
                  <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#829087]">%</span>
                </span>
                <button className="min-h-10 rounded-md bg-[#1e5144] px-3 text-xs font-bold text-white hover:bg-[#163d35] disabled:opacity-60" disabled={saving} onClick={saveCommission} type="button">Save rate</button>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e9eeea] pt-4">
              <label className="text-xs font-semibold text-[#64736b]" htmlFor="agent-commission-period">EARNINGS PERIOD</label>
              <select className="min-h-9 rounded-md border border-[#cbd6ce] bg-white px-3 text-xs font-semibold text-[#354941] outline-none focus:border-[#1e5144]" id="agent-commission-period" onChange={(event) => { setCommissionLoading(true); setCommissionPeriod(event.target.value) }} value={commissionPeriod}>
                {commissionPeriods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div aria-busy={commissionLoading} className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-md bg-[#eaf5f2] p-3">
                <p className="text-[10px] font-semibold uppercase text-[#68887d]">Paid commission</p>
                <p className="mt-1 text-lg font-extrabold text-[#138c87]">{commissionLoading ? '—' : money(commissionReport?.summary.paid_commission_cents)}</p>
              </div>
              <div className="rounded-md bg-[#fbf1e2] p-3">
                <p className="text-[10px] font-semibold uppercase text-[#977547]">Unpaid commission</p>
                <p className="mt-1 text-lg font-extrabold text-[#ad781e]">{commissionLoading ? '—' : money(commissionReport?.summary.unpaid_commission_cents)}</p>
              </div>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#829087]"><Percent aria-hidden="true" size={12} />Paid totals are earned; unpaid totals are pending.</p>
          </section>

          {confirmingBlock && !blocked && <div className="rounded-md border border-[#edc9c0] bg-[#fff0eb] p-4" role="alertdialog" aria-labelledby="block-agent-confirm-title">
            <h3 className="text-sm font-bold text-[#8f382d]" id="block-agent-confirm-title">Block {fullName}?</h3>
            <p className="mt-1 text-xs leading-5 text-[#8b5b53]">They will be signed out and cannot access their account until unblocked.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button className="min-h-9 rounded-md px-3 text-xs font-semibold text-[#68766f] hover:bg-white" onClick={() => setConfirmingBlock(false)} type="button">Cancel</button>
              <button className="min-h-9 rounded-md bg-[#a84638] px-3 text-xs font-bold text-white hover:bg-[#8f382d] disabled:opacity-60" disabled={saving} onClick={() => setBlocked(true)} type="button">{saving ? 'Blocking…' : 'Confirm block'}</button>
            </div>
          </div>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e8e2] pt-4">
            <p className="flex items-center gap-2 text-xs text-[#829087]"><ShieldCheck aria-hidden="true" size={15} />Account access is enforced by the server.</p>
            {blocked
              ? <button className="min-h-10 rounded-md bg-[#1e5144] px-4 text-sm font-bold text-white transition hover:bg-[#163d35] disabled:opacity-60" disabled={saving} onClick={() => setBlocked(false)} type="button">{saving ? 'Unblocking…' : 'Unblock agent'}</button>
              : !confirmingBlock && <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#edc9c0] px-4 text-sm font-bold text-[#a34435] transition hover:bg-[#fff0eb] disabled:opacity-60" disabled={saving} onClick={() => setConfirmingBlock(true)} type="button"><Ban aria-hidden="true" size={15} />Block agent</button>}
          </div>
        </div>}
        {!loading && !agent && <div className="px-6 py-8 text-sm text-[#829087]">{error || 'Sales agent not found.'}</div>}
      </section>
    </div>
  )
}

export default AgentDetailsDialog