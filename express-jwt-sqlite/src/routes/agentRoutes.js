const bcrypt = require('bcryptjs');
const express = require('express');
const fs = require('node:fs');
const db = require('../config/database');
const authMiddleware = require('../middleware/authMiddleware');
const createImageUpload = require('../middleware/imageUpload');
const nextAgentCode = require('../agentCode');

const router = express.Router();
const uploadProfilePhoto = createImageUpload('agent-profiles', 'profilePhoto');

function managerOnly(req, res, next) {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Manager access is required.' });
  }
  return next();
}

function getAgent(agentId) {
  return db.prepare(`
    SELECT id, username, email, agent_code, first_name, last_name,
      phone_number, id_number, profile_photo_path, is_blocked,
      commission_rate_basis_points, created_at
    FROM users
    WHERE id = ? AND role = 'sales_agent'
  `).get(agentId);
}

router.use(authMiddleware);

router.get('/', managerOnly, (req, res) => {
  const agents = db.prepare(`
    SELECT id, username, agent_code, first_name, last_name, is_blocked
    FROM users
    WHERE role = 'sales_agent'
    ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE, username COLLATE NOCASE
  `).all();
  return res.status(200).json({ agents });
});

router.post('/', managerOnly, uploadProfilePhoto, async (req, res) => {
  const {
    firstName,
    lastName,
    phoneNumber,
    idNumber = '',
    email,
    password,
    commissionPercentage = '0',
  } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const commissionValue = Number(commissionPercentage);
  const commissionRateBasisPoints = Math.round(commissionValue * 100);

  if (
    typeof firstName !== 'string' || !firstName.trim() || firstName.trim().length > 80 ||
    typeof lastName !== 'string' || !lastName.trim() || lastName.trim().length > 80 ||
    typeof phoneNumber !== 'string' || !phoneNumber.trim() || phoneNumber.trim().length > 32 ||
    (idNumber !== '' && (typeof idNumber !== 'string' || idNumber.trim().length > 80)) ||
    !emailIsValid || typeof password !== 'string' || password.length < 8 ||
    !Number.isFinite(commissionValue) || commissionValue < 0 || commissionValue > 100 ||
    Math.abs(commissionValue * 100 - commissionRateBasisPoints) > 0.000001
  ) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: 'First name, last name, phone, valid email, and an initial password of at least 8 characters are required.' });
  }
  try {
    const agentCode = nextAgentCode(db);
    const passwordHash = await bcrypt.hash(password, 10);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const username = db.prepare('SELECT id FROM users WHERE username = ?').get(fullName)
      ? `${fullName} (${agentCode})`
      : fullName;
    const result = db.prepare(`
      INSERT INTO users (
        username, email, password, role, agent_code,
        first_name, last_name, phone_number, id_number, profile_photo_path,
        commission_rate_basis_points
      ) VALUES (?, ?, ?, 'sales_agent', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      username,
      normalizedEmail,
      passwordHash,
      agentCode,
      firstName.trim(),
      lastName.trim(),
      phoneNumber.trim(),
      typeof idNumber === 'string' && idNumber.trim() ? idNumber.trim() : null,
      req.file?.filename ?? null,
      commissionRateBasisPoints,
    );

    // Agent details are fetched on demand through the manager-only detail route.
    return res.status(201).json({ message: 'Sales agent created successfully.', agent: { id: result.lastInsertRowid } });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ message: 'That email address is already registered.' });
    }
    console.error('Agent creation failed:', error);
    return res.status(500).json({ message: 'Unable to create this sales agent.' });
  }
});

function getPeriodRange(period) {
  // Use half-open UTC ranges so adjacent reporting periods never overlap.
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dateString = (date) => date.toISOString().slice(0, 10);
  if (period === 'today') return { start: dateString(today), end: dateString(new Date(today.getTime() + 86400000)) };
  if (period === 'this-month') return {
    start: dateString(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
    end: dateString(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))),
  };
  if (period === 'this-year') return {
    start: dateString(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))),
    end: dateString(new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1))),
  };
  if (period === 'all-time') return null;
  const monthMatch = /^month-(\d{4})-(\d{1,2})$/.exec(period || '');
  if (!monthMatch) return undefined;
  const year = Number(monthMatch[1]);
  const month = Number(monthMatch[2]);
  if (month < 1 || month > 12) return undefined;
  return {
    start: dateString(new Date(Date.UTC(year, month - 1, 1))),
    end: dateString(new Date(Date.UTC(year, month, 1))),
  };
}

function commissionCentsSql() {
  // Store commission using the same integer-cent precision as invoice amounts.
  return 'CAST(ROUND(i.amount_cents * u.commission_rate_basis_points / 10000.0) AS INTEGER)';
}

function commissionReport(agentId, period) {
  const agent = getAgent(agentId);
  if (!agent) return null;
  const range = getPeriodRange(period);
  if (range === undefined) return { invalidPeriod: true };
  const rangeSql = range ? 'AND i.issue_date >= ? AND i.issue_date < ?' : '';
  // The interpolated clause is fixed; range values are passed separately as SQL parameters.
  const rangeParameters = range ? [range.start, range.end] : [];
  const commissionSql = commissionCentsSql();
  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN i.status = 'paid' THEN ${commissionSql} ELSE 0 END), 0) AS paid_commission_cents,
      COALESCE(SUM(CASE WHEN i.status = 'unpaid' THEN ${commissionSql} ELSE 0 END), 0) AS unpaid_commission_cents,
      COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.amount_cents ELSE 0 END), 0) AS paid_invoice_amount_cents,
      COALESCE(SUM(CASE WHEN i.status = 'unpaid' THEN i.amount_cents ELSE 0 END), 0) AS unpaid_invoice_amount_cents,
      COUNT(CASE WHEN i.status = 'paid' THEN 1 END) AS paid_invoice_count,
      COUNT(CASE WHEN i.status = 'unpaid' THEN 1 END) AS unpaid_invoice_count
    FROM invoices i
    JOIN users u ON u.id = i.user_id
    WHERE i.user_id = ? ${rangeSql}
  `).get(agentId, ...rangeParameters);

  const bucketExpression = period === 'this-year' || period === 'all-time'
  // Long reports group by month; shorter reports keep daily buckets.
    ? "substr(i.issue_date, 1, 7)"
    : 'i.issue_date';
  const series = db.prepare(`
    SELECT ${bucketExpression} AS bucket,
      COALESCE(SUM(CASE WHEN i.status = 'paid' THEN ${commissionSql} ELSE 0 END), 0) AS paid_commission_cents,
      COUNT(CASE WHEN i.status = 'paid' THEN 1 END) AS paid_invoice_count
    FROM invoices i
    JOIN users u ON u.id = i.user_id
    WHERE i.user_id = ? ${rangeSql}
    GROUP BY bucket
    ORDER BY bucket
  `).all(agentId, ...rangeParameters);

  return {
    agentId,
    period,
    commissionPercentage: agent.commission_rate_basis_points / 100,
    summary,
    series,
  };
}

