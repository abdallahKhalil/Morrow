const express = require('express');
const { randomInt } = require('node:crypto');
const db = require('../config/database');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getDateRange(period) {
  // Half-open ranges include the start date and exclude the next period's first date.
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (period === 'today') {
    return { start: formatDate(today), end: formatDate(new Date(today.getTime() + 86400000)) };
  }
  if (period === 'this-month') {
    return {
      start: formatDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
      end: formatDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))),
    };
  }
  if (period === 'this-year') {
    return {
      start: formatDate(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))),
      end: formatDate(new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1))),
    };
  }
  if (period === 'all-time') return null;

  const monthMatch = /^month-(\d{4})-(\d{1,2})$/.exec(period || '');
  if (!monthMatch) return undefined;
  const year = Number(monthMatch[1]);
  const month = Number(monthMatch[2]);
  if (month < 1 || month > 12) return undefined;

  return {
    start: formatDate(new Date(Date.UTC(year, month - 1, 1))),
    end: formatDate(new Date(Date.UTC(year, month, 1))),
  };
}

function isDate(value) {
  // Round-trip validation rejects impossible dates that JavaScript would normalize.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && formatDate(date) === value;
}

function managerOnly(req, res, next) {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Manager access is required.' });
  }
  return next();
}

async function invoiceDetails(invoiceId) {
  return db.prepare(`
    SELECT i.id, i.user_id, i.client_id, i.invoice_number, i.client_name, i.amount_cents,
      i.status, i.issue_date, i.due_date, i.created_at, u.username AS agent_name
    FROM invoices i
    JOIN users u ON u.id = i.user_id
    WHERE i.id = ?
  `).get(invoiceId);
}

router.use(authMiddleware);

router.get('/agents', managerOnly, async (req, res) => {
  const agents = await db.prepare("SELECT id, username, agent_code FROM users WHERE role = 'sales_agent' ORDER BY lower(username)").all();
  return res.status(200).json({ agents });
});

router.get('/:invoiceId', async (req, res) => {
  const invoiceId = Number(req.params.invoiceId);
  if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) {
    return res.status(400).json({ message: 'Choose a valid invoice.' });
  }
  const invoice = await invoiceDetails(invoiceId);
  if (!invoice || (req.user.role !== 'manager' && invoice.user_id !== req.user.id)) {
    return res.status(404).json({ message: 'Invoice not found.' });
  }
  return res.status(200).json({ invoice });
});

