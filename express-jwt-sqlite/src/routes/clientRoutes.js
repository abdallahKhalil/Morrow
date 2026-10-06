const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middleware/authMiddleware');
const createImageUpload = require('../middleware/imageUpload');
const { deleteImage, saveImage } = require('../storage/imageStore');

const router = express.Router();
const uploadShopPhoto = createImageUpload('client-shops', 'shopPhoto');

async function readClient(clientId) {
  return db.prepare(`
    SELECT c.id, c.shop_name, c.first_name, c.last_name, c.phone_number, c.address,
      c.location, c.assigned_agent_id, c.shop_photo_path,
      u.first_name AS agent_first_name, u.last_name AS agent_last_name, u.username AS agent_username
    FROM clients c
    LEFT JOIN users u ON u.id = c.assigned_agent_id
    WHERE c.id = ?
  `).get(clientId);
}

function agentCanAccess(req, client) {
  return req.user.role === 'manager' || client.assigned_agent_id === req.user.id;
}

async function getAssignedAgent(agentId) {
  return db.prepare("SELECT id FROM users WHERE id = ? AND role = 'sales_agent' AND is_blocked = 0").get(agentId);
}

function normalizeRequiredText(value, maximumLength) {
  return typeof value === 'string' && value.trim() && value.trim().length <= maximumLength
    ? value.trim()
    : null;
}

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const clients = req.user.role === 'manager'
    ? await db.prepare(`
      SELECT c.id, c.shop_name, c.first_name, c.last_name, c.phone_number, c.address,
        c.location, c.assigned_agent_id, c.shop_photo_path,
        u.first_name AS agent_first_name, u.last_name AS agent_last_name, u.username AS agent_username
      FROM clients c
      LEFT JOIN users u ON u.id = c.assigned_agent_id
      ORDER BY c.updated_at DESC, c.id DESC
    `).all()
    : await db.prepare(`
      SELECT c.id, c.shop_name, c.first_name, c.last_name, c.phone_number, c.address,
        c.location, c.assigned_agent_id, c.shop_photo_path,
        u.first_name AS agent_first_name, u.last_name AS agent_last_name, u.username AS agent_username
      FROM clients c
      LEFT JOIN users u ON u.id = c.assigned_agent_id
      WHERE c.assigned_agent_id = ?
      ORDER BY c.updated_at DESC, c.id DESC
    `).all(req.user.id);
  return res.status(200).json({ clients });
});

