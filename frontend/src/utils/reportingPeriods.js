export function createReportingPeriods(today = new Date()) {
  const periods = [
    { value: 'today', label: 'Today' },
    { value: 'this-month', label: 'This month' },
  ]

  for (let offset = 1; offset < 12; offset += 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - offset, 1)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    periods.push({
      value: `month-${date.getFullYear()}-${month}`,
      label: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date),
    })
  }

  periods.push(
    { value: 'this-year', label: 'This year' },
    { value: 'all-time', label: 'All time' },
  )
  return periods
}

export function previousMonthPeriod(period, today = new Date()) {
  let year
  let month

  if (period === 'this-month') {
    year = today.getFullYear()
    month = today.getMonth() + 1
  } else {
    const match = /^month-(\d{4})-(\d{1,2})$/.exec(period || '')
    if (!match) return null
    year = Number(match[1])
    month = Number(match[2])
  }

  // JavaScript months are zero-based; subtract two to get the month before the one-based input.
  const previous = new Date(Date.UTC(year, month - 2, 1))
  return `month-${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`
}