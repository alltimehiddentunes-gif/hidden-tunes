const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('hiddenTunesDesktop', {
  catalog: {
    getJson: (path) => ipcRenderer.invoke('ht-catalog-get', path),
  },
})
