import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import api from '../api/axiosInstance'

const fieldClass = 'min-h-11 w-full rounded-md border border-[#dce4dd] bg-[#f8faf7] px-3 text-sm text-[#273b35] outline-none'
const editableClass = 'min-h-11 w-full rounded-md border border-[#cbd6ce] bg-white px-3 text-sm text-[#273b35] outline-none transition focus:border-[#1e5144] focus:ring-2 focus:ring-[#1e5144]/15'
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })
const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })

function formatDate(value) {
  return value ? dateFormatter.format(new Date(`${value}T00:00:00.000Z`)) : 'Not set'
}

function InvoiceDetailsDialog({ invoiceId, isManager, onClose, onUpdated }) {
  const [invoice, setInvoice] = useState(null)
  const [agents, setAgents] = useState([])
  const [clients, setClients] = useState([])
  const [values, setValues] = useState({ status: 'unpaid', dueDate: '', salesAgentId: '', clientMode: 'manual', clientId: '', clientName: '', amount: '', issueDate: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    const relatedRequest = isManager
      ? api.get('/invoices/agents', { signal: controller.signal })
      : api.get('/clients', { signal: controller.signal })
    Promise.all([api.get(`/invoices/${invoiceId}`, { signal: controller.signal }), relatedRequest])
      .then(([invoiceResponse, relatedResponse]) => {
        const nextInvoice = invoiceResponse.data.invoice
        setInvoice(nextInvoice)
        if (isManager) setAgents(relatedResponse.data.agents)
        else setClients(relatedResponse.data.clients)
        setValues({
          status: nextInvoice.status,
          dueDate: nextInvoice.due_date || '',
          salesAgentId: String(nextInvoice.user_id),
          clientMode: !isManager && nextInvoice.client_id && relatedResponse.data.clients.some((client) => client.id === nextInvoice.client_id) ? 'existing' : 'manual',
          clientId: String(nextInvoice.client_id || ''),
          clientName: nextInvoice.client_name,
          amount: String(nextInvoice.amount_cents / 100),
          issueDate: nextInvoice.issue_date,
        })
      })
      .catch((requestError) => {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message || 'Unable to load invoice details.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [invoiceId, isManager])

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')

    try {
      const updates = {
        status: values.status,
        dueDate: values.dueDate || null,
      }
      if (isManager) {
        updates.salesAgentId = Number(values.salesAgentId)
      } else {
        updates.clientId = values.clientMode === 'existing' ? Number(values.clientId) : null
        updates.clientName = values.clientMode === 'manual' ? values.clientName.trim() : ''
        updates.amount = Number(values.amount)
        updates.issueDate = values.issueDate
      }
      await api.patch(`/invoices/${invoiceId}`, updates)
      onUpdated()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update this invoice.')
    } finally {
      setSaving(false)
    }
  }

  const selectedAgent = agents.find((agent) => String(agent.id) === values.salesAgentId)
  const visibleInvoiceNumber = invoice && selectedAgent && invoice.user_id !== selectedAgent.id
    ? `${selectedAgent.agent_code}${invoice.invoice_number.slice(4)}`
    : invoice?.invoice_number ?? ''

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#172b28]/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section aria-labelledby="invoice-dialog-title" aria-modal="true" className="dialog-enter max-h-[92svh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#dce4dd] bg-[#f8faf7] shadow-[0_20px_70px_rgba(23,43,40,0.24)]" role="dialog">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e1e8e2] bg-[#f8faf7] px-5 py-4 sm:px-7">
          <div>
            <p className="font-mono text-[10px] text-[#7f8c84]">INVOICE DETAILS</p>
            <h2 className="mt-1 text-lg font-bold text-[#172b28]" id="invoice-dialog-title">{invoice?.invoice_number ?? 'Invoice'}</h2>
          </div>
          <button aria-label="Close invoice details" autoFocus className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[#68766f] transition hover:bg-[#eaf0eb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1e5144]" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {loading && <p className="px-6 py-10 text-center text-sm text-[#829087]" role="status">Loading invoice…</p>}
        {!loading && invoice && <form className="space-y-5 px-5 py-5 sm:px-7 sm:py-6" onSubmit={save}>
          {error && <p className="rounded-md border border-[#edc9c0] bg-[#fff0eb] px-3 py-2.5 text-sm text-[#a34435]" role="alert">{error}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="detail-invoice-number">
              Invoice number
              <input className={`${fieldClass} font-mono tracking-[0.08em]`} id="detail-invoice-number" readOnly value={visibleInvoiceNumber} />
              <span className="block text-[10px] font-normal text-[#829087]">The four-digit agent reference updates when reassigned.</span>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="detail-client-name">
              Client
              {isManager
                ? <input className={fieldClass} id="detail-client-name" readOnly value={invoice.client_name} />
                : <div className="space-y-2">
                  <div aria-label="Invoice client source" className="inline-flex rounded-md border border-[#cbd6ce] bg-white p-1" role="group">
                    <button aria-pressed={values.clientMode === 'existing'} className={`min-h-8 rounded px-3 text-xs font-semibold ${values.clientMode === 'existing' ? 'bg-[#1e5144] text-white' : 'text-[#64736b]'}`} onClick={() => setValues((current) => ({ ...current, clientMode: 'existing' }))} type="button">Existing client</button>
                    <button aria-pressed={values.clientMode === 'manual'} className={`min-h-8 rounded px-3 text-xs font-semibold ${values.clientMode === 'manual' ? 'bg-[#1e5144] text-white' : 'text-[#64736b]'}`} onClick={() => setValues((current) => ({ ...current, clientMode: 'manual' }))} type="button">Enter a name</button>
                  </div>
                  {values.clientMode === 'existing'
                    ? <select className={editableClass} id="detail-client-select" onChange={(event) => setValues((current) => ({ ...current, clientId: event.target.value }))} required value={values.clientId}>
                      <option value="">Select a client</option>
                      {clients.map((client) => <option key={client.id} value={client.id}>{client.shop_name} · {client.first_name} {client.last_name}</option>)}
                    </select>
                    : <input autoComplete="organization" className={editableClass} id="detail-client-name" maxLength={120} onChange={(event) => setValues((current) => ({ ...current, clientName: event.target.value }))} required value={values.clientName} />}
                </div>}
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="detail-amount">
              Amount
              {isManager
                ? <input className={fieldClass} id="detail-amount" readOnly value={currency.format(invoice.amount_cents / 100)} />
                : <input className={editableClass} id="detail-amount" min="0.01" onChange={(event) => setValues((current) => ({ ...current, amount: event.target.value }))} required step="0.01" type="number" value={values.amount} />}
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="detail-issue-date">
              Issue date
              {isManager
                ? <input className={fieldClass} id="detail-issue-date" readOnly value={formatDate(invoice.issue_date)} />
                : <input className={editableClass} id="detail-issue-date" onChange={(event) => setValues((current) => ({ ...current, issueDate: event.target.value }))} required type="date" value={values.issueDate} />}
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="detail-created-at">
              Created
              <input className={fieldClass} id="detail-created-at" readOnly value={new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(`${invoice.created_at.replace(' ', 'T')}Z`))} />
            </label>
            {isManager && <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="detail-sales-agent">
              Sales agent
              <select className={editableClass} id="detail-sales-agent" onChange={(event) => setValues((current) => ({ ...current, salesAgentId: event.target.value }))} value={values.salesAgentId}>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.username} · {agent.agent_code}</option>)}
              </select>
            </label>}
            <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="detail-due-date">
              Due date
              <input className={editableClass} id="detail-due-date" onChange={(event) => setValues((current) => ({ ...current, dueDate: event.target.value }))} type="date" value={values.dueDate} />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="detail-status">
              Status
              <select className={editableClass} id="detail-status" onChange={(event) => setValues((current) => ({ ...current, status: event.target.value }))} value={values.status}>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t border-[#e1e8e2] pt-4">
            <button className="min-h-10 rounded-md px-4 text-sm font-semibold text-[#68766f] transition hover:bg-[#eaf0eb]" onClick={onClose} type="button">Cancel</button>
            <button className="min-h-10 rounded-md bg-[#1e5144] px-4 text-sm font-bold text-white transition hover:bg-[#163d35] disabled:cursor-wait disabled:opacity-60" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>}
        {!loading && !invoice && <div className="px-6 py-8 text-sm text-[#829087]">{error || 'Invoice not found.'}</div>}
      </section>
    </div>
  )
}

export default InvoiceDetailsDialog