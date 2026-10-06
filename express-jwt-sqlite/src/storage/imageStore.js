const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const imageExtensions = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
])
const imageTypes = new Map([...imageExtensions].map(([type, extension]) => [extension, type]))
const allowedFolders = new Set(['agent-profiles', 'client-shops'])
const localUploadsPath = path.join(__dirname, '..', '..', 'uploads')
let blobsModule

function isNetlifyRuntime() {
  return process.env.NETLIFY === 'true' || process.env.NETLIFY_DEV === 'true' || process.env.NETLIFY_BLOBS_IMPORT === 'true'
}

async function getStore(folder) {
  blobsModule ??= import('@netlify/blobs')
  const { getStore } = await blobsModule
  const options = { name: `morrow-${folder}`, consistency: 'strong' }
  if (process.env.NETLIFY_BLOBS_IMPORT === 'true') {
    options.siteID = process.env.NETLIFY_SITE_ID
    options.token = process.env.NETLIFY_AUTH_TOKEN
  }
  return getStore(options)
}

function isValidImageSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) return false
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }
  return mimeType === 'image/webp' && buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
}

function isSafeImageKey(folder, key) {
  return allowedFolders.has(folder) && typeof key === 'string' && path.basename(key) === key && imageTypes.has(path.extname(key))
}

async function saveImage(folder, file) {
  if (!file) return null
  const extension = imageExtensions.get(file.mimetype)
  if (!allowedFolders.has(folder) || !extension) throw new Error('Unsupported image storage target.')
  const key = `${randomUUID()}${extension}`

  if (isNetlifyRuntime()) {
    const store = await getStore(folder)
    await store.set(key, new Blob([file.buffer], { type: file.mimetype }))
  } else {
    const directory = path.join(localUploadsPath, folder)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, key), file.buffer)
  }

  return key
}

async function readImage(folder, key) {
  if (!isSafeImageKey(folder, key)) return null
  const contentType = imageTypes.get(path.extname(key))

  if (isNetlifyRuntime()) {
    const store = await getStore(folder)
    const contents = await store.get(key, { type: 'arrayBuffer', consistency: 'strong' })
    return contents ? { buffer: Buffer.from(contents), contentType } : null
  }

  try {
    const buffer = await fs.readFile(path.join(localUploadsPath, folder, key))
    return { buffer, contentType }
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function deleteImage(folder, key) {
  if (!isSafeImageKey(folder, key)) return

  if (isNetlifyRuntime()) {
    const store = await getStore(folder)
    await store.delete(key)
    return
  }

  try {
    await fs.unlink(path.join(localUploadsPath, folder, key))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

module.exports = { deleteImage, isValidImageSignature, readImage, saveImage }