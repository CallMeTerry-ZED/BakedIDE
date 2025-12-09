const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use the APIs we'll need 
// This is a secure way to bridge between the main and renderer processes
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content, filePath) => ipcRenderer.invoke('dialog:saveFile', content, filePath),
  saveFileAs: (content) => ipcRenderer.invoke('dialog:saveFileAs', content),
  
  // File watching
  watchFile: (filePath) => ipcRenderer.invoke('file:watch', filePath),
  unwatchFile: (filePath) => ipcRenderer.invoke('file:unwatch', filePath),
  
  // File reading
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  
  // Theme loading
  loadTheme: () => ipcRenderer.invoke('theme:load'),
  
  // App operations
  quit: () => ipcRenderer.invoke('app:quit')
});