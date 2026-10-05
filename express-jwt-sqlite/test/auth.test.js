process.env.JWT_SECRET = 'test_secret_with_at_least_32_characters_long';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PATH = ':memory:';
process.env.MANAGER_INVITE_CODE = 'test-manager-invite';

const assert = require('node:assert/strict');
const { after, beforeEach, describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database');

describe('authentication API', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM clients').run();
    db.prepare('DELETE FROM invoices').run();
    db.prepare('DELETE FROM users').run();
  });

  it('registers a user and rejects duplicate email addresses', async () => {
    const user = { username: 'sample', email: 'sample@example.com', password: 'correct-horse' };
    const firstResponse = await request(app).post('/api/auth/register').send(user);
    const duplicateResponse = await request(app).post('/api/auth/register').send({
      ...user,
      username: 'another-name'
    });

    assert.equal(firstResponse.status, 201);
    assert.equal(typeof firstResponse.body.userId, 'number');
    assert.equal(duplicateResponse.status, 400);
  });

  it('logs in and returns a token that can access the password-free profile', async () => {
    const user = { username: 'sample', email: 'sample@example.com', password: 'correct-horse' };
    await request(app).post('/api/auth/register').send(user);

    const loginResponse = await request(app).post('/api/auth/login').send({
      email: user.email,
      password: user.password
    });
    const profileResponse = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${loginResponse.body.token}`);

    assert.equal(loginResponse.status, 200);
    assert.equal(typeof loginResponse.body.token, 'string');
    assert.equal(profileResponse.status, 200);
    assert.equal(profileResponse.body.user.email, user.email);
    assert.equal(profileResponse.body.user.role, 'sales_agent');
    assert.match(profileResponse.body.user.agent_code, /^\d{4}$/);
    assert.equal('phone_number' in profileResponse.body.user, false);
    assert.equal('id_number' in profileResponse.body.user, false);
    assert.equal('password' in profileResponse.body.user, false);
    const claims = JSON.parse(Buffer.from(loginResponse.body.token.split('.')[1], 'base64url').toString('utf8'));
    assert.deepEqual(Object.keys(claims).sort(), ['exp', 'iat', 'id']);
  });

  it('requires a manager invitation code and stores the manager role', async () => {
    const manager = { username: 'lead', email: 'lead@example.com', password: 'correct-horse', role: 'manager' };
    const deniedResponse = await request(app).post('/api/auth/register').send(manager);
    const registeredResponse = await request(app).post('/api/auth/register').send({
      ...manager,
      managerInviteCode: process.env.MANAGER_INVITE_CODE
    });
    const loginResponse = await request(app).post('/api/auth/login').send({
      email: manager.email,
      password: manager.password
    });
    const profileResponse = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${loginResponse.body.token}`);

    assert.equal(deniedResponse.status, 403);
    assert.equal(registeredResponse.status, 201);
    assert.equal(profileResponse.body.user.role, 'manager');
  });

  it('rejects profile requests without a token', async () => {
    const response = await request(app).get('/api/auth/profile');

    assert.equal(response.status, 401);
    assert.equal(response.body.message, 'Access denied. No token provided.');
  });

  it('rejects invalid tokens', async () => {
    const response = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer invalid-token');

    assert.equal(response.status, 403);
    assert.equal(response.body.message, 'Invalid or expired token.');
  });
});

