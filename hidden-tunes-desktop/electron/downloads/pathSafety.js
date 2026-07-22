'use strict'

const path = require('path')
const {
  WINDOWS_RESERVED,
  FAMILY_DIRS,
  PARTIAL_SUFFIX,
  DOWNLOADABLE_TYPES,
} = require('./constants')

function assertInsideRoot(rootDir, candidatePath) {
  const root = path.resolve(rootDir)
  const resolved = path.resolve(candidatePath)
  const relative = path.relative(root, resolved)
  if (
    relative === ''
    || relative.startsWith('..')
    || path.isAbsolute(relative)
  ) {
    // Allow exact root only for directory creation; files must be nested.
    if (resolved === root) return resolved
    throw new Error('Path escapes Downloads root.')
  }
  return resolved
}

function rejectUnsafeUserPath(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Invalid path.')
  }
  const value = input.trim()
  if (value.includes('\0')) throw new Error('Invalid path.')
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    throw new Error('Absolute path rejected.')
  }
  if (value.includes('..')) throw new Error('Path traversal rejected.')
  if (path.isAbsolute(value)) throw new Error('Absolute path rejected.')
  return value
}

function sanitizeSegment(raw, fallback = 'item') {
  const base = String(raw || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  const cleaned = base.replace(/[. ]+$/g, '') || fallback
  const upper = cleaned.toUpperCase()
  if (WINDOWS_RESERVED.has(upper)) return `${cleaned}_file`
  return cleaned
}

function identityKey(type, id) {
  return `${type}:${String(id).trim()}`
}

function relativePathForItem(type, id, ext = 'bin') {
  if (!DOWNLOADABLE_TYPES.has(type)) {
    throw new Error('Unsupported download family.')
  }
  const family = FAMILY_DIRS[type]
  const safeId = sanitizeSegment(id, 'id')
  const safeExt = sanitizeSegment(ext.replace(/^\./, ''), 'bin').toLowerCase()
  return path.join(family, `${safeId}.${safeExt}`)
}

function partialRelativePath(relativePath) {
  rejectUnsafeUserPath(relativePath.replace(/\\/g, '/'))
  return `${relativePath}${PARTIAL_SUFFIX}`
}

function extensionFromContentType(contentType, urlPath) {
  const ct = String(contentType || '').toLowerCase()
  if (ct.includes('mpeg') || ct.includes('mp3')) return 'mp3'
  if (ct.includes('mp4') || ct.includes('m4a') || ct.includes('aac')) return 'm4a'
  if (ct.includes('ogg')) return 'ogg'
  if (ct.includes('wav')) return 'wav'
  if (ct.includes('webm')) return 'webm'
  if (ct.includes('flac')) return 'flac'
  const fromUrl = String(urlPath || '').split('?')[0].split('.').pop()
  if (fromUrl && /^[a-z0-9]{2,5}$/i.test(fromUrl) && fromUrl.toLowerCase() !== 'm3u8') {
    return fromUrl.toLowerCase()
  }
  return 'bin'
}

module.exports = {
  assertInsideRoot,
  rejectUnsafeUserPath,
  sanitizeSegment,
  identityKey,
  relativePathForItem,
  partialRelativePath,
  extensionFromContentType,
}
