const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectInputFile: (fileType) => ipcRenderer.invoke('select-input-file', fileType),
  selectOutputFile: (defaultName) => ipcRenderer.invoke('select-output-file', defaultName),
  selectOutputDirectory: () => ipcRenderer.invoke('select-output-directory'),
  cutVideo: (params) => ipcRenderer.invoke('cut-video', params),
  cutMultipleSegments: (params) => ipcRenderer.invoke('cut-multiple-segments', params),
  convertMkv: (params) => ipcRenderer.invoke('convert-mkv', params),
  onLog: (callback) => ipcRenderer.on('log', (_, message) => callback(message))
}); 