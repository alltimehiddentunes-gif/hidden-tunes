'use strict'

const { protocol, net } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { PROTOCOL_SCHEME, downloadsRoot } = require('./constants')
const { assertInsideRoot, rejectUnsafeUserPath } = require('./pathSafety')

function registerDownloadProtocol(getUserDataPath) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PROTOCOL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
      },
    },
  ])

  // registerSchemesAsPrivileged must run before app ready — caller may invoke early.
  // Actual handler registered after ready via attachDownloadProtocolHandler.
}

function attachDownloadProtocolHandler(getUserDataPath) {
  protocol.handle(PROTOCOL_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      // ht-download://media/<relative/path>
      const parts = url.pathname.replace(/^\/+/, '').split('/')
      if (url.hostname !== 'media' && parts[0] === 'media') {
        parts.shift()
      }
      const relative = parts.map((part) => decodeURIComponent(part)).join('/')
      rejectUnsafeUserPath(relative)
      const root = downloadsRoot(getUserDataPath())
      const absolute = assertInsideRoot(root, path.join(root, relative))
      return net.fetch(pathToFileURL(absolute).href)
    } catch {
      return new Response('Not found', { status: 404, statusText: 'Not Found' })
    }
  })
}

module.exports = {
  registerDownloadProtocol,
  attachDownloadProtocolHandler,
  PROTOCOL_SCHEME,
}
