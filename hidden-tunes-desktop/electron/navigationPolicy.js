'use strict'

/**
 * Canonical navigation / external-link classification for the Electron shell.
 * Fail closed. Used by will-navigate, setWindowOpenHandler, and openExternal IPC.
 */

const path = require('path')
const { fileURLToPath } = require('url')

const DEV_RENDERER_ORIGIN = 'http://localhost:5173'
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:'])
const ALLOWED_MAILTO = false

/**
 * @typedef {'allow-internal' | 'open-external' | 'deny'} NavigationAction
 * @typedef {{
 *   action: NavigationAction,
 *   reason: string,
 *   url?: string,
 *   protocol?: string,
 *   hostname?: string | null,
 * }} NavigationDecision
 */

/**
 * @param {string} rawUrl
 * @param {{ isPackaged: boolean, appFileRoots?: string[] }} context
 * @returns {NavigationDecision}
 */
function classifyDesktopNavigationTarget(rawUrl, context) {
  const isPackaged = Boolean(context?.isPackaged)
  const appFileRoots = Array.isArray(context?.appFileRoots) ? context.appFileRoots : []

  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { action: 'deny', reason: 'empty-url' }
  }

  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { action: 'deny', reason: 'invalid-url' }
  }

  const protocol = parsed.protocol
  const hostname = parsed.hostname || null

  if (protocol === 'javascript:' || protocol === 'vbscript:' || protocol === 'data:') {
    return { action: 'deny', reason: `blocked-protocol:${protocol}`, protocol, hostname }
  }

  // Packaged app content loaded via file://
  if (protocol === 'file:') {
    if (!isPackaged) {
      // Dev should not navigate the main window to arbitrary files.
      return { action: 'deny', reason: 'file-forbidden-in-dev', protocol, hostname }
    }

    let filePath
    try {
      filePath = fileURLToPath(parsed.href)
    } catch {
      return { action: 'deny', reason: 'invalid-file-url', protocol, hostname }
    }

    const resolvedFile = path.resolve(filePath)
    const underRoot = appFileRoots.some((root) => {
      if (!root) return false
      const rootResolved = path.resolve(root)
      const rel = path.relative(rootResolved, resolvedFile)
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
    })

    if (underRoot) {
      return {
        action: 'allow-internal',
        reason: 'packaged-file',
        url: parsed.href,
        protocol,
        hostname,
      }
    }
    return { action: 'deny', reason: 'file-outside-app', protocol, hostname }
  }

  // Development Vite renderer — exact origin only.
  if (protocol === 'http:' || protocol === 'https:') {
    if (!isPackaged) {
      try {
        const dev = new URL(DEV_RENDERER_ORIGIN)
        const parsedPort = String(
          parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
        )
        const devPort = String(dev.port || (dev.protocol === 'https:' ? '443' : '80'))
        if (
          parsed.protocol === dev.protocol
          && parsed.hostname === dev.hostname
          && parsedPort === devPort
        ) {
          return {
            action: 'allow-internal',
            reason: 'dev-vite-origin',
            url: parsed.href,
            protocol,
            hostname,
          }
        }
      } catch {
        // fall through
      }
    }

    // External browser — HTTPS only.
    if (protocol === 'https:') {
      return {
        action: 'open-external',
        reason: 'https-external',
        url: parsed.href,
        protocol,
        hostname,
      }
    }

    return { action: 'deny', reason: 'http-external-blocked', protocol, hostname }
  }

  if (protocol === 'mailto:' && ALLOWED_MAILTO) {
    return {
      action: 'open-external',
      reason: 'mailto',
      url: parsed.href,
      protocol,
      hostname,
    }
  }

  // Custom privileged download media scheme is not a main-window navigation target.
  if (protocol === 'ht-download:') {
    return { action: 'deny', reason: 'download-scheme-not-navigable', protocol, hostname }
  }

  return { action: 'deny', reason: `unknown-protocol:${protocol}`, protocol, hostname }
}

/**
 * Whether a URL is the app HTML document we should stamp with CSP headers.
 * Limit to documents only — never rewrite remote media/API responses.
 * @param {string} rawUrl
 * @param {{ isPackaged: boolean }} context
 */
function isAppDocumentUrl(rawUrl, context) {
  try {
    const parsed = new URL(rawUrl)
    if (!context?.isPackaged) {
      if (parsed.origin !== DEV_RENDERER_ORIGIN) return false
      const pathname = parsed.pathname || '/'
      return pathname === '/' || pathname === '/index.html' || /\.html$/i.test(pathname)
    }
    if (parsed.protocol !== 'file:') return false
    return /\.html$/i.test(parsed.pathname || '')
  } catch {
    return false
  }
}

/**
 * Production CSP — no unsafe-eval, no wildcard default-src/script-src.
 * img-src/media-src use https: because catalogue CDNs and stream hosts vary.
 */
function buildProductionCsp() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // connect-src https: is required: HLS.js XHR-fetches manifests/segments from
    // backend-resolved CDN hosts that cannot be enumerated at build time.
    // This does not grant script-src or navigation privileges to those origins.
    "connect-src 'self' https: wss://*.supabase.co",
    "media-src 'self' blob: https: http: ht-download:",
    "worker-src 'self' blob:",
    "form-action 'self'",
  ].join('; ')
}

/**
 * Development CSP — allows Vite HMR (unsafe-eval + exact ws/http localhost:5173).
 */
function buildDevelopmentCsp() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http://localhost:5173",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      'https:',
      'http://localhost:5173',
      'ws://localhost:5173',
      'wss://*.supabase.co',
    ].join(' '),
    "media-src 'self' blob: https: http: ht-download:",
    "worker-src 'self' blob:",
    "form-action 'self'",
  ].join('; ')
}

function buildContentSecurityPolicy(isPackaged) {
  return isPackaged ? buildProductionCsp() : buildDevelopmentCsp()
}

module.exports = {
  DEV_RENDERER_ORIGIN,
  ALLOWED_EXTERNAL_PROTOCOLS,
  classifyDesktopNavigationTarget,
  isAppDocumentUrl,
  buildProductionCsp,
  buildDevelopmentCsp,
  buildContentSecurityPolicy,
}