router.get('/:agentId/commission', (req, res) => {
  const agentId = Number(req.params.agentId);
  if (!Number.isSafeInteger(agentId) || agentId < 1) {
    return res.status(400).json({ message: 'Choose a valid sales agent.' });
  }
  if (req.user.role !== 'manager' && req.user.id !== agentId) {
    return res.status(403).json({ message: 'You can only view your own commission.' });
  }
  const period = req.query.period || 'this-month';
  const report = commissionReport(agentId, period);
  if (!report) return res.status(404).json({ message: 'Sales agent not found.' });
  if (report.invalidPeriod) return res.status(400).json({ message: 'Choose a valid reporting period.' });
  return res.status(200).json(report);
});

router.get('/:agentId', managerOnly, (req, res) => {
  const agentId = Number(req.params.agentId);
  if (!Number.isSafeInteger(agentId) || agentId < 1) {
    return res.status(400).json({ message: 'Choose a valid sales agent.' });
  }
  const agent = getAgent(agentId);
  if (!agent) return res.status(404).json({ message: 'Sales agent not found.' });
  return res.status(200).json({ agent });
});

router.patch('/:agentId', managerOnly, (req, res) => {
  const agentId = Number(req.params.agentId);
  const { commissionPercentage } = req.body || {};
  const commissionValue = Number(commissionPercentage);
  const commissionRateBasisPoints = Math.round(commissionValue * 100);
  if (!Number.isSafeInteger(agentId) || agentId < 1 || !Number.isFinite(commissionValue) ||
    commissionValue < 0 || commissionValue > 100 ||
    Math.abs(commissionValue * 100 - commissionRateBasisPoints) > 0.000001) {
    return res.status(400).json({ message: 'Enter a commission percentage between 0 and 100, with up to two decimal places.' });
  }
  const agent = getAgent(agentId);
  if (!agent) return res.status(404).json({ message: 'Sales agent not found.' });
  db.prepare('UPDATE users SET commission_rate_basis_points = ? WHERE id = ?').run(commissionRateBasisPoints, agentId);
  return res.status(200).json({ agent: getAgent(agentId) });
});

router.patch('/:agentId/block', managerOnly, (req, res) => {
  const agentId = Number(req.params.agentId);
  const { blocked } = req.body || {};
  if (!Number.isSafeInteger(agentId) || agentId < 1 || typeof blocked !== 'boolean') {
    return res.status(400).json({ message: 'Choose a sales agent and a valid access status.' });
  }

  const agent = getAgent(agentId);
  if (!agent) return res.status(404).json({ message: 'Sales agent not found.' });
  db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(blocked ? 1 : 0, agentId);
  return res.status(200).json({ agent: getAgent(agentId) });
});

module.exports = router;