router.post('/', uploadShopPhoto, async (req, res) => {
  const { shopName, firstName, lastName, phoneNumber, address, location = '', assignedAgentId = '' } = req.body || {};
  const normalized = {
    shopName: normalizeRequiredText(shopName, 120),
    firstName: normalizeRequiredText(firstName, 80),
    lastName: normalizeRequiredText(lastName, 80),
    phoneNumber: normalizeRequiredText(phoneNumber, 32),
    address: normalizeRequiredText(address, 300),
  };
  const optionalLocation = typeof location === 'string' && location.trim() ? location.trim().slice(0, 200) : null;
  // Agents own their clients; only managers may assign one to another active agent.
  const ownerId = req.user.role === 'manager'
    ? assignedAgentId ? Number(assignedAgentId) : null
    : req.user.id;
  const owner = ownerId === null ? null : await getAssignedAgent(ownerId);

  if (Object.values(normalized).some((value) => !value)) {
    return res.status(400).json({ message: 'Shop name, first name, last name, phone number, and address are required.' });
  }
  if (req.user.role === 'manager' && assignedAgentId && !owner) {
    return res.status(400).json({ message: 'Choose an active sales agent.' });
  }

  let shopPhotoPath = null;
  try {
    shopPhotoPath = await saveImage('client-shops', req.file);
    const result = await db.prepare(`
      INSERT INTO clients (
        shop_name, first_name, last_name, phone_number, address, location,
        assigned_agent_id, created_by_user_id, shop_photo_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.shopName,
      normalized.firstName,
      normalized.lastName,
      normalized.phoneNumber,
      normalized.address,
      optionalLocation,
      ownerId,
      req.user.id,
      shopPhotoPath,
    );
    return res.status(201).json({ client: await readClient(result.lastInsertRowid) });
  } catch (error) {
    if (shopPhotoPath) await deleteImage('client-shops', shopPhotoPath).catch(() => {});
    console.error('Client creation failed:', error);
    return res.status(500).json({ message: 'Unable to create this client.' });
  }
});

router.get('/:clientId', async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!Number.isSafeInteger(clientId) || clientId < 1) {
    return res.status(400).json({ message: 'Choose a valid client.' });
  }
  const client = await readClient(clientId);
  if (!client || !agentCanAccess(req, client)) {
    return res.status(404).json({ message: 'Client not found.' });
  }
  return res.status(200).json({ client });
});

router.patch('/:clientId', uploadShopPhoto, async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!Number.isSafeInteger(clientId) || clientId < 1) {
    return res.status(400).json({ message: 'Choose a valid client.' });
  }

  const client = await readClient(clientId);
  if (!client || !agentCanAccess(req, client)) {
    return res.status(404).json({ message: 'Client not found.' });
  }

  const { shopName, firstName, lastName, phoneNumber, address, location, assignedAgentId } = req.body || {};
  // Reassignment is manager-only; agents can edit details but not transfer ownership.
  if (req.user.role !== 'manager' && Object.hasOwn(req.body || {}, 'assignedAgentId')) {
    return res.status(403).json({ message: 'Only a manager can reassign a client.' });
  }

  const next = {
    shopName: shopName === undefined ? client.shop_name : normalizeRequiredText(shopName, 120),
    firstName: firstName === undefined ? client.first_name : normalizeRequiredText(firstName, 80),
    lastName: lastName === undefined ? client.last_name : normalizeRequiredText(lastName, 80),
    phoneNumber: phoneNumber === undefined ? client.phone_number : normalizeRequiredText(phoneNumber, 32),
    address: address === undefined ? client.address : normalizeRequiredText(address, 300),
    location: location === undefined ? client.location : typeof location === 'string' && location.trim() ? location.trim().slice(0, 200) : null,
    assignedAgentId: client.assigned_agent_id,
    shopPhotoPath: client.shop_photo_path,
  };
  if (Object.values({ shopName: next.shopName, firstName: next.firstName, lastName: next.lastName, phoneNumber: next.phoneNumber, address: next.address }).some((value) => !value)) {
    return res.status(400).json({ message: 'Shop name, first name, last name, phone number, and address are required.' });
  }

  if (req.user.role === 'manager' && assignedAgentId !== undefined) {
    next.assignedAgentId = assignedAgentId ? Number(assignedAgentId) : null;
    if (next.assignedAgentId !== null && !await getAssignedAgent(next.assignedAgentId)) {
      return res.status(400).json({ message: 'Choose an active sales agent.' });
    }
  }

  let newShopPhotoPath = null;
  try {
    newShopPhotoPath = await saveImage('client-shops', req.file);
    if (newShopPhotoPath) next.shopPhotoPath = newShopPhotoPath;
    await db.prepare(`
      UPDATE clients
      SET shop_name = ?, first_name = ?, last_name = ?, phone_number = ?, address = ?, location = ?,
        assigned_agent_id = ?, shop_photo_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      next.shopName,
      next.firstName,
      next.lastName,
      next.phoneNumber,
      next.address,
      next.location,
      next.assignedAgentId,
      next.shopPhotoPath,
      clientId,
    );
    if (newShopPhotoPath && client.shop_photo_path) {
      await deleteImage('client-shops', client.shop_photo_path).catch((cleanupError) => {
        console.error('Previous shop photo cleanup failed:', cleanupError);
      });
    }
    return res.status(200).json({ client: await readClient(clientId) });
  } catch (error) {
    if (newShopPhotoPath) await deleteImage('client-shops', newShopPhotoPath).catch(() => {});
    console.error('Client update failed:', error);
    return res.status(500).json({ message: 'Unable to update this client.' });
  }
});

module.exports = router;