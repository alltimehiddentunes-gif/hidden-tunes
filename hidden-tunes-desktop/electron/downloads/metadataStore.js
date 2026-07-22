'use strict'

const fs = require('fs')
const path = require('path')
const { SCHEMA_VERSION, METADATA_FILENAME, downloadsRoot } = require('./constants')
const { assertInsideRoot, rejectUnsafeUserPath } = require('./pathSafety')

function metadataDir(userDataPath) {
  return path.join(downloadsRoot(userDataPath), 'metadata')
}

function metadataPath(userDataPath) {
  return path.join(metadataDir(userDataPath), METADATA_FILENAME)
}

function emptyStore() {
  return {
    version: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    items: [],
  }
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const type = typeof raw.type === 'string' ? raw.type.trim() : ''
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const downloadId = typeof raw.downloadId === 'string' ? raw.downloadId.trim() : ''
  const status = typeof raw.status === 'string' ? raw.status.trim() : ''
  if (!id || !type || !title || !downloadId || !status) return null

  let localRelativePath = null
  if (typeof raw.localRelativePath === 'string' && raw.localRelativePath.trim()) {
    try {
      localRelativePath = rejectUnsafeUserPath(raw.localRelativePath.replace(/\\/g, '/'))
    } catch {
      return null
    }
  }

  return {
    id,
    type,
    title,
    downloadId,
    status,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : null,
    artwork: typeof raw.artwork === 'string' ? raw.artwork : null,
    sourceId: typeof raw.sourceId === 'string' ? raw.sourceId : id,
    parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
    showId: typeof raw.showId === 'string' ? raw.showId : null,
    bookId: typeof raw.bookId === 'string' ? raw.bookId : null,
    seriesId: typeof raw.seriesId === 'string' ? raw.seriesId : null,
    chapterId: typeof raw.chapterId === 'string' ? raw.chapterId : null,
    remoteUrlIdentity: typeof raw.remoteUrlIdentity === 'string' ? raw.remoteUrlIdentity : null,
    localRelativePath,
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : null,
    fileSize: typeof raw.fileSize === 'number' ? raw.fileSize : null,
    downloadedBytes: typeof raw.downloadedBytes === 'number' ? raw.downloadedBytes : 0,
    duration: typeof raw.duration === 'number' ? raw.duration : null,
    checksum: typeof raw.checksum === 'string' ? raw.checksum : null,
    expiresAt: typeof raw.expiresAt === 'string' ? raw.expiresAt : null,
    errorCode: typeof raw.errorCode === 'string' ? raw.errorCode : null,
    errorMessage: typeof raw.errorMessage === 'string' ? raw.errorMessage : null,
    retryCount: typeof raw.retryCount === 'number' ? raw.retryCount : 0,
    isMature: raw.isMature === true,
    contentRating: typeof raw.contentRating === 'string' ? raw.contentRating : null,
    supportsRange: raw.supportsRange === true,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : null,
  }
}

function readStore(userDataPath) {
  const file = metadataPath(userDataPath)
  try {
    if (!fs.existsSync(file)) return emptyStore()
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!raw || raw.version !== SCHEMA_VERSION || !Array.isArray(raw.items)) {
      return emptyStore()
    }
    const items = raw.items.map(normalizeItem).filter(Boolean)
    return {
      version: SCHEMA_VERSION,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      items,
    }
  } catch {
    return emptyStore()
  }
}

function writeStoreAtomic(userDataPath, store) {
  const dir = metadataDir(userDataPath)
  fs.mkdirSync(dir, { recursive: true })
  const file = metadataPath(userDataPath)
  const tmp = `${file}.tmp`
  const payload = {
    version: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    items: store.items.map(normalizeItem).filter(Boolean),
  }
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8')
  try {
    fs.renameSync(tmp, file)
  } catch (error) {
    // Windows can deny replace-via-rename when the destination exists.
    if (error && (error.code === 'EPERM' || error.code === 'EEXIST')) {
      fs.copyFileSync(tmp, file)
      try {
        fs.unlinkSync(tmp)
      } catch {
        // ignore
      }
    } else {
      throw error
    }
  }
  return payload
}

function absoluteFromRelative(userDataPath, relativePath) {
  const root = downloadsRoot(userDataPath)
  const cleaned = rejectUnsafeUserPath(String(relativePath).replace(/\\/g, '/'))
  const absolute = path.join(root, cleaned)
  return assertInsideRoot(root, absolute)
}

module.exports = {
  metadataPath,
  metadataDir,
  emptyStore,
  normalizeItem,
  readStore,
  writeStoreAtomic,
  absoluteFromRelative,
}
