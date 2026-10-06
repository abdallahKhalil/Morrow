const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const authMiddleware = require('../middleware/authMiddleware');
const nextAgentCode = require('../agentCode');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, email, password, role = 'sales_agent', managerInviteCode } = req.body || {};

  if (
    typeof username !== 'string' || !username.trim() ||
    typeof email !== 'string' || !email.trim() ||
    typeof password !== 'string' || !password ||
    !['manager', 'sales_agent'].includes(role)
  ) {
    return res.status(400).json({ message: 'Username, email, password, and a valid account role are required.' });
  }

  const validManagerCode = process.env.MANAGER_INVITATION_CODE || process.env.MANAGER_INVITE_CODE
  if (role === 'manager' && (!validManagerCode || managerInviteCode !== validManagerCode)) {
    return res.status(403).json({ message: 'A valid manager invitation code is required.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const agentCode = role === 'sales_agent' ? await nextAgentCode(db) : null;
    const result = await db.prepare(
      'INSERT INTO users (username, email, password, role, agent_code) VALUES (?, ?, ?, ?, ?)'
    ).run(username.trim(), email.trim().toLowerCase(), passwordHash, role, agentCode);

    return res.status(201).json({ message: 'User registered successfully.', userId: result.lastInsertRowid });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Username or email is already registered.' });
    }

    console.error('User registration failed:', error);
    return res.status(500).json({ message: 'Unable to register user.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const user = await db.prepare(
      'SELECT id, username, email, password, is_blocked FROM users WHERE email = ?'
    ).get(email.trim().toLowerCase());

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }
    if (user.is_blocked) {
      return res.status(403).json({ message: 'This account has been blocked.' });
    }

    const token = jwt.sign(
      // Keep claims to the user identifier; the client fetches session details from /profile.
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    return res.status(200).json({ message: 'Login successful', token });
  } catch (error) {
    console.error('User login failed:', error);
    return res.status(500).json({ message: 'Unable to log in.' });
  }
});

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    // Keep the session response narrow; staff details are fetched through manager-only routes.
    const user = await db.prepare(
      'SELECT id, username, email, role, agent_code FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ message: 'Profile retrieved successfully.', user });
  } catch (error) {
    console.error('Profile lookup failed:', error);
    return res.status(500).json({ message: 'Unable to retrieve profile.' });
  }
});

module.exports = router;