describe('invoice API', () => {
  async function registerAndLogin(user) {
    const registration = await request(app).post('/api/auth/register').send(user);
    assert.equal(registration.status, 201);
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    return login.body.token;
  }

  async function readProfile(token) {
    const response = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
    return response.body.user;
  }

  it('limits agent reports to owned invoices and gives managers team-wide summaries', async () => {
    const agentToken = await registerAndLogin({
      username: 'agent-one', email: 'agent-one@example.com', password: 'correct-horse'
    });
    const otherAgentToken = await registerAndLogin({
      username: 'agent-two', email: 'agent-two@example.com', password: 'correct-horse'
    });
    const managerToken = await registerAndLogin({
      username: 'manager', email: 'manager@example.com', password: 'correct-horse',
      role: 'manager', managerInviteCode: process.env.MANAGER_INVITE_CODE
    });
    const agentOne = await readProfile(agentToken);
    const agentTwo = await readProfile(otherAgentToken);

    const firstInvoice = await request(app).post('/api/invoices').set('Authorization', `Bearer ${agentToken}`).send({
      invoiceNumber: `${agentOne.agent_code}123456789012`, clientName: 'Northwind', amount: 125.5, status: 'paid', issueDate: '2026-09-10'
    });
    await request(app).post('/api/invoices').set('Authorization', `Bearer ${otherAgentToken}`).send({
      invoiceNumber: `${agentTwo.agent_code}223456789012`, clientName: 'Contoso', amount: 80, status: 'unpaid', issueDate: '2026-09-12'
    });

    const agentReport = await request(app)
      .get('/api/invoices?period=all-time')
      .set('Authorization', `Bearer ${agentToken}`);
    const managerReport = await request(app)
      .get('/api/invoices?period=all-time')
      .set('Authorization', `Bearer ${managerToken}`);

    assert.equal(firstInvoice.status, 201);
    assert.equal(agentReport.body.invoices.length, 1);
    assert.equal(agentReport.body.summary.paidAmountCents, 12550);
    assert.equal('teamBreakdown' in agentReport.body, false);
    assert.equal(managerReport.body.invoices.length, 2);
    assert.equal(managerReport.body.summary.totalAmountCents, 20550);
    assert.equal(managerReport.body.teamBreakdown.length, 2);
    assert.equal('user_id' in managerReport.body.invoices[0], false);
    assert.equal('client_id' in managerReport.body.invoices[0], false);
    assert.equal('created_at' in managerReport.body.invoices[0], false);
    assert.equal('agent_code' in managerReport.body.invoices[0], false);
    assert.equal('phone_number' in managerReport.body.teamBreakdown[0], false);
    assert.equal('id_number' in managerReport.body.teamBreakdown[0], false);
    assert.equal('profile_photo_path' in managerReport.body.teamBreakdown[0], false);
  });

  it('lets managers assign invoices and agents edit only their own invoices', async () => {
    const firstAgentToken = await registerAndLogin({
      username: 'assign-agent-one', email: 'assign-one@example.com', password: 'correct-horse'
    });
    const secondAgentToken = await registerAndLogin({
      username: 'assign-agent-two', email: 'assign-two@example.com', password: 'correct-horse'
    });
    const managerToken = await registerAndLogin({
      username: 'assign-manager', email: 'assign-manager@example.com', password: 'correct-horse',
      role: 'manager', managerInviteCode: process.env.MANAGER_INVITE_CODE
    });
    const firstAgent = await readProfile(firstAgentToken);
    const secondAgent = await readProfile(secondAgentToken);
    const managerHeaders = { Authorization: `Bearer ${managerToken}` };

    const agentList = await request(app).get('/api/invoices/agents').set(managerHeaders);
    const created = await request(app).post('/api/invoices').set(managerHeaders).send({
      invoiceNumber: `${secondAgent.agent_code}323456789012`,
      clientName: 'Fabrikam',
      amount: 240,
      status: 'unpaid',
      issueDate: '2026-09-14',
      salesAgentId: secondAgent.id
    });
    const invoiceId = created.body.invoice?.id;
    const details = await request(app).get(`/api/invoices/${invoiceId}`).set(managerHeaders);
    const changed = await request(app).patch(`/api/invoices/${invoiceId}`).set(managerHeaders).send({
      status: 'paid',
      dueDate: '2026-10-01',
      salesAgentId: firstAgent.id
    });
    const deniedAgents = await request(app).get('/api/invoices/agents').set('Authorization', `Bearer ${firstAgentToken}`);
    const ownerDetails = await request(app).get(`/api/invoices/${invoiceId}`).set('Authorization', `Bearer ${firstAgentToken}`);
    const ownerUpdate = await request(app).patch(`/api/invoices/${invoiceId}`).set('Authorization', `Bearer ${firstAgentToken}`).send({
      status: 'unpaid',
      dueDate: '2026-10-10',
      amount: 260,
      issueDate: '2026-09-15',
      clientId: null,
      clientName: 'Updated Fabrikam'
    });
    const otherAgentDetails = await request(app).get(`/api/invoices/${invoiceId}`).set('Authorization', `Bearer ${secondAgentToken}`);
    const otherAgentUpdate = await request(app).patch(`/api/invoices/${invoiceId}`).set('Authorization', `Bearer ${secondAgentToken}`).send({ status: 'unpaid' });

    assert.equal(agentList.status, 200);
    assert.equal(agentList.body.agents.some((agent) => agent.id === firstAgent.id), true);
    assert.equal(agentList.body.agents.some((agent) => agent.id === secondAgent.id), true);
    assert.equal(created.status, 201);
    assert.equal(created.body.invoice.agent_name, secondAgent.username);
    assert.equal(details.status, 200);
    assert.equal(details.body.invoice.amount_cents, 24000);
    assert.equal(changed.status, 200);
    assert.equal(changed.body.invoice.status, 'paid');
    assert.equal(changed.body.invoice.due_date, '2026-10-01');
    assert.equal(changed.body.invoice.agent_name, firstAgent.username);
    assert.equal(changed.body.invoice.invoice_number.slice(0, 4), firstAgent.agent_code);
    assert.equal(deniedAgents.status, 403);
    assert.equal(ownerDetails.status, 200);
    assert.equal(ownerUpdate.status, 200);
    assert.equal(ownerUpdate.body.invoice.due_date, '2026-10-10');
    assert.equal(ownerUpdate.body.invoice.amount_cents, 26000);
    assert.equal(ownerUpdate.body.invoice.issue_date, '2026-09-15');
    assert.equal(ownerUpdate.body.invoice.client_name, 'Updated Fabrikam');
    assert.equal(otherAgentDetails.status, 404);
    assert.equal(otherAgentUpdate.status, 404);
  });

  it('links selected clients, keeps manual names, and enforces client visibility', async () => {
    const firstAgentToken = await registerAndLogin({
      username: 'client-choice-agent-one', email: 'client-choice-one@example.com', password: 'correct-horse'
    });
    const secondAgentToken = await registerAndLogin({
      username: 'client-choice-agent-two', email: 'client-choice-two@example.com', password: 'correct-horse'
    });
    const managerToken = await registerAndLogin({
      username: 'client-choice-manager', email: 'client-choice-manager@example.com', password: 'correct-horse',
      role: 'manager', managerInviteCode: process.env.MANAGER_INVITE_CODE
    });
    const firstAgent = await readProfile(firstAgentToken);
    const secondAgent = await readProfile(secondAgentToken);
    const firstClient = await request(app).post('/api/clients').set('Authorization', `Bearer ${firstAgentToken}`).send({
      shopName: 'Owned Shop', firstName: 'Owned', lastName: 'Client', phoneNumber: '555-1101', address: '11 Main Street'
    });
    const secondClient = await request(app).post('/api/clients').set('Authorization', `Bearer ${secondAgentToken}`).send({
      shopName: 'Other Shop', firstName: 'Other', lastName: 'Client', phoneNumber: '555-1102', address: '12 Main Street'
    });
    const suffix = String(Date.now()).slice(-12).padStart(12, '0');
    const selectedClientInvoice = await request(app).post('/api/invoices').set('Authorization', `Bearer ${firstAgentToken}`).send({
      invoiceNumber: `${firstAgent.agent_code}${suffix}`,
      clientId: firstClient.body.client.id,
      amount: 75,
      status: 'unpaid',
      issueDate: '2026-09-20'
    });
    const manualNameInvoice = await request(app).post('/api/invoices').set('Authorization', `Bearer ${firstAgentToken}`).send({
      invoiceNumber: `${firstAgent.agent_code}${String(Number(suffix) + 1).padStart(12, '0')}`,
      clientName: 'Walk-in client',
      amount: 25,
      issueDate: '2026-09-21'
    });
    const forbiddenClientInvoice = await request(app).post('/api/invoices').set('Authorization', `Bearer ${firstAgentToken}`).send({
      invoiceNumber: `${firstAgent.agent_code}${String(Number(suffix) + 2).padStart(12, '0')}`,
      clientId: secondClient.body.client.id,
      amount: 50,
      issueDate: '2026-09-22'
    });
    const managerInvoice = await request(app).post('/api/invoices').set('Authorization', `Bearer ${managerToken}`).send({
      invoiceNumber: `${firstAgent.agent_code}${String(Number(suffix) + 3).padStart(12, '0')}`,
      clientId: secondClient.body.client.id,
      salesAgentId: firstAgent.id,
      amount: 50,
      issueDate: '2026-09-23'
    });

    assert.equal(selectedClientInvoice.status, 201);
    assert.equal(selectedClientInvoice.body.invoice.client_id, firstClient.body.client.id);
    assert.equal(selectedClientInvoice.body.invoice.client_name, 'Owned Client');
    assert.equal(manualNameInvoice.status, 201);
    assert.equal(manualNameInvoice.body.invoice.client_id, null);
    assert.equal(manualNameInvoice.body.invoice.client_name, 'Walk-in client');
    assert.equal(forbiddenClientInvoice.status, 404);
    assert.equal(managerInvoice.status, 201);
    assert.equal(managerInvoice.body.invoice.client_id, secondClient.body.client.id);
    assert.equal(managerInvoice.body.invoice.client_name, 'Other Client');
    assert.equal(secondAgent.role, 'sales_agent');
  });

  it('rejects invalid invoice values and invalid reporting periods', async () => {
    const token = await registerAndLogin({
      username: 'agent', email: 'agent@example.com', password: 'correct-horse'
    });
    const invalidInvoice = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ invoiceNumber: 'INV-X', clientName: 'Client', amount: -5 });
    const invalidPeriod = await request(app)
      .get('/api/invoices?period=last-century')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(invalidInvoice.status, 400);
    assert.equal(invalidPeriod.status, 400);
  });
});