router.patch('/:invoiceId', async (req, res) => {
  const invoiceId = Number(req.params.invoiceId);
  const updates = req.body || {};
  const isManager = req.user.role === 'manager';
  // Each role gets an explicit allowlist so clients cannot choose their own update scope.
  const allowedFields = isManager
    ? new Set(['status', 'dueDate', 'salesAgentId'])
    : new Set(['status', 'dueDate', 'clientId', 'clientName', 'amount', 'issueDate']);
  if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) {
    return res.status(400).json({ message: 'Choose a valid invoice.' });
  }
  if (!Object.keys(updates).length || Object.keys(updates).some((field) => !allowedFields.has(field))) {
    return res.status(400).json({ message: isManager ? 'Update status, due date, or assigned sales agent.' : 'Update invoice details, status, or due date.' });
  }
  if (Object.hasOwn(updates, 'status') && !['paid', 'unpaid'].includes(updates.status)) {
    return res.status(400).json({ message: 'Choose a valid invoice status.' });
  }
  if (Object.hasOwn(updates, 'dueDate') && updates.dueDate !== null && !isDate(updates.dueDate)) {
    return res.status(400).json({ message: 'Choose a valid due date.' });
  }

  const invoice = await invoiceDetails(invoiceId);
  if (!invoice || (!isManager && invoice.user_id !== req.user.id)) {
    return res.status(404).json({ message: 'Invoice not found.' });
  }

  const amountValue = Object.hasOwn(updates, 'amount') ? Number(updates.amount) : invoice.amount_cents / 100;
  const amountCents = Object.hasOwn(updates, 'amount') ? Math.round(amountValue * 100) : invoice.amount_cents;
  const issueDate = Object.hasOwn(updates, 'issueDate') ? updates.issueDate : invoice.issue_date;
  if (!Number.isFinite(amountValue) || amountValue <= 0 || !Number.isSafeInteger(amountCents) || !isDate(issueDate)) {
    return res.status(400).json({ message: 'Enter a valid invoice amount and issue date.' });
  }

  let clientId = invoice.client_id;
  let clientName = invoice.client_name;
  if (!isManager && (Object.hasOwn(updates, 'clientId') || Object.hasOwn(updates, 'clientName'))) {
    const requestedClientId = updates.clientId === null || updates.clientId === '' || updates.clientId === undefined
      ? null
      : Number(updates.clientId);
    if (requestedClientId === null) {
      if (typeof updates.clientName !== 'string' || !updates.clientName.trim() || updates.clientName.trim().length > 120) {
        return res.status(400).json({ message: 'Select a client or enter a client name.' });
      }
      clientId = null;
      clientName = updates.clientName.trim();
    } else {
      const selectedClient = await db.prepare('SELECT id, first_name, last_name, assigned_agent_id FROM clients WHERE id = ?').get(requestedClientId);
      if (!selectedClient || selectedClient.assigned_agent_id !== req.user.id) {
        return res.status(404).json({ message: 'Client not found.' });
      }
      clientId = selectedClient.id;
      clientName = `${selectedClient.first_name} ${selectedClient.last_name}`;
    }
  }

  let nextAgent = null;
  if (Object.hasOwn(updates, 'salesAgentId')) {
    const agentId = Number(updates.salesAgentId);
    if (!Number.isSafeInteger(agentId) || agentId < 1) {
      return res.status(400).json({ message: 'Choose a valid sales agent.' });
    }
    nextAgent = await db.prepare("SELECT id, agent_code FROM users WHERE id = ? AND role = 'sales_agent'").get(agentId);
    if (!nextAgent) return res.status(400).json({ message: 'Choose a valid sales agent.' });
  }

  const status = Object.hasOwn(updates, 'status') ? updates.status : invoice.status;
  const dueDate = Object.hasOwn(updates, 'dueDate') ? updates.dueDate : invoice.due_date;
  if (dueDate !== null && !isDate(dueDate)) {
    return res.status(400).json({ message: 'Choose a valid due date.' });
  }
  const userId = nextAgent ? nextAgent.id : invoice.user_id;
  let invoiceNumber = invoice.invoice_number;
  if (nextAgent && nextAgent.id !== invoice.user_id) {
    const suffix = /^\d{16}$/.test(invoiceNumber)
      ? invoiceNumber.slice(4)
      : String(randomInt(0, 1000000000000)).padStart(12, '0');
    invoiceNumber = `${nextAgent.agent_code}${suffix}`;
  }

  try {
    await db.prepare(`
      UPDATE invoices
      SET user_id = ?, invoice_number = ?, client_id = ?, client_name = ?,
        amount_cents = ?, issue_date = ?, status = ?, due_date = ?
      WHERE id = ?
    `).run(userId, invoiceNumber, clientId, clientName, amountCents, issueDate, status, dueDate, invoiceId);
    return res.status(200).json({ invoice: await invoiceDetails(invoiceId) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'That invoice number already exists for this sales agent.' });
    }
    console.error('Invoice update failed:', error);
    return res.status(500).json({ message: 'Unable to update this invoice.' });
  }
});

