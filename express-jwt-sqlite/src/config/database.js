const path = require('node:path');
const Database = require('better-sqlite3');

const databasePath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'users.db');
const db = new Database(databasePath);

db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'sales_agent' CHECK (role IN ('manager', 'sales_agent')),
    agent_code TEXT,
    commission_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (commission_rate_basis_points BETWEEN 0 AND 10000),
    first_name TEXT,
    last_name TEXT,
    phone_number TEXT,
    id_number TEXT,
    profile_photo_path TEXT,
    is_blocked INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all();
// Add missing columns in place so existing local databases do not need to be recreated.
if (!userColumns.some((column) => column.name === 'role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'sales_agent' CHECK (role IN ('manager', 'sales_agent'))");
}
if (!userColumns.some((column) => column.name === 'agent_code')) {
  db.exec('ALTER TABLE users ADD COLUMN agent_code TEXT');
}
if (!userColumns.some((column) => column.name === 'commission_rate_basis_points')) {
  db.exec('ALTER TABLE users ADD COLUMN commission_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (commission_rate_basis_points BETWEEN 0 AND 10000)');
}
for (const [column, definition] of [
  ['first_name', 'TEXT'],
  ['last_name', 'TEXT'],
  ['phone_number', 'TEXT'],
  ['id_number', 'TEXT'],
  ['profile_photo_path', 'TEXT'],
  ['is_blocked', 'INTEGER NOT NULL DEFAULT 0'],
]) {
  if (!userColumns.some((existingColumn) => existingColumn.name === column)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
  }
}

db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_agent_code_unique ON users(agent_code) WHERE agent_code IS NOT NULL');

const nextAgentCode = require('../agentCode');
const unassignedAgents = db.prepare("SELECT id FROM users WHERE role = 'sales_agent' AND agent_code IS NULL ORDER BY id").all();
const assignAgentCode = db.prepare('UPDATE users SET agent_code = ? WHERE id = ?');
// Assign all legacy agent codes atomically so a failure cannot leave a partial migration.
const migrateAgentCodes = db.transaction(() => {
  for (const agent of unassignedAgents) {
    assignAgentCode.run(nextAgentCode(db), agent.id);
  }
});
migrateAgentCodes();

db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL UNIQUE,
    client_name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid')),
    issue_date TEXT NOT NULL,
    due_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS invoices_user_issue_date ON invoices(user_id, issue_date);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_name TEXT NOT NULL DEFAULT 'Shop',
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    address TEXT NOT NULL,
    location TEXT,
    assigned_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    shop_photo_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS clients_assigned_agent ON clients(assigned_agent_id);
`);

const clientColumns = db.prepare('PRAGMA table_info(clients)').all();
if (!clientColumns.some((column) => column.name === 'shop_name')) {
  db.exec("ALTER TABLE clients ADD COLUMN shop_name TEXT NOT NULL DEFAULT 'Shop'");
}

const invoiceColumns = db.prepare('PRAGMA table_info(invoices)').all();
if (!invoiceColumns.some((column) => column.name === 'client_id')) {
  db.exec('ALTER TABLE invoices ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL');
}
db.exec('CREATE INDEX IF NOT EXISTS invoices_client_id ON invoices(client_id)');

module.exports = db;