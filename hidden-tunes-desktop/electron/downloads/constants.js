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

/**
 * Exact production media hosts observed from catalog play resolvers.
 *
 * Keep multi-tenant storage/CDN hosts exact. Adding a provider-wide suffix here
 * would let an unrelated tenant become a trusted download source.
 */
const APPROVED_MEDIA_HOSTS = new Set([
  // HiddenTunes music catalog (3,762/3,762 production songs, 2026-08-25).
  'pub-cdc7ab995ca34ff1b3f95453a8024aa3.r2.dev',

  // Podcast resolver hosts observed in the production catalog.
  'anchor.fm',
  'clrtpod.com',
  'content.rss.com',
  'dts.podtrac.com',
  'kdrt.org',
  'mgln.ai',
  'pdrl.fm',
  'pdst.fm',
  'podtrac.com',
  'pscrb.fm',
  's.gum.fm',
  'tracking.swap.fm',
  'www.buzzsprout.com',
  'www.podtrac.com',

  // Final podcast media hosts observed after redirects.
  'audio.buzzsprout.com',
  'content.blubrry.com',
  'd11untcg2uthr3.cloudfront.net',
  'd3ctxlq1ktw2nl.cloudfront.net',
  'dcs-cached.megaphone.fm',
  'dcs-spotify.megaphone.fm',
  'iheartmedia.mc.tritondigital.com',
  'injector.simplecastaudio.com',
  'nyt.simplecastaudio.com',
  'rss.art19.com',
  'salem.mc.tritondigital.com',
  'serve.castfire.com',
])

/**
 * Provider-owned suffixes required for variable production media subdomains.
 * Archive.org currently serves Audiobooks, Motivationals, and Lectures from
 * root, www, and dynamic regional hosts.
 */
const APPROVED_MEDIA_HOST_SUFFIXES = [
  'archive.org',
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
  APPROVED_MEDIA_HOSTS,
  APPROVED_MEDIA_HOST_SUFFIXES,
  downloadsRoot,
}