describe('agent management API', () => {
  it('sets and updates commission rates and reports paid and unpaid commission by period', async () => {
    const manager = { username: 'commission-manager', email: 'commission-manager@example.com', password: 'correct-horse', role: 'manager', managerInviteCode: process.env.MANAGER_INVITE_CODE };
    await request(app).post('/api/auth/register').send(manager);
    const managerLogin = await request(app).post('/api/auth/login').send({ email: manager.email, password: manager.password });
    const managerHeaders = { Authorization: `Bearer ${managerLogin.body.token}` };
    const created = await request(app).post('/api/agents').set(managerHeaders)
      .field('firstName', 'Commission')
      .field('lastName', 'Agent')
      .field('phoneNumber', '555-0210')
      .field('email', 'commission.agent@example.com')
      .field('password', 'initial-password')
      .field('commissionPercentage', '10');
    const agentId = created.body.agent?.id;
    const createdDetails = await request(app).get(`/api/agents/${agentId}`).set(managerHeaders);
    const updated = await request(app).patch(`/api/agents/${agentId}`).set(managerHeaders).send({ commissionPercentage: 12.5 });
    const agentLogin = await request(app).post('/api/auth/login').send({ email: 'commission.agent@example.com', password: 'initial-password' });
    const agentHeaders = { Authorization: `Bearer ${agentLogin.body.token}` };
    const agent = await request(app).get('/api/auth/profile').set(agentHeaders);
    const paidInvoice = await request(app).post('/api/invoices').set(managerHeaders).send({
      invoiceNumber: `${createdDetails.body.agent.agent_code}123456789012`, salesAgentId: agentId,
      clientName: 'Commission paid', amount: 100, status: 'paid', issueDate: '2026-09-15'
    });
    const unpaidInvoice = await request(app).post('/api/invoices').set(managerHeaders).send({
      invoiceNumber: `${createdDetails.body.agent.agent_code}123456789013`, salesAgentId: agentId,
      clientName: 'Commission pending', amount: 80, status: 'unpaid', issueDate: '2026-09-16'
    });
    const managerReport = await request(app).get(`/api/agents/${agentId}/commission?period=month-2026-09`).set(managerHeaders);
    const agentReport = await request(app).get(`/api/agents/${agentId}/commission?period=month-2026-09`).set(agentHeaders);
    const deniedReport = await request(app).get(`/api/agents/${agentId + 1}/commission?period=all-time`).set(agentHeaders);
    const invalidRate = await request(app).patch(`/api/agents/${agentId}`).set(managerHeaders).send({ commissionPercentage: 100.01 });

    assert.equal(created.status, 201);
    assert.deepEqual(created.body.agent, { id: agentId });
    assert.equal(createdDetails.body.agent.commission_rate_basis_points, 1000);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.agent.commission_rate_basis_points, 1250);
    assert.equal('commission_rate_basis_points' in agent.body.user, false);
    assert.equal(paidInvoice.status, 201);
    assert.equal(unpaidInvoice.status, 201);
    assert.equal(managerReport.body.commissionPercentage, 12.5);
    assert.equal(managerReport.body.summary.paid_commission_cents, 1250);
    assert.equal(managerReport.body.summary.unpaid_commission_cents, 1000);
    assert.equal(managerReport.body.summary.paid_invoice_amount_cents, 10000);
    assert.equal(managerReport.body.summary.unpaid_invoice_amount_cents, 8000);
    assert.deepEqual(managerReport.body.series.map((point) => point.bucket), ['2026-09-15', '2026-09-16']);
    assert.equal(agentReport.status, 200);
    assert.equal(deniedReport.status, 403);
    assert.equal(invalidRate.status, 400);
  });

  it('creates agent profiles, accepts photos, and blocks active sessions', async () => {
    const manager = { username: 'profile-manager', email: 'profile-manager@example.com', password: 'correct-horse', role: 'manager', managerInviteCode: process.env.MANAGER_INVITE_CODE };
    await request(app).post('/api/auth/register').send(manager);
    const managerLogin = await request(app).post('/api/auth/login').send({ email: manager.email, password: manager.password });
    const managerToken = managerLogin.body.token;
    const managerHeaders = { Authorization: `Bearer ${managerToken}` };
    const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z6sAAAAASUVORK5CYII=', 'base64');
    let photoPath;

    try {
      const created = await request(app)
        .post('/api/agents')
        .set(managerHeaders)
        .field('firstName', 'Taylor')
        .field('lastName', 'Morgan')
        .field('phoneNumber', '+1 555 0100')
        .field('email', 'taylor.morgan@example.com')
        .field('password', 'initial-password')
        .attach('profilePhoto', photo, { filename: 'agent.png', contentType: 'image/png' });
      const agentId = created.body.agent?.id;
      const detail = await request(app).get(`/api/agents/${agentId}`).set(managerHeaders);
      photoPath = detail.body.agent?.profile_photo_path;

      assert.equal(created.status, 201);
      assert.deepEqual(created.body.agent, { id: agentId });
      assert.equal(detail.body.agent.first_name, 'Taylor');
      assert.equal(detail.body.agent.last_name, 'Morgan');
      assert.equal(detail.body.agent.phone_number, '+1 555 0100');
      assert.equal(detail.body.agent.id_number, null);
      assert.match(detail.body.agent.agent_code, /^\d{4}$/);
      assert.equal(typeof photoPath, 'string');

      const agentLogin = await request(app).post('/api/auth/login').send({
        email: 'taylor.morgan@example.com', password: 'initial-password'
      });
      const agentToken = agentLogin.body.token;
      const agentProfile = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${agentToken}`);
      const agentList = await request(app).get('/api/agents').set(managerHeaders);
      const deniedDetails = await request(app).get(`/api/agents/${agentId}`).set('Authorization', `Bearer ${agentToken}`);
      const blocked = await request(app)
        .patch(`/api/agents/${agentId}/block`)
        .set(managerHeaders)
        .send({ blocked: true });
      const blockedProfile = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${agentToken}`);
      const blockedLogin = await request(app).post('/api/auth/login').send({
        email: 'taylor.morgan@example.com', password: 'initial-password'
      });
      const unblocked = await request(app)
        .patch(`/api/agents/${agentId}/block`)
        .set(managerHeaders)
        .send({ blocked: false });
      const restoredProfile = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${agentToken}`);

      assert.equal(agentLogin.status, 200);
      assert.equal('phone_number' in agentProfile.body.user, false);
      assert.equal('id_number' in agentProfile.body.user, false);
      assert.equal('commission_rate_basis_points' in agentProfile.body.user, false);
      assert.equal(detail.body.agent.email, 'taylor.morgan@example.com');
      assert.equal(agentList.body.agents.some((agent) => agent.id === agentId), true);
      assert.equal('phone_number' in agentList.body.agents[0], false);
      assert.equal('id_number' in agentList.body.agents[0], false);
      assert.equal(deniedDetails.status, 403);
      assert.equal(blocked.body.agent.is_blocked, 1);
      assert.equal(blockedProfile.status, 403);
      assert.equal(blockedProfile.body.message, 'This account has been blocked.');
      assert.equal(blockedLogin.status, 403);
      assert.equal(unblocked.body.agent.is_blocked, 0);
      assert.equal(restoredProfile.status, 200);
    } finally {
      if (photoPath) {
        const storedPhoto = path.join(__dirname, '..', 'uploads', 'agent-profiles', photoPath);
        if (fs.existsSync(storedPhoto)) fs.unlinkSync(storedPhoto);
      }
    }
  });

  it('requires manager access and validates uploaded profile images', async () => {
    const agent = { username: 'limited-agent', email: 'limited-agent@example.com', password: 'correct-horse' };
    await request(app).post('/api/auth/register').send(agent);
    const login = await request(app).post('/api/auth/login').send({ email: agent.email, password: agent.password });
    const deniedList = await request(app).get('/api/agents').set('Authorization', `Bearer ${login.body.token}`);

    const manager = { username: 'validation-manager', email: 'validation-manager@example.com', password: 'correct-horse', role: 'manager', managerInviteCode: process.env.MANAGER_INVITE_CODE };
    await request(app).post('/api/auth/register').send(manager);
    const managerLogin = await request(app).post('/api/auth/login').send({ email: manager.email, password: manager.password });
    const invalidPhoto = await request(app)
      .post('/api/agents')
      .set('Authorization', `Bearer ${managerLogin.body.token}`)
      .field('firstName', 'Image')
      .field('lastName', 'Rejected')
      .field('phoneNumber', '5550101')
      .field('email', 'image.rejected@example.com')
      .field('password', 'initial-password')
      .attach('profilePhoto', Buffer.from('not-an-image'), { filename: 'payload.png', contentType: 'image/png' });

    assert.equal(deniedList.status, 403);
    assert.equal(invalidPhoto.status, 400);
  });
});

describe('client management API', () => {
  async function registerAndLogin(user) {
    const registration = await request(app).post('/api/auth/register').send(user);
    assert.equal(registration.status, 201);
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    return login.body.token;
  }

  async function profileFor(token) {
    const response = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
    return response.body.user;
  }

  it('creates, lists, edits, and scopes clients for managers and assigned agents', async () => {
    db.prepare('DELETE FROM clients').run();
    const firstAgentToken = await registerAndLogin({ username: 'client-agent-one', email: 'client-agent-one@example.com', password: 'correct-horse' });
    const secondAgentToken = await registerAndLogin({ username: 'client-agent-two', email: 'client-agent-two@example.com', password: 'correct-horse' });
    const managerToken = await registerAndLogin({
      username: 'client-manager', email: 'client-manager@example.com', password: 'correct-horse',
      role: 'manager', managerInviteCode: process.env.MANAGER_INVITE_CODE
    });
    const firstAgent = await profileFor(firstAgentToken);
    const secondAgent = await profileFor(secondAgentToken);
    const managerHeaders = { Authorization: `Bearer ${managerToken}` };
    const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z6sAAAAASUVORK5CYII=', 'base64');
    let photoPath;

    try {
      const assignedClient = await request(app)
        .post('/api/clients')
        .set(managerHeaders)
        .field('shopName', 'Avery Shop')
        .field('firstName', 'Avery')
        .field('lastName', 'Shop')
        .field('phoneNumber', '555-0101')
        .field('address', '10 Market Street')
        .field('location', 'North district')
        .field('assignedAgentId', String(firstAgent.id))
        .attach('shopPhoto', photo, { filename: 'shop.png', contentType: 'image/png' });
      photoPath = assignedClient.body.client?.shop_photo_path;
      const agentClient = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${firstAgentToken}`)
        .send({ shopName: 'Jordan Store', firstName: 'Jordan', lastName: 'Store', phoneNumber: '555-0102', address: '22 Main Road' });
      const unassignedClient = await request(app)
        .post('/api/clients')
        .set(managerHeaders)
        .send({ shopName: 'Casey Market', firstName: 'Casey', lastName: 'Market', phoneNumber: '555-0103', address: '8 River Avenue' });
      const invalidClient = await request(app)
        .post('/api/clients')
        .set(managerHeaders)
        .send({ shopName: 'Missing Address', firstName: 'Missing', lastName: 'Address', phoneNumber: '555-0104' });
      const missingShopName = await request(app)
        .post('/api/clients')
        .set(managerHeaders)
        .send({ firstName: 'No', lastName: 'Shop Name', phoneNumber: '555-0105', address: '15 Main Road' });

      const firstAgentClients = await request(app).get('/api/clients').set('Authorization', `Bearer ${firstAgentToken}`);
      const secondAgentClients = await request(app).get('/api/clients').set('Authorization', `Bearer ${secondAgentToken}`);
      const managerClients = await request(app).get('/api/clients').set(managerHeaders);
      const moved = await request(app)
        .patch(`/api/clients/${assignedClient.body.client.id}`)
        .set(managerHeaders)
        .send({ assignedAgentId: secondAgent.id, location: 'West district' });
      const deniedMovedClient = await request(app)
        .get(`/api/clients/${assignedClient.body.client.id}`)
        .set('Authorization', `Bearer ${firstAgentToken}`);
      const visibleMovedClient = await request(app)
        .get(`/api/clients/${assignedClient.body.client.id}`)
        .set('Authorization', `Bearer ${secondAgentToken}`);
      const forbiddenReassignment = await request(app)
        .patch(`/api/clients/${assignedClient.body.client.id}`)
        .set('Authorization', `Bearer ${secondAgentToken}`)
        .field('assignedAgentId', String(firstAgent.id));
      const editedClient = await request(app)
        .patch(`/api/clients/${assignedClient.body.client.id}`)
        .set('Authorization', `Bearer ${secondAgentToken}`)
        .field('address', '12 Market Street');

      assert.equal(assignedClient.status, 201);
      assert.equal(assignedClient.body.client.shop_name, 'Avery Shop');
      assert.equal(assignedClient.body.client.location, 'North district');
      assert.equal(assignedClient.body.client.assigned_agent_id, firstAgent.id);
      assert.equal('created_by_user_id' in assignedClient.body.client, false);
      assert.equal('created_at' in assignedClient.body.client, false);
      assert.equal('updated_at' in assignedClient.body.client, false);
      assert.equal(typeof photoPath, 'string');
      assert.equal(agentClient.status, 201);
      assert.equal(agentClient.body.client.location, null);
      assert.equal(agentClient.body.client.shop_photo_path, null);
      assert.equal(agentClient.body.client.assigned_agent_id, firstAgent.id);
      assert.equal(unassignedClient.body.client.assigned_agent_id, null);
      assert.equal(invalidClient.status, 400);
      assert.equal(missingShopName.status, 400);
      assert.equal(firstAgentClients.body.clients.length, 2);
      assert.equal(secondAgentClients.body.clients.length, 0);
      assert.equal(managerClients.body.clients.length, 3);
      assert.equal(moved.body.client.assigned_agent_id, secondAgent.id);
      assert.equal(moved.body.client.location, 'West district');
      assert.equal(deniedMovedClient.status, 404);
      assert.equal(visibleMovedClient.status, 200);
      assert.equal(forbiddenReassignment.status, 403);
      assert.equal(editedClient.body.client.address, '12 Market Street');
      assert.equal(editedClient.body.client.shop_name, 'Avery Shop');
      assert.equal(editedClient.body.client.assigned_agent_id, secondAgent.id);
    } finally {
      if (photoPath) {
        const storedPhoto = path.join(__dirname, '..', 'uploads', 'client-shops', photoPath);
        if (fs.existsSync(storedPhoto)) fs.unlinkSync(storedPhoto);
      }
    }
  });
});

after(() => {
  db.close();
});