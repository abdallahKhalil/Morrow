const { Pool } = require('pg');
const path = require('node:path');

let pool;
let sqlite;
// Netlify Database exposes its connection string as NETLIFY_DB_URL; an explicit DATABASE_URL takes precedence.
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
const usePostgres = process.env.NODE_ENV === 'test' || Boolean(connectionString);
if (process.env.NODE_ENV === 'test') {
  const { newDb } = require('pg-mem');
  const memoryDatabase = newDb({ autoCreateForeignKeyIndices: true });
  const memoryAdapter = memoryDatabase.adapters.createPg();
  pool = new memoryAdapter.Pool();
} else if (usePostgres) {
  pool = new Pool({
    connectionString,
    max: process.env.NETLIFY ? 1 : 10,
  });
} else {
  if (process.env.NETLIFY === 'true') {
    throw new Error('DATABASE_URL or NETLIFY_DB_URL must be set to a persistent PostgreSQL database on Netlify.');
  }
  const databasePath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'users.db');
  const BetterSqlite3 = module.require('better-sqlite3');
  sqlite = new BetterSqlite3(databasePath);
}

let initialization;
const dateOnlyColumns = new Set(['issue_date', 'due_date', 'bucket']);

function initializeSqlite(database) {
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
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

  const userColumns = database.prepare('PRAGMA table_info(users)').all();
  for (const [column, definition] of [
    ['role', "TEXT NOT NULL DEFAULT 'sales_agent' CHECK (role IN ('manager', 'sales_agent'))"],
    ['agent_code', 'TEXT'],
    ['commission_rate_basis_points', 'INTEGER NOT NULL DEFAULT 0 CHECK (commission_rate_basis_points BETWEEN 0 AND 10000)'],
    ['first_name', 'TEXT'],
    ['last_name', 'TEXT'],
    ['phone_number', 'TEXT'],
    ['id_number', 'TEXT'],
    ['profile_photo_path', 'TEXT'],
    ['is_blocked', 'INTEGER NOT NULL DEFAULT 0'],
  ]) {
    if (!userColumns.some((existing) => existing.name === column)) {
      database.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
    }
  }

  database.exec(`
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
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      invoice_number TEXT NOT NULL UNIQUE,
      client_name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid')),
      issue_date TEXT NOT NULL,
      due_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS invoices_user_issue_date ON invoices(user_id, issue_date);
    CREATE INDEX IF NOT EXISTS invoices_client_id ON invoices(client_id);
    CREATE INDEX IF NOT EXISTS clients_assigned_agent ON clients(assigned_agent_id);
    CREATE UNIQUE INDEX IF NOT EXISTS users_agent_code_unique ON users(agent_code) WHERE agent_code IS NOT NULL;
  `);

  const clientColumns = database.prepare('PRAGMA table_info(clients)').all();
  if (!clientColumns.some((column) => column.name === 'shop_name')) {
    database.exec("ALTER TABLE clients ADD COLUMN shop_name TEXT NOT NULL DEFAULT 'Shop'");
  }
  const invoiceColumns = database.prepare('PRAGMA table_info(invoices)').all();
  if (!invoiceColumns.some((column) => column.name === 'client_id')) {
    database.exec('ALTER TABLE invoices ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL');
  }
}

function toPostgresPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

const db = {
  async query(sql, parameters = []) {
    if (sqlite) {
      const statement = sqlite.prepare(sql);
      if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql)) {
        const rows = statement.all(...parameters);
        return { rows, rowCount: rows.length };
      }
      const result = statement.run(...parameters);
      return { rows: [], rowCount: result.changes, ...result };
    }

    const result = await pool.query(toPostgresPlaceholders(sql), parameters);
    result.rows = result.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
      if (!(value instanceof Date)) return [key, value];
      return [key, dateOnlyColumns.has(key) ? value.toISOString().slice(0, 10) : value.toISOString()];
    })));
    return result;
  },

  prepare(sql) {
    return {
      async get(...parameters) {
        if (sqlite) return sqlite.prepare(sql).get(...parameters);
        const result = await db.query(sql, parameters);
        return result.rows[0];
      },
      async all(...parameters) {
        if (sqlite) return sqlite.prepare(sql).all(...parameters);
        const result = await db.query(sql, parameters);
        return result.rows;
      },
      async run(...parameters) {
        if (sqlite) return sqlite.prepare(sql).run(...parameters);
        const insert = /^\s*INSERT\b/i.test(sql) && !/\bRETURNING\b/i.test(sql);
        const result = await db.query(insert ? `${sql.trim().replace(/;$/, '')} RETURNING id` : sql, parameters);
        return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount };
      },
    };
  },

  async initialize() {
    if (!initialization) {
      initialization = (async () => {
        if (sqlite) {
          initializeSqlite(sqlite);
        } else {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'sales_agent' CHECK (role IN ('manager', 'sales_agent')),
            agent_code TEXT UNIQUE,
            commission_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (commission_rate_basis_points BETWEEN 0 AND 10000),
            first_name TEXT,
            last_name TEXT,
            phone_number TEXT,
            id_number TEXT,
            profile_photo_path TEXT,
            is_blocked SMALLINT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS clients (
            id SERIAL PRIMARY KEY,
            shop_name TEXT NOT NULL DEFAULT 'Shop',
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            address TEXT NOT NULL,
            location TEXT,
            assigned_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            shop_photo_path TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS invoices (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
            invoice_number TEXT NOT NULL UNIQUE,
            client_name TEXT NOT NULL,
            amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
            status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid')),
            issue_date DATE NOT NULL,
            due_date DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS invoices_user_issue_date ON invoices(user_id, issue_date)');
        await pool.query('CREATE INDEX IF NOT EXISTS invoices_client_id ON invoices(client_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS clients_assigned_agent ON clients(assigned_agent_id)');
        await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS users_agent_code_unique ON users(agent_code) WHERE agent_code IS NOT NULL');
        }

        // Fill agent codes for rows imported from older databases before serving requests.
        const unassigned = await db.prepare("SELECT id FROM users WHERE role = 'sales_agent' AND agent_code IS NULL ORDER BY id").all();
        const usedCodes = new Set((await db.prepare('SELECT agent_code FROM users WHERE agent_code IS NOT NULL').all()).map((user) => user.agent_code));
        for (const agent of unassigned) {
          let nextCode = null;
          for (let value = 1; value <= 9999; value += 1) {
            const candidate = String(value).padStart(4, '0');
            if (!usedCodes.has(candidate)) {
              nextCode = candidate;
              break;
            }
          }
          if (!nextCode) throw new Error('No sales agent reference codes remain.');
          await db.prepare('UPDATE users SET agent_code = ? WHERE id = ?').run(nextCode, agent.id);
          usedCodes.add(nextCode);
        }
      })().catch((error) => {
        initialization = null;
        throw error;
      });
    }
    return initialization;
  },

  async close() {
    if (sqlite) sqlite.close();
    else await pool.end();
  },
};

module.exports = db;