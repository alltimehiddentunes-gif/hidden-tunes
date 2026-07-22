'use strict'

const path = require('path')

const SCHEMA_VERSION = 1
const MAX_CONCURRENT_DOWNLOADS = 2
/** Hard cap per item (bytes). */
const MAX_DOWNLOAD_BYTES = 400 * 1024 * 1024
/** Refuse start when free space would drop below this reserve. */
const MIN_FREE_BYTES_RESERVE = 1024 * 1024 * 1024
/** Progress IPC throttle. */
const PROGRESS_THROTTLE_MS = 400
const PARTIAL_SUFFIX = '.part'
const PROTOCOL_SCHEME = 'ht-download'
const METADATA_FILENAME = 'downloads-v1.json'

const DOWNLOADABLE_TYPES = new Set([
  'song',
  'podcast_episode',
  'audiobook_chapter',
  'motivational',
  'lecture',
])

const STREAM_ONLY_TYPES = new Set([
  'radio',
  'tv',
  'podcast_show',
  'sports',
])

const FAMILY_DIRS = {
  song: 'music',
  podcast_episode: 'podcasts',
  audiobook_chapter: 'audiobooks',
  motivational: 'motivationals',
  lecture: 'lectures',
}

const STATUSES = [
  'queued',
  'resolving',
  'downloading',
  'paused',
  'completed',
  'failed',
  'removing',
  'missing',
  'invalid',
]

const WINDOWS_RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
])

const APPROVED_MEDIA_HOST_SUFFIXES = [
  'admin.hiddentunes.com',
  'hidden-tunes-api.onrender.com',
  'hiddentunes.com',
  'r2.dev',
  'cloudflarestorage.com',
  'amazonaws.com',
]

function downloadsRoot(userDataPath) {
  return path.join(userDataPath, 'downloads')
}

module.exports = {
  SCHEMA_VERSION,
  MAX_CONCURRENT_DOWNLOADS,
  MAX_DOWNLOAD_BYTES,
  MIN_FREE_BYTES_RESERVE,
  PROGRESS_THROTTLE_MS,
  PARTIAL_SUFFIX,
  PROTOCOL_SCHEME,
  METADATA_FILENAME,
  DOWNLOADABLE_TYPES,
  STREAM_ONLY_TYPES,
  FAMILY_DIRS,
  STATUSES,
  WINDOWS_RESERVED,
  APPROVED_MEDIA_HOST_SUFFIXES,
  downloadsRoot,
}
