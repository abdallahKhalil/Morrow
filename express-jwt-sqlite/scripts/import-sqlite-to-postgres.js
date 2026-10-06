const fs = require('node:fs/promises')
const path = require('node:path')
const Database = require('better-sqlite3')
const db = require('../src/config/database')
const { saveImage } = require('../src/storage/imageStore')

const sourcePath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'users.db'))
const uploadRoot = path.join(__dirname, '..', 'uploads')
const mimeTypes = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
])

async function importPhoto(folder, storedName) {
  if (!storedName) return null
  if (path.basename(storedName) !== storedName) throw new Error(`Unsafe photo path: ${storedName}`)
  const extension = path.extname(storedName).toLowerCase()
  const mimetype = mimeTypes.get(extension)
  if (!mimetype) throw new Error(`Unsupported photo extension: ${extension}`)
  const buffer = await fs.readFile(path.join(uploadRoot, folder, storedName))
  return saveImage(folder, { buffer, mimetype })
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the empty PostgreSQL target database.')
  if (!process.env.NETLIFY_SITE_ID || !process.env.NETLIFY_AUTH_TOKEN) {
    throw new Error('Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN so existing photos can be copied to Netlify Blobs.')
  }

  const source = new Database(sourcePath, { readonly: true })
  try {
    await db.initialize()
    const destinationCounts = await Promise.all(['users', 'clients', 'invoices'].map(async (table) => {
      const result = await db.query(`SELECT COUNT(*) AS count FROM ${table}`);
      return Number(result.rows[0].count);
    }));
    if (destinationCounts.some((count) => count > 0)) {
      throw new Error('The PostgreSQL destination must be empty before importing SQLite data.');
    }

    const users = source.prepare('SELECT * FROM users ORDER BY id').all()
    const clients = source.prepare('SELECT * FROM clients ORDER BY id').all()
    const invoices = source.prepare('SELECT * FROM invoices ORDER BY id').all()

    for (const user of users) {
      const profilePhotoPath = await importPhoto('agent-profiles', user.profile_photo_path)
      await db.prepare(`
        INSERT INTO users (
          id, username, email, password, role, agent_code, commission_rate_basis_points,
          first_name, last_name, phone_number, id_number, profile_photo_path, is_blocked, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING
      `).run(
        user.id, user.username, user.email, user.password, user.role, user.agent_code,
        user.commission_rate_basis_points ?? 0, user.first_name, user.last_name,
        user.phone_number, user.id_number, profilePhotoPath, user.is_blocked ?? 0, user.created_at,
      )
    }

    for (const client of clients) {
      const shopPhotoPath = await importPhoto('client-shops', client.shop_photo_path)
      await db.prepare(`
        INSERT INTO clients (
          id, shop_name, first_name, last_name, phone_number, address, location,
          assigned_agent_id, created_by_user_id, shop_photo_path, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING
      `).run(
        client.id, client.shop_name ?? 'Shop', client.first_name, client.last_name,
        client.phone_number, client.address, client.location, client.assigned_agent_id,
        client.created_by_user_id, shopPhotoPath, client.created_at, client.updated_at,
      )
    }

    for (const invoice of invoices) {
      await db.prepare(`
        INSERT INTO invoices (
          id, user_id, client_id, invoice_number, client_name, amount_cents,
          status, issue_date, due_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING
      `).run(
        invoice.id, invoice.user_id, invoice.client_id ?? null, invoice.invoice_number,
        invoice.client_name, invoice.amount_cents, invoice.status, invoice.issue_date,
        invoice.due_date, invoice.created_at,
      )
    }

    for (const table of ['users', 'clients', 'invoices']) {
      await db.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM ${table}`)
    }

    console.log(`Imported ${users.length} users, ${clients.length} clients, and ${invoices.length} invoices.`)
    console.log('Imported photos to Netlify Blobs. Review the destination before removing the local database and uploads.')
  } finally {
    source.close()
    await db.close()
  }
}

main().catch((error) => {
  console.error('SQLite import failed:', error.message)
  process.exitCode = 1
})