router.get('/', async (req, res) => {
  const period = req.query.period || 'this-month';
  const range = getDateRange(period);
  if (range === undefined) {
    return res.status(400).json({ message: 'Choose a valid reporting period.' });
  }

  const filters = [];
  const parameters = [];
  if (req.user.role !== 'manager') {
    filters.push('i.user_id = ?');
    parameters.push(req.user.id);
  }
  if (range) {
    filters.push('i.issue_date >= ? AND i.issue_date < ?');
    parameters.push(range.start, range.end);
  }
  // Keep request values parameterized; only fixed SQL fragments are assembled here.
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    // The list view needs display and filter fields, not editable invoice identifiers.
    const invoices = await db.prepare(`
      SELECT i.id, i.invoice_number, i.client_name, i.amount_cents,
        i.status, i.issue_date, i.due_date, u.username AS agent_name
      FROM invoices i
      JOIN users u ON u.id = i.user_id
      ${whereClause}
      ORDER BY i.issue_date DESC, i.id DESC
    `).all(...parameters);

    const summary = invoices.reduce((totals, invoice) => {
      totals.invoiceCount += 1;
      totals.totalAmountCents += invoice.amount_cents;
      if (invoice.status === 'paid') {
        totals.paidCount += 1;
        totals.paidAmountCents += invoice.amount_cents;
      } else {
        totals.unpaidCount += 1;
        totals.unpaidAmountCents += invoice.amount_cents;
      }
      return totals;
    }, {
      invoiceCount: 0,
      totalAmountCents: 0,
      paidCount: 0,
      paidAmountCents: 0,
      unpaidCount: 0,
      unpaidAmountCents: 0,
    });

    let teamBreakdown;
    if (req.user.role === 'manager') {
      const joinFilters = range ? 'AND i.issue_date >= ? AND i.issue_date < ?' : '';
      const teamParameters = range ? [range.start, range.end] : [];
      // Keep contact and government-ID fields out of the dashboard summary payload.
      teamBreakdown = await db.prepare(`
        SELECT u.id AS user_id, u.username,
          u.first_name, u.last_name, u.is_blocked,
          COUNT(i.id) AS invoice_count,
          COALESCE(SUM(i.amount_cents), 0) AS total_amount_cents,
          COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.amount_cents ELSE 0 END), 0) AS paid_amount_cents,
          COALESCE(SUM(CASE WHEN i.status = 'unpaid' THEN i.amount_cents ELSE 0 END), 0) AS unpaid_amount_cents
        FROM users u
        LEFT JOIN invoices i ON i.user_id = u.id ${joinFilters}
        WHERE u.role = 'sales_agent'
        GROUP BY u.id, u.username
        ORDER BY lower(u.username)
      `).all(...teamParameters);
    }

    return res.status(200).json({ period, summary, invoices, teamBreakdown });
  } catch (error) {
    console.error('Invoice report failed:', error);
    return res.status(500).json({ message: 'Unable to retrieve invoices.' });
  }
});

router.post('/', async (req, res) => {
  const {
    invoiceNumber,
    clientName,
    amount,
    status = 'unpaid',
    issueDate = formatDate(new Date()),
    dueDate = null,
    salesAgentId,
    clientId,
  } = req.body || {};
  const amountValue = typeof amount === 'number' || typeof amount === 'string' ? Number(amount) : NaN;
  const amountCents = Math.round(amountValue * 100);
  const normalizedClientId = clientId === undefined || clientId === null || clientId === '' ? null : Number(clientId);
  const selectedClient = normalizedClientId !== null && Number.isSafeInteger(normalizedClientId) && normalizedClientId > 0
    ? await db.prepare('SELECT id, first_name, last_name, assigned_agent_id FROM clients WHERE id = ?').get(normalizedClientId)
    : null;
  const clientIsAccessible = selectedClient && (
    req.user.role === 'manager' || selectedClient.assigned_agent_id === req.user.id
  );
  const invoiceClientName = selectedClient
    ? `${selectedClient.first_name} ${selectedClient.last_name}`
    : typeof clientName === 'string' ? clientName.trim() : '';
  const ownerId = req.user.role === 'manager' ? Number(salesAgentId) : req.user.id;
  const owner = Number.isSafeInteger(ownerId) && ownerId > 0
    ? await db.prepare("SELECT id, role, agent_code FROM users WHERE id = ?").get(ownerId)
    : null;

  if (normalizedClientId !== null && !clientIsAccessible) {
    // A supplied but inaccessible client must not fall back to a manually entered name.
    return res.status(404).json({ message: 'Client not found.' });
  }

  if (
    typeof invoiceNumber !== 'string' || !/^\d{16}$/.test(invoiceNumber.trim()) ||
    !invoiceClientName || invoiceClientName.length > 120 ||
    !Number.isFinite(amountValue) || amountValue <= 0 || !Number.isSafeInteger(amountCents) ||
    !['paid', 'unpaid'].includes(status) || !isDate(issueDate) ||
    (dueDate !== null && !isDate(dueDate)) ||
    !owner || owner.role !== 'sales_agent' || !invoiceNumber.trim().startsWith(owner.agent_code)
  ) {
    return res.status(400).json({ message: 'Enter a valid 16-digit agent-referenced invoice number, sales agent, client, amount, status, and dates.' });
  }

  try {
    const result = await db.prepare(`
      INSERT INTO invoices (user_id, client_id, invoice_number, client_name, amount_cents, status, issue_date, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      owner.id,
      selectedClient?.id ?? null,
      invoiceNumber.trim(),
      invoiceClientName,
      amountCents,
      status,
      issueDate,
      dueDate,
    );
    const invoice = await invoiceDetails(result.lastInsertRowid);

    return res.status(201).json({ message: 'Invoice created successfully.', invoice });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'That invoice number is already in use.' });
    }
    console.error('Invoice creation failed:', error);
    return res.status(500).json({ message: 'Unable to create invoice.' });
  }
});

module.exports = router;