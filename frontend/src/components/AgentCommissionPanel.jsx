import { useEffect, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarDays, CircleDollarSign, TrendingUp } from 'lucide-react'
import api from '../api/axiosInstance'
import { createReportingPeriods, previousMonthPeriod } from '../utils/reportingPeriods'

const periods = createReportingPeriods()
const money = (cents = 0) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100)

function bucketLabel(bucket) {
  if (/^\d{4}-\d{2}$/.test(bucket)) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${bucket}-01T00:00:00Z`))
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${bucket}T00:00:00Z`))
}

function commissionComparison(current, previous) {
  if (previous === null || previous === undefined) return null
  const difference = current - previous
  if (difference === 0) return { text: 'No change vs previous month', direction: 'same' }
  return {
    text: `${difference > 0 ? 'Up' : 'Down'} ${money(Math.abs(difference))} vs previous month`,
    direction: difference > 0 ? 'up' : 'down',
  }
}

function CommissionChart({ series }) {
  const chartWidth = 640
  const chartHeight = 210
  const padding = { top: 18, right: 18, bottom: 36, left: 66 }
  const values = series.map((point) => point.paid_commission_cents)
  const maxValue = Math.max(...values, 100)
  const points = series.map((point, index) => {
    const x = series.length < 2
      ? chartWidth / 2
      : padding.left + (index / (series.length - 1)) * (chartWidth - padding.left - padding.right)
    const y = chartHeight - padding.bottom - (point.paid_commission_cents / maxValue) * (chartHeight - padding.top - padding.bottom)
    return { ...point, x, y }
  })
  const visibleLabels = points.filter((point, index) => index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 5) === 0)
  const plotBottom = chartHeight - padding.bottom
  const plotHeight = plotBottom - padding.top

  return (
    <svg aria-label="Paid commission by invoice date" className="rise-in mt-4 block w-full overflow-visible" role="img" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
      <defs><linearGradient id="commission-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#168d88" stopOpacity="0.2" /><stop offset="100%" stopColor="#168d88" stopOpacity="0.015" /></linearGradient></defs>
      {[0, 0.5, 1].map((fraction) => {
        const y = plotBottom - fraction * plotHeight
        return <g key={fraction}>
          <line stroke="#e5ece6" strokeDasharray="3 6" x1={padding.left} x2={chartWidth - padding.right} y1={y} y2={y} />
          <text fill="#829087" fontSize="9" textAnchor="end" x={padding.left - 9} y={y + 3}>{money(maxValue * fraction)}</text>
        </g>
      })}
      {points.length > 1 && <polygon fill="url(#commission-fill)" points={`${points[0].x},${plotBottom} ${points.map((point) => `${point.x},${point.y}`).join(' ')} ${points.at(-1).x},${plotBottom}`} />}
      {points.length > 1 && <polyline fill="none" points={points.map((point) => `${point.x},${point.y}`).join(' ')} stroke="#168d88" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />}
      {points.map((point, index) => <circle cx={point.x} cy={point.y} fill={index === points.length - 1 ? '#168d88' : '#fff'} key={point.bucket} r={index === points.length - 1 ? 5.5 : 4} stroke="#168d88" strokeWidth="2.5"><title>{`${bucketLabel(point.bucket)}: ${money(point.paid_commission_cents)} from ${point.paid_invoice_count} paid invoices`}</title></circle>)}
      {visibleLabels.map((point) => <text fill="#829087" fontSize="10" key={`label-${point.bucket}`} textAnchor={point.x === padding.left ? 'start' : point.x >= chartWidth - padding.right ? 'end' : 'middle'} x={point.x} y={chartHeight - 10}>{bucketLabel(point.bucket)}</text>)}
      {points.length === 0 && <text fill="#829087" fontSize="12" textAnchor="middle" x={chartWidth / 2} y={chartHeight / 2}>No paid invoices in this period</text>}
    </svg>
  )
}

