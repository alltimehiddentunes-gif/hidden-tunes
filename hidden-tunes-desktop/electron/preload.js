const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('hiddenTunesDesktop', {
  catalog: {
    getJson: (path) => ipcRenderer.invoke('ht-catalog-get', path),
    requestJson: (options) => ipcRenderer.invoke('ht-catalog-request', options),
  },
  downloads: {
    list: () => ipcRenderer.invoke('ht-downloads-list'),
    start: (request) => ipcRenderer.invoke('ht-downloads-start', request),
    pause: (downloadId) => ipcRenderer.invoke('ht-downloads-pause', downloadId),
    resume: (downloadId) => ipcRenderer.invoke('ht-downloads-resume', downloadId),
    cancel: (downloadId) => ipcRenderer.invoke('ht-downloads-cancel', downloadId),
    remove: (downloadId) => ipcRenderer.invoke('ht-downloads-remove', downloadId),
    getPlayableUrl: (downloadId) => ipcRenderer.invoke('ht-downloads-get-playable-url', downloadId),
    getDiskUsage: () => ipcRenderer.invoke('ht-downloads-disk-usage'),
    reconcile: () => ipcRenderer.invoke('ht-downloads-reconcile'),
    subscribe: (listener) => {
      if (typeof listener !== 'function') return () => {}
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('ht-downloads-event', handler)
      return () => ipcRenderer.removeListener('ht-downloads-event', handler)
    },
  },
})
