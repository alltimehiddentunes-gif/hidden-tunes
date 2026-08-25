'use strict'

const {
  DOWNLOADABLE_TYPES,
  STREAM_ONLY_TYPES,
  APPROVED_MEDIA_HOSTS,
  APPROVED_MEDIA_HOST_SUFFIXES,
} = require('./constants')

function classifyDownloadability(type) {
  if (STREAM_ONLY_TYPES.has(type)) return 'stream_only'
  if (DOWNLOADABLE_TYPES.has(type)) return 'downloadable'
  return 'unsupported'
}

function hostAllowed(hostname) {
  const host = String(hostname || '').toLowerCase()
  if (!host) return false
  return APPROVED_MEDIA_HOSTS.has(host) || APPROVED_MEDIA_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  )
}

function isLiveOrPlaylistUrl(urlString, contentType) {
  const lower = String(urlString || '').toLowerCase()
  const ct = String(contentType || '').toLowerCase()
  if (lower.includes('.m3u8') || ct.includes('mpegurl') || ct.includes('application/vnd.apple.mpegurl')) {
    return true
  }
  if (lower.includes('/relay?') || lower.includes('icecast') || lower.includes('shoutcast')) {
    return true
  }
  return false
}

function isTestLoopbackHttpAllowed(parsed) {
  return (
    process.env.HT_DOWNLOADS_TEST_ALLOW_HTTP === '1'
    && parsed.protocol === 'http:'
    && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
  )
}

function assertDownloadableHttpsUrl(urlString, contentType) {
  let parsed
  try {
    parsed = new URL(urlString)
  } catch {
    throw new Error('Invalid media URL.')
  }
  const loopbackTest = isTestLoopbackHttpAllowed(parsed)
  if (parsed.protocol !== 'https:' && !loopbackTest) {
    throw new Error('Only HTTPS media URLs are allowed for downloads.')
  }
  if (!loopbackTest && !hostAllowed(parsed.hostname)) {
    throw new Error('Media host is not approved for downloads.')
  }
  if (isLiveOrPlaylistUrl(urlString, contentType)) {
    throw new Error('This live stream or playlist cannot be downloaded.')
  }
  return parsed
}

function userFacingError(code) {
  switch (code) {
    case 'stream_only':
      return 'This live stream cannot be downloaded.'
    case 'unsupported':
      return 'This item is not available for offline use.'
    case 'expired':
      return 'The download link expired. Try again.'
    case 'disk':
      return 'Not enough disk space.'
    case 'missing':
      return 'The downloaded file is missing.'
    case 'corrupt':
      return 'The downloaded file is incomplete or corrupt.'
    case 'cancelled':
      return 'The download was cancelled.'
    case 'no_resume':
      return 'Pause/resume is not available for this transfer. Cancel and Retry instead.'
    case 'too_large':
      return 'This file is too large to download on this device.'
    case 'invalid_response':
      return 'The server returned an invalid media response.'
    case 'size_mismatch':
      return 'The downloaded file size did not match the server response.'
    default:
      return 'The download failed. Try again.'
  }
}

module.exports = {
  classifyDownloadability,
  hostAllowed,
  isLiveOrPlaylistUrl,
  assertDownloadableHttpsUrl,
  userFacingError,
}
