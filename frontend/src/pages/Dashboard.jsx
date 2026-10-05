import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown, CircleDollarSign, Clock3, FilePlus2, FileText, ReceiptText, Search, Users } from 'lucide-react'
import api from '../api/axiosInstance'
import AgentCommissionPanel from '../components/AgentCommissionPanel'
import AgentDetailsDialog from '../components/AgentDetailsDialog'
import AgentForm from '../components/AgentForm'
import ClientManager from '../components/ClientManager'
import InvoiceDetailsDialog from '../components/InvoiceDetailsDialog'
import InvoiceForm from '../components/InvoiceForm'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/useAuth'
import { createReportingPeriods, previousMonthPeriod } from '../utils/reportingPeriods'

const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })

function formatMoney(cents = 0) {
  return currency.format(cents / 100)
}

function formatDate(date) {
  return date ? dateFormatter.format(new Date(`${date}T00:00:00.000Z`)) : '—'
}

function dueDateAlert(invoice) {
  if (invoice.status === 'paid' || !invoice.due_date) return null
  const [year, month, day] = invoice.due_date.split('-').map(Number)
  const dueDate = Date.UTC(year, month - 1, day)
  const now = new Date()
  // Compare date-only values at UTC midnight to avoid local timezone shifting a due day.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const daysUntilDue = Math.round((dueDate - today) / 86400000)
  if (daysUntilDue > 3) return null
  if (daysUntilDue < 0) {
    const overdueDays = Math.abs(daysUntilDue)
    return { tone: 'overdue', agentLabel: `Overdue ${overdueDays} day${overdueDays === 1 ? '' : 's'}`, managerLabel: `Overdue ${overdueDays} day${overdueDays === 1 ? '' : 's'}` }
  }
  return {
    tone: 'soon',
    agentLabel: daysUntilDue === 0 ? 'Due today' : `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`,
    managerLabel: 'Due soon',
  }
}