function AgentCommissionPanel({ userId, refreshKey }) {
  const [period, setPeriod] = useState('this-month')
  const [report, setReport] = useState(null)
  const [previousSummary, setPreviousSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const comparisonPeriod = previousMonthPeriod(period)

  useEffect(() => {
    const controller = new AbortController()
    const currentRequest = api.get(`/agents/${userId}/commission`, { params: { period }, signal: controller.signal })
    const previousRequest = comparisonPeriod
      ? api.get(`/agents/${userId}/commission`, { params: { period: comparisonPeriod }, signal: controller.signal })
      : Promise.resolve(null)
    Promise.all([currentRequest, previousRequest])
      .then(([response, previousResponse]) => {
        setReport(response.data)
        setPreviousSummary(previousResponse?.data.summary ?? null)
        setError('')
      })
      .catch((requestError) => {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message || 'Unable to load commission totals.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [userId, period, refreshKey, comparisonPeriod])

  const summary = report?.summary
  const paidComparison = commissionComparison(summary?.paid_commission_cents ?? 0, previousSummary?.paid_commission_cents)
  const unpaidComparison = commissionComparison(summary?.unpaid_commission_cents ?? 0, previousSummary?.unpaid_commission_cents)

  return (
    <section aria-label="Commission overview" className="mt-7">
      {error && <p className="mb-3 rounded-md border border-[#edc9c0] bg-[#fff0eb] px-4 py-3 text-sm text-[#a34435]" role="alert">{error}</p>}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(230px,0.8fr)]">
        <article aria-busy={loading} className="min-w-0 rounded-lg border border-[#dce4dd] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] text-[#7f8c84]">PAID INVOICE COMMISSION</p>
              <h2 className="mt-1 text-base font-bold text-[#172b28]">Earnings over time</h2>
              <p className="mt-1 text-xs text-[#829087]">{loading ? 'Loading commission…' : `${report?.commissionPercentage ?? 0}% commission rate`}</p>
            </div>
            <label className="relative block w-44" htmlFor="agent-commission-period">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#708079]" size={15} />
              <select className="min-h-10 w-full appearance-none rounded-md border border-[#cbd6ce] bg-white py-2 pl-9 pr-3 text-xs font-semibold text-[#354941] outline-none focus:border-[#1e5144]" id="agent-commission-period" onChange={(event) => { setLoading(true); setPeriod(event.target.value) }} value={period}>
                {periods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <CommissionChart series={report?.series ?? []} />
        </article>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <article aria-busy={loading} className="rounded-lg border border-[#1e5144] bg-[#1e5144] p-5 shadow-[0_8px_24px_rgba(23,43,40,0.12)] transition-shadow hover:shadow-[0_12px_30px_rgba(23,43,40,0.18)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white/75">Paid commission</p>
                <p className="mt-3 text-[28px] font-extrabold leading-none text-white">{loading ? '—' : money(summary?.paid_commission_cents)}</p>
                <p className="mt-2 text-[11px] text-white/65">Earned from paid invoices</p>
                {paidComparison && <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-white/85">{paidComparison.direction === 'up' ? <ArrowUpRight aria-hidden="true" size={14} /> : paidComparison.direction === 'down' ? <ArrowDownRight aria-hidden="true" size={14} /> : null}{paidComparison.text}</p>}
              </div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white/12 text-white"><TrendingUp aria-hidden="true" size={19} /></span>
            </div>
          </article>
          <article aria-busy={loading} className="rounded-lg border border-[#eee0c7] bg-[#fbf4e8] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#8d7045]">Unpaid commission</p>
                <p className="mt-3 text-[28px] font-extrabold leading-none text-[#a77725]">{loading ? '—' : money(summary?.unpaid_commission_cents)}</p>
                <p className="mt-2 text-[11px] text-[#96846a]">Pending from unpaid invoices</p>
                {unpaidComparison && <p className={`mt-3 inline-flex items-center gap-1 text-[11px] font-semibold ${unpaidComparison.direction === 'same' ? 'text-[#96846a]' : 'text-[#8d7045]'}`}>{unpaidComparison.direction === 'up' ? <ArrowUpRight aria-hidden="true" size={14} /> : unpaidComparison.direction === 'down' ? <ArrowDownRight aria-hidden="true" size={14} /> : null}{unpaidComparison.text}</p>}
              </div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white/70 text-[#b3822c]"><CircleDollarSign aria-hidden="true" size={19} /></span>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

export default AgentCommissionPanel