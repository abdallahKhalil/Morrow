import { useEffect, useState } from 'react'
import { Dices, X } from 'lucide-react'
import api from '../api/axiosInstance'

const inputClass = 'min-h-11 w-full rounded-md border border-[#cbd6ce] bg-white px-3 text-sm text-[#273b35] outline-none transition focus:border-[#1e5144] focus:ring-2 focus:ring-[#1e5144]/15'

function todayString() {
  const today = new Date()
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 10)
}

function InvoiceForm({ isManager, user, onCancel, onCreated }) {
  const [values, setValues] = useState(() => ({
    invoiceNumber: '',
    clientName: '',
    clientId: '',
    amount: '',
    status: 'unpaid',
    issueDate: todayString(),
    dueDate: '',
    salesAgentId: '',
  }))
  const [agents, setAgents] = useState([])
  const [clients, setClients] = useState([])
  const [clientMode, setClientMode] = useState('existing')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingAgents, setLoadingAgents] = useState(isManager)
  const [loadingClients, setLoadingClients] = useState(true)
  const [generatedNumber, setGeneratedNumber] = useState(false)

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

  useEffect(() => {
    const controller = new AbortController()
    api.get('/clients', { signal: controller.signal })
      .then((response) => setClients(response.data.clients))
      .catch((requestError) => {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message || 'Unable to load clients.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingClients(false)
      })

    return () => controller.abort()
  }, [])

  function update(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }))
    setError('')
  }

  function updateSalesAgent(event) {
    const nextAgentId = event.target.value
    const selectedAgent = agents.find((agent) => String(agent.id) === nextAgentId)
    setValues((current) => ({
      ...current,
      salesAgentId: nextAgentId,
      invoiceNumber: generatedNumber && selectedAgent
        ? `${selectedAgent.agent_code}${current.invoiceNumber.slice(4)}`
        : current.invoiceNumber,
    }))
    setError('')
  }

  function selectClientMode(nextMode) {
    setClientMode(nextMode)
    setError('')
  }

  function generateInvoiceNumber() {
    const selectedAgent = isManager
      ? agents.find((agent) => String(agent.id) === values.salesAgentId)
      : user
    if (!selectedAgent?.agent_code) {
      setError(isManager ? 'Select a sales agent before generating an invoice number.' : 'Your sales agent reference is unavailable.')
      return
    }

    const digits = Array.from(crypto.getRandomValues(new Uint8Array(12)), (digit) => digit % 10).join('')
    setValues((current) => ({ ...current, invoiceNumber: `${selectedAgent.agent_code}${digits}` }))
    setGeneratedNumber(true)
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    const assignedAgent = isManager
      ? agents.find((agent) => String(agent.id) === values.salesAgentId)
      : user
    if (!assignedAgent?.agent_code || !/^\d{16}$/.test(values.invoiceNumber) || !values.invoiceNumber.startsWith(assignedAgent.agent_code)) {
      setError('Generate a 16-digit invoice number for the selected sales agent.')
      return
    }
    if (clientMode === 'existing' && !values.clientId) {
      setError('Select an existing client or enter a client name.')
      return
    }
    if (clientMode === 'manual' && !values.clientName.trim()) {
      setError('Enter a client name.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await api.post('/invoices', {
        ...values,
        clientId: clientMode === 'existing' ? Number(values.clientId) : null,
        clientName: clientMode === 'manual' ? values.clientName.trim() : '',
        amount: Number(values.amount),
        dueDate: values.dueDate || null,
        salesAgentId: isManager ? Number(values.salesAgentId) : undefined,
      })
      onCreated()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to create this invoice. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="new-invoice-title" className="rounded-lg border border-[#cbd9ce] bg-[#edf4ee] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] text-[#6c8375]">INVOICE DETAILS</p>
          <h2 className="mt-1 text-base font-bold text-[#172b28]" id="new-invoice-title">New invoice</h2>
        </div>
        <button aria-label="Close invoice form" className="grid h-9 w-9 place-items-center rounded-md text-[#68766f] transition hover:bg-white hover:text-[#172b28] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1e5144]" onClick={onCancel} type="button">
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      {error && <p className="mt-4 rounded-md border border-[#edc9c0] bg-[#fff0eb] px-3 py-2 text-sm text-[#a34435]" role="alert">{error}</p>}
      <form className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submit}>
        {isManager && <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="invoice-sales-agent">
          Sales agent
          <select className={inputClass} disabled={loadingAgents} id="invoice-sales-agent" name="salesAgentId" onChange={updateSalesAgent} required value={values.salesAgentId}>
            <option value="">{loadingAgents ? 'Loading sales agents…' : 'Select a sales agent'}</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.username} · {agent.agent_code}</option>)}
          </select>
        </label>}
        <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="invoice-number">
          Invoice number
          <span className="relative block">
            <input autoComplete="off" className={`${inputClass} pr-12 font-mono tracking-[0.08em]`} id="invoice-number" inputMode="numeric" maxLength={16} minLength={16} name="invoiceNumber" onChange={(event) => { setGeneratedNumber(false); update(event) }} pattern="[0-9]{16}" placeholder="16 digits" required value={values.invoiceNumber} />
            <button aria-label="Generate invoice number" className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-md text-[#52655b] transition hover:bg-[#edf4ee] hover:text-[#1e5144] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1e5144]" onClick={generateInvoiceNumber} title="Generate invoice number" type="button">
              <Dices aria-hidden="true" size={17} />
            </button>
          </span>
          <span className="block pt-1 text-[10px] font-normal text-[#829087]">16 digits · first four identify the sales agent</span>
        </label>
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-[#52655b]">Client</span>
          <div aria-label="Invoice client source" className="inline-flex rounded-md border border-[#cbd6ce] bg-white p-1" role="group">
            <button aria-pressed={clientMode === 'existing'} className={`min-h-8 rounded px-3 text-xs font-semibold transition ${clientMode === 'existing' ? 'bg-[#1e5144] text-white' : 'text-[#64736b] hover:bg-[#f1f5f1]'}`} onClick={() => selectClientMode('existing')} type="button">Existing client</button>
            <button aria-pressed={clientMode === 'manual'} className={`min-h-8 rounded px-3 text-xs font-semibold transition ${clientMode === 'manual' ? 'bg-[#1e5144] text-white' : 'text-[#64736b] hover:bg-[#f1f5f1]'}`} onClick={() => selectClientMode('manual')} type="button">Enter a name</button>
          </div>
          {clientMode === 'existing'
            ? <select className={inputClass} disabled={loadingClients || clients.length === 0} id="invoice-client-select" name="clientId" onChange={update} required value={values.clientId}>
              <option value="">{loadingClients ? 'Loading clients…' : clients.length ? 'Select a client' : 'No existing clients available'}</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.first_name} {client.last_name} · {client.phone_number}</option>)}
            </select>
            : <input autoComplete="organization" className={inputClass} id="invoice-client" maxLength={120} name="clientName" onChange={update} placeholder="Client or business name" required value={values.clientName} />}
          {clientMode === 'existing' && !loadingClients && clients.length === 0 && <p className="text-[10px] text-[#829087]">No clients yet. Switch to enter a client name.</p>}
        </div>
        <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="invoice-amount">
          Amount (USD)
          <input className={inputClass} id="invoice-amount" min="0.01" name="amount" onChange={update} required step="0.01" type="number" value={values.amount} />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="invoice-issue-date">
          Issue date
          <input className={inputClass} id="invoice-issue-date" name="issueDate" onChange={update} required type="date" value={values.issueDate} />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="invoice-due-date">
          Due date
          <input className={inputClass} id="invoice-due-date" name="dueDate" onChange={update} type="date" value={values.dueDate} />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-[#52655b]" htmlFor="invoice-status">
          Status
          <select className={inputClass} id="invoice-status" name="status" onChange={update} value={values.status}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#1e5144] px-4 text-sm font-bold text-white transition hover:bg-[#163d35] disabled:cursor-wait disabled:opacity-60" disabled={saving} type="submit">
            {saving ? 'Saving invoice…' : 'Save invoice'}
          </button>
          <button className="min-h-10 rounded-md px-4 text-sm font-semibold text-[#68766f] transition hover:bg-white" onClick={onCancel} type="button">Cancel</button>
        </div>
      </form>
    </section>
  )
}

export default InvoiceForm