function DueDateMarker({ alert, isManager }) {
  if (!alert) return null
  const color = alert.tone === 'overdue' ? 'bg-[#fbecef] text-[#a83d4c]' : 'bg-[#fbf0df] text-[#8d641d]'
  return isManager
    ? <span className={`mt-1 inline-flex items-center gap-1 text-[11px] font-bold ${alert.tone === 'overdue' ? 'text-[#a83d4c]' : 'text-[#94651b]'}`}><AlertTriangle aria-hidden="true" size={13} />{alert.managerLabel}</span>
    : <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${color}`}><Clock3 aria-hidden="true" size={12} />{alert.agentLabel}</span>
}

function dueAlertSurface(alert) {
  return alert?.tone === 'overdue'
    ? 'border-l-4 border-l-[#b6495a] bg-[#fff2f3] hover:bg-[#fde7e9]'
    : 'border-l-4 border-l-[#cf8b24] bg-[#fff8e8] hover:bg-[#fff2d9]'
}

function invoiceCountLabel(count) {
  return `${count} invoice${count === 1 ? '' : 's'}`
}

function comparisonLabel(current, previous, isCurrency = false) {
  if (previous === null || previous === undefined) return null
  const difference = current - previous
  if (difference === 0) return { text: 'No change vs previous month', direction: 'same' }
  const amount = isCurrency ? formatMoney(Math.abs(difference)) : invoiceCountLabel(Math.abs(difference))
  return {
    text: `${difference > 0 ? 'Up' : 'Down'} ${amount} vs previous month`,
    direction: difference > 0 ? 'up' : 'down',
  }
}

function Dashboard() {
  const { user } = useAuth()
  const isManager = user?.role === 'manager'
  const today = new Date()
  const periods = createReportingPeriods(today)
  const [period, setPeriod] = useState('this-month')
  const [refreshKey, setRefreshKey] = useState(0)
  const [report, setReport] = useState(null)
  const [previousSummary, setPreviousSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [showAgentForm, setShowAgentForm] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null)
  const selectedPeriod = periods.find((option) => option.value === period)?.label ?? 'This month'
  const comparisonPeriod = previousMonthPeriod(period, today)
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [invoiceStatus, setInvoiceStatus] = useState('all')
  const [invoiceDates, setInvoiceDates] = useState({ issueFrom: '', issueTo: '', dueFrom: '', dueTo: '' })
  const [dateFiltersOpen, setDateFiltersOpen] = useState(false)
  const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(today)
  const summary = report?.summary ?? {
    invoiceCount: 0,
    totalAmountCents: 0,
    paidCount: 0,
    paidAmountCents: 0,
    unpaidCount: 0,
    unpaidAmountCents: 0,
  }
  const invoices = report?.invoices ?? []
  // API dates use YYYY-MM-DD, so string comparisons preserve chronological order.
  const filteredInvoices = invoices.filter((invoice) => {
    if (invoiceStatus !== 'all' && invoice.status !== invoiceStatus) return false
    if (invoiceDates.issueFrom && invoice.issue_date < invoiceDates.issueFrom) return false
    if (invoiceDates.issueTo && invoice.issue_date > invoiceDates.issueTo) return false
    if (invoiceDates.dueFrom && (!invoice.due_date || invoice.due_date < invoiceDates.dueFrom)) return false
    if (invoiceDates.dueTo && (!invoice.due_date || invoice.due_date > invoiceDates.dueTo)) return false
    const query = invoiceQuery.trim().toLowerCase()
    if (!query) return true
    return [invoice.invoice_number, invoice.client_name, invoice.agent_name]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query))
  })

  useEffect(() => {
    const controller = new AbortController()
    const currentRequest = api.get('/invoices', { params: { period }, signal: controller.signal })
    const previousRequest = comparisonPeriod
      ? api.get('/invoices', { params: { period: comparisonPeriod }, signal: controller.signal })
      : Promise.resolve(null)

    Promise.all([currentRequest, previousRequest])
      .then(([response, previousResponse]) => {
        setReport(response.data)
        setPreviousSummary(previousResponse?.data.summary ?? null)
        setError('')
      })
      .catch((requestError) => {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message || 'Unable to load invoice data.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [period, refreshKey, comparisonPeriod])

  const metrics = [
    {
      label: 'Total invoices',
      value: String(summary.invoiceCount),
      detail: `${invoiceCountLabel(summary.invoiceCount)} in this period`,
      comparison: comparisonLabel(summary.invoiceCount, previousSummary?.invoiceCount),
      icon: FileText,
      tone: 'text-[#1677c8] bg-[#eaf4fc]',
    },
    {
      label: 'Total invoiced',
      value: formatMoney(summary.totalAmountCents),
      detail: 'For the selected period',
      comparison: comparisonLabel(summary.totalAmountCents, previousSummary?.totalAmountCents, true),
      icon: ReceiptText,
      tone: 'text-[#bb8214] bg-[#fbf3df]',
    },
    {
      label: 'Paid',
      value: formatMoney(summary.paidAmountCents),
      detail: `${invoiceCountLabel(summary.paidCount)} paid`,
      comparison: comparisonLabel(summary.paidAmountCents, previousSummary?.paidAmountCents, true),
      icon: CircleDollarSign,
      tone: 'text-[#138c87] bg-[#e5f5f2]',
    },
    {
      label: 'Unpaid',
      value: formatMoney(summary.unpaidAmountCents),
      detail: `${invoiceCountLabel(summary.unpaidCount)} outstanding`,
      comparison: comparisonLabel(summary.unpaidAmountCents, previousSummary?.unpaidAmountCents, true),
      icon: CircleDollarSign,
      tone: 'text-[#d25568] bg-[#fbecef]',
      featured: isManager,
    },
  ]

  function changePeriod(event) {
    setLoading(true)
    setError('')
    setPeriod(event.target.value)
  }

  function invoiceCreated() {
    setShowInvoiceForm(false)
    setLoading(true)
    setRefreshKey((current) => current + 1)
  }

  function agentCreated() {
    setShowAgentForm(false)
    setLoading(true)
    setRefreshKey((current) => current + 1)
  }

  function agentUpdated() {
    setLoading(true)
    setRefreshKey((current) => current + 1)
  }

  return (
    <div className="min-h-screen bg-[#f3f6f2]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-9 sm:px-8 sm:pt-12">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="rise-in">
            <p className="font-mono text-[11px] text-[#7c8b82]">{isManager ? 'TEAM INVOICE OVERVIEW' : 'INVOICE OVERVIEW'}</p>
            <h1 className="mt-2 text-[30px] font-extrabold leading-tight text-[#172b28] sm:text-[36px]">{isManager ? 'Manager dashboard' : 'Sales dashboard'}</h1>
            <p className="mt-2 text-sm text-[#718078]">Welcome{user?.username ? `, ${user.username}` : ''}. {isManager ? 'Here is your team invoice summary.' : 'Here is your invoice summary.'}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-col gap-2 sm:items-end">
              <label className="font-mono text-[10px] text-[#7f8c84]" htmlFor="invoice-period">REPORTING PERIOD</label>
              <div className="relative w-full sm:w-56">
                <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#708079]" size={16} />
                <select
                  className="min-h-11 w-full appearance-none rounded-md border border-[#cbd6ce] bg-white py-2 pl-10 pr-9 text-sm font-semibold text-[#354941] outline-none transition focus:border-[#1e5144] focus:ring-2 focus:ring-[#1e5144]/15"
                  id="invoice-period"
                  onChange={changePeriod}
                  value={period}
                >
                  {periods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#708079]">⌄</span>
              </div>
            </div>
            <button aria-expanded={showInvoiceForm} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#1e5144] px-4 text-sm font-bold text-white transition hover:bg-[#163d35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e5144]" onClick={() => setShowInvoiceForm((shown) => !shown)} type="button">
              <FilePlus2 aria-hidden="true" size={17} /> New invoice
            </button>
          </div>
        </div>

        {showInvoiceForm && <div className="expand-down mt-7"><div className="min-h-0 overflow-hidden"><InvoiceForm isManager={isManager} user={user} onCancel={() => setShowInvoiceForm(false)} onCreated={invoiceCreated} /></div></div>}

        {error && <p className="mt-6 rounded-md border border-[#edc9c0] bg-[#fff0eb] px-4 py-3 text-sm font-medium text-[#a34435]" role="alert">{error}</p>}

        <section aria-label={`Invoice totals for ${selectedPeriod}`} aria-busy={loading} className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? metrics.map(({ label }) => (
            <article aria-hidden="true" className="min-w-0 rounded-lg border border-[#dce4dd] bg-white p-5" key={label}>
              <div className="flex items-center justify-between"><span className="h-4 w-28 animate-pulse rounded bg-[#e8eee9]" /><span className="h-9 w-9 animate-pulse rounded-md bg-[#eef3ef]" /></div>
              <div className="mt-5 h-8 w-36 animate-pulse rounded bg-[#e8eee9]" />
              <div className="mt-3 h-3 w-32 animate-pulse rounded bg-[#eef3ef]" />
            </article>
          )) : metrics.map(({ label, value, detail, comparison, icon: Icon, tone, featured }, index) => (
            <article className={`rise-in min-w-0 rounded-lg border p-5 transition-shadow hover:shadow-[0_8px_24px_rgba(23,43,40,0.09)] ${featured ? 'border-[#1e5144] bg-[#1e5144] shadow-[0_8px_24px_rgba(23,43,40,0.13)]' : 'border-[#dce4dd] bg-white shadow-[0_5px_18px_rgba(23,43,40,0.035)]'}`} key={label} style={{ animationDelay: `${index * 70}ms` }}>
              <div className="flex items-center justify-between gap-3">
                <h2 className={`text-sm font-semibold ${featured ? 'text-white/75' : 'text-[#64736b]'}`}>{label}</h2>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${featured ? 'bg-white/12 text-white' : tone}`}><Icon aria-hidden="true" size={18} /></span>
              </div>
              <p className={`mt-5 break-words text-[28px] font-extrabold leading-none ${featured ? 'text-white' : 'text-[#172b28]'}`}>{value}</p>
              <p className={`mt-2 text-xs ${featured ? 'text-white/65' : 'text-[#829087]'}`}>{detail}</p>
              {comparison && <p className={`mt-3 inline-flex items-center gap-1 text-[11px] font-semibold ${featured ? 'text-white/85' : comparison.direction === 'same' ? 'text-[#829087]' : 'text-[#527264]'}`}>
                {comparison.direction === 'up' ? <ArrowUpRight aria-hidden="true" size={14} /> : comparison.direction === 'down' ? <ArrowDownRight aria-hidden="true" size={14} /> : null}
                {comparison.text}
              </p>}
            </article>
          ))}
        </section>

        {!isManager && <AgentCommissionPanel refreshKey={refreshKey} userId={user.id} />}

        {isManager && <>
          <section aria-labelledby="team-title" className="mt-7 rounded-lg border border-[#dce4dd] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e6ece7] px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <Users aria-hidden="true" className="text-[#527264]" size={18} />
                <div>
                  <h2 className="text-base font-bold text-[#172b28]" id="team-title">Sales agent breakdown</h2>
                  <p className="mt-1 text-xs text-[#829087]">Invoice totals by agent for {selectedPeriod.toLowerCase()}.</p>
                </div>
              </div>
              <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#cbd6ce] bg-white px-3 text-xs font-bold text-[#354941] transition hover:border-[#a9c0af] hover:bg-[#f4f8f4]" onClick={() => setShowAgentForm((shown) => !shown)} type="button">
                <Users aria-hidden="true" size={15} /> Create agent
              </button>
            </div>
            {showAgentForm && <div className="rise-in p-5 sm:p-6"><AgentForm onCancel={() => setShowAgentForm(false)} onCreated={agentCreated} /></div>}
                        {showAgentForm && <div className="expand-down"><div className="min-h-0 overflow-hidden p-5 sm:p-6"><AgentForm onCancel={() => setShowAgentForm(false)} onCreated={agentCreated} /></div></div>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#f8faf7] text-[11px] uppercase text-[#7b8981]">
                  <tr><th className="px-5 py-3 font-semibold sm:px-6">Sales agent</th><th className="px-4 py-3 font-semibold">Invoices</th><th className="px-4 py-3 font-semibold">Invoiced</th><th className="px-4 py-3 font-semibold">Paid</th><th className="px-4 py-3 font-semibold">Unpaid</th><th className="px-4 py-3 font-semibold">Account</th></tr>
                </thead>
                <tbody className="divide-y divide-[#e6ece7]">
                  {(report?.teamBreakdown ?? []).map((agent) => (
                    <tr className="transition-colors hover:bg-[#f7faf7]" key={agent.user_id}>
                      <th className="px-5 py-3.5 font-semibold text-[#354941] sm:px-6">
                        <button className="text-left underline decoration-[#b5c8ba] underline-offset-4 hover:text-[#1e5144]" onClick={() => setSelectedAgentId(agent.user_id)} type="button">{`${agent.first_name || ''} ${agent.last_name || ''}`.trim() || agent.username}</button>
                      </th>
                      <td className="px-4 py-3.5 text-[#64736b]">{agent.invoice_count}</td>
                      <td className="px-4 py-3.5 font-semibold text-[#273b35]">{formatMoney(agent.total_amount_cents)}</td>
                      <td className="px-4 py-3.5 text-[#138c87]">{formatMoney(agent.paid_amount_cents)}</td>
                      <td className="px-4 py-3.5 text-[#d25568]">{formatMoney(agent.unpaid_amount_cents)}</td>
                      <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${agent.is_blocked ? 'bg-[#fbecef] text-[#b6495a]' : 'bg-[#e6f3e9] text-[#286344]'}`}>{agent.is_blocked ? 'Blocked' : 'Active'}</span></td>
                    </tr>
                  ))}
                  {!loading && report?.teamBreakdown?.length === 0 && <tr><td className="px-5 py-7 text-center text-sm text-[#829087] sm:px-6" colSpan="6">No sales agents are registered yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          {selectedAgentId !== null && <AgentDetailsDialog agentId={selectedAgentId} onClose={() => setSelectedAgentId(null)} onUpdated={agentUpdated} />}
        </>}

        <ClientManager isManager={isManager} user={user} />

        <section aria-labelledby="activity-title" aria-busy={loading} className="mt-7 rounded-lg border border-[#dce4dd] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ece7] px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-base font-bold text-[#172b28]" id="activity-title">{isManager ? 'Team invoices' : 'My invoices'}</h2>
              <p className="mt-1 text-xs text-[#829087]">{selectedPeriod} · Updated {dateLabel}</p>
            </div>
            <span className="rounded-full border border-[#dce4dd] px-2.5 py-1 text-[11px] font-semibold text-[#708079]">{filteredInvoices.length} of {summary.invoiceCount} invoices</span>
          </div>

          {invoices.length > 0 && <div className="flex flex-col gap-3 border-b border-[#e6ece7] px-4 py-3 sm:flex-row sm:items-center sm:px-6">
            <label className="relative min-w-0 flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#829087]" size={16} />
              <input aria-label="Search invoices" className="min-h-10 w-full rounded-md border border-[#dce4dd] bg-white pl-9 pr-3 text-sm text-[#273b35] outline-none transition focus:border-[#1e5144] focus:ring-2 focus:ring-[#1e5144]/15" onChange={(event) => setInvoiceQuery(event.target.value)} placeholder="Search invoice, client, or agent" type="search" value={invoiceQuery} />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-[#64736b]" htmlFor="invoice-status-filter">
              Status
              <select className="min-h-10 rounded-md border border-[#dce4dd] bg-white px-3 text-sm text-[#354941] outline-none focus:border-[#1e5144]" id="invoice-status-filter" onChange={(event) => setInvoiceStatus(event.target.value)} value={invoiceStatus}>
                <option value="all">All</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option>
              </select>
            </label>
          </div>}

          {invoices.length > 0 && <div className="border-b border-[#e6ece7] px-4 py-2 sm:px-6">
            <button aria-controls="invoice-date-filters" aria-expanded={dateFiltersOpen} className="inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-xs font-semibold text-[#52655b] transition hover:bg-[#f4f8f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1e5144]" onClick={() => setDateFiltersOpen((open) => !open)} type="button">
              Date filters
              {Object.values(invoiceDates).filter(Boolean).length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#eaf3ec] px-1.5 text-[10px] text-[#1e5144]">{Object.values(invoiceDates).filter(Boolean).length}</span>}
              <ChevronDown aria-hidden="true" className={`transition-transform duration-200 ${dateFiltersOpen ? 'rotate-180' : ''}`} size={15} />
            </button>
            <div aria-hidden={!dateFiltersOpen} className="date-filter-panel" data-open={dateFiltersOpen} id="invoice-date-filters" inert={!dateFiltersOpen}>
              <div className="min-h-0 overflow-hidden">
                <div className="grid gap-3 py-2 sm:grid-cols-2">
            <fieldset className="min-w-0">
              <legend className="mb-2 text-xs font-semibold text-[#64736b]">Issue date</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0 text-[11px] text-[#829087]">From<input aria-label="Issue date from" className="mt-1 min-h-9 min-w-0 w-full rounded-md border border-[#dce4dd] bg-white px-2 text-xs text-[#354941] outline-none focus:border-[#1e5144]" max={invoiceDates.issueTo || undefined} onChange={(event) => setInvoiceDates((current) => ({ ...current, issueFrom: event.target.value }))} type="date" value={invoiceDates.issueFrom} /></label>
                <label className="min-w-0 text-[11px] text-[#829087]">To<input aria-label="Issue date to" className="mt-1 min-h-9 min-w-0 w-full rounded-md border border-[#dce4dd] bg-white px-2 text-xs text-[#354941] outline-none focus:border-[#1e5144]" min={invoiceDates.issueFrom || undefined} onChange={(event) => setInvoiceDates((current) => ({ ...current, issueTo: event.target.value }))} type="date" value={invoiceDates.issueTo} /></label>
              </div>
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="mb-2 text-xs font-semibold text-[#64736b]">Due date</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0 text-[11px] text-[#829087]">From<input aria-label="Due date from" className="mt-1 min-h-9 min-w-0 w-full rounded-md border border-[#dce4dd] bg-white px-2 text-xs text-[#354941] outline-none focus:border-[#1e5144]" max={invoiceDates.dueTo || undefined} onChange={(event) => setInvoiceDates((current) => ({ ...current, dueFrom: event.target.value }))} type="date" value={invoiceDates.dueFrom} /></label>
                <label className="min-w-0 text-[11px] text-[#829087]">To<input aria-label="Due date to" className="mt-1 min-h-9 min-w-0 w-full rounded-md border border-[#dce4dd] bg-white px-2 text-xs text-[#354941] outline-none focus:border-[#1e5144]" min={invoiceDates.dueFrom || undefined} onChange={(event) => setInvoiceDates((current) => ({ ...current, dueTo: event.target.value }))} type="date" value={invoiceDates.dueTo} /></label>
              </div>
            </fieldset>
                </div>
              </div>
            </div>
          </div>}

          {loading && <div aria-label="Loading invoices" className="space-y-3 px-4 py-4" role="status">
            {[0, 1, 2].map((row) => <div className="animate-pulse rounded-md border border-[#e6ece7] p-4" key={row}><div className="h-4 w-32 rounded bg-[#e8eee9]" /><div className="mt-3 h-3 w-48 rounded bg-[#eef3ef]" /><div className="mt-4 h-5 w-24 rounded bg-[#e8eee9]" /></div>)}
          </div>}
          {!loading && filteredInvoices.length > 0 && <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-[#f8faf7] text-[11px] uppercase text-[#7b8981]">
                <tr>
                  <th className="px-5 py-3 font-semibold sm:px-6">Invoice</th>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  {isManager && <th className="px-4 py-3 font-semibold">Sales agent</th>}
                  <th className="px-4 py-3 font-semibold">Issue date</th>
                  <th className="px-4 py-3 font-semibold">Due date</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6ece7]">
                {filteredInvoices.map((invoice) => {
                  const alert = dueDateAlert(invoice)
                  return (
                  <tr className={`transition-colors ${isManager && alert ? dueAlertSurface(alert) : 'hover:bg-[#f7faf7]'}`} key={invoice.id}>
                    <th className={`px-5 py-3.5 font-semibold text-[#354941] sm:px-6 ${isManager && alert ? alert.tone === 'overdue' ? 'border-l-4 border-l-[#b6495a]' : 'border-l-4 border-l-[#cf8b24]' : ''}`}>
                      <button className="text-left underline decoration-[#b5c8ba] underline-offset-4 hover:text-[#1e5144]" onClick={() => setSelectedInvoiceId(invoice.id)} type="button">{invoice.invoice_number}</button>
                    </th>
                    <td className="px-4 py-3.5 text-[#64736b]">{invoice.client_name}</td>
                    {isManager && <td className="px-4 py-3.5 text-[#64736b]">{invoice.agent_name}</td>}
                    <td className="px-4 py-3.5 text-[#64736b]">{formatDate(invoice.issue_date)}</td>
                    <td className="px-4 py-3.5 text-[#64736b]">{formatDate(invoice.due_date)}<DueDateMarker alert={alert} isManager={isManager} /></td>
                    <td className="px-4 py-3.5 font-semibold text-[#273b35]">{formatMoney(invoice.amount_cents)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${invoice.status === 'paid' ? 'bg-[#e6f3e9] text-[#286344]' : 'bg-[#fbf0df] text-[#94651b]'}`}>
                        {invoice.status === 'paid' ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 px-4 py-4 lg:hidden">
            {filteredInvoices.map((invoice) => {
              const alert = dueDateAlert(invoice)
              return <article className={`rounded-md border border-[#e2e9e3] p-4 transition-colors ${isManager && alert ? dueAlertSurface(alert) : 'bg-[#fcfdfb] hover:bg-[#f7faf7]'}`} key={invoice.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button className="font-semibold text-[#1e5144] underline decoration-[#b5c8ba] underline-offset-4" onClick={() => setSelectedInvoiceId(invoice.id)} type="button">{invoice.invoice_number}</button>
                  <p className="mt-1 truncate text-sm text-[#64736b]">{invoice.client_name}</p>
                  {isManager && <p className="mt-1 text-xs text-[#829087]">{invoice.agent_name}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${invoice.status === 'paid' ? 'bg-[#e6f3e9] text-[#286344]' : 'bg-[#fbf0df] text-[#94651b]'}`}>{invoice.status === 'paid' ? 'Paid' : 'Unpaid'}</span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-[#e8eee9] pt-3">
                <div className="text-xs text-[#829087]">Issued {formatDate(invoice.issue_date)}<span className="mt-1 block">Due {formatDate(invoice.due_date)}</span><DueDateMarker alert={alert} isManager={isManager} /></div>
                <strong className="text-base text-[#273b35]">{formatMoney(invoice.amount_cents)}</strong>
              </div>
              </article>
            })}
          </div>
          </>}

          {!loading && invoices.length > 0 && filteredInvoices.length === 0 && <div className="px-5 py-10 text-center">
            <h3 className="text-sm font-bold text-[#354941]">No matching invoices</h3>
            <p className="mt-1 text-xs text-[#829087]">Try another search, status, or date range.</p>
            <button className="mt-3 text-xs font-bold text-[#1e5144] underline underline-offset-4" onClick={() => { setInvoiceQuery(''); setInvoiceStatus('all'); setInvoiceDates({ issueFrom: '', issueTo: '', dueFrom: '', dueTo: '' }) }} type="button">Clear filters</button>
          </div>}

          {!loading && invoices.length === 0 && <div className="grid min-h-52 place-items-center px-5 py-9 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-[#edf3ee] text-[#527264]"><FileText aria-hidden="true" size={21} /></span>
              <h3 className="mt-4 text-sm font-bold text-[#354941]">No invoices for this period</h3>
              <p className="mt-1.5 text-xs leading-5 text-[#829087]">Create an invoice to start tracking your paid and outstanding totals.</p>
              <button className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-md border border-[#cbd6ce] px-3 text-xs font-bold text-[#354941] transition hover:bg-[#f4f8f4]" onClick={() => setShowInvoiceForm(true)} type="button">
                <FilePlus2 aria-hidden="true" size={15} /> Create invoice
              </button>
            </div>
          </div>}
        </section>

        {selectedInvoiceId !== null && <InvoiceDetailsDialog
          invoiceId={selectedInvoiceId}
          isManager={isManager}
          onClose={() => setSelectedInvoiceId(null)}
          onUpdated={() => {
            setSelectedInvoiceId(null)
            setLoading(true)
            setRefreshKey((current) => current + 1)
          }}
        />}

        <p className="mt-5 text-right text-[11px] text-[#8a968f]">Updated {dateLabel}</p>
      </main>
    </div>
  )
}

export default Dashboard