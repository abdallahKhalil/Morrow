function nextAgentCode(db) {
  // Reuse the lowest free reference to keep agent codes short and deterministic.
  const assigned = new Set(
    db.prepare('SELECT agent_code FROM users WHERE agent_code IS NOT NULL').all().map((user) => user.agent_code)
  )

  for (let value = 1; value <= 9999; value += 1) {
    const code = String(value).padStart(4, '0')
    if (!assigned.has(code)) return code
  }

  throw new Error('No sales agent reference codes remain.')
}

module.exports = nextAgentCode