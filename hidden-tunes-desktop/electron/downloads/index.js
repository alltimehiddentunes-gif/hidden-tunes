'use strict'

const { DownloadManager } = require('./downloadManager')
const { classifyDownloadability, userFacingError } = require('./downloadability')
const { registerDownloadProtocol, attachDownloadProtocolHandler, PROTOCOL_SCHEME } = require('./protocol')

module.exports = {
  DownloadManager,
  classifyDownloadability,
  userFacingError,
  registerDownloadProtocol,
  attachDownloadProtocolHandler,
  PROTOCOL_SCHEME,
}
