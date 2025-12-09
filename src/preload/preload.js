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
  
  // Directory operations
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readDirectory: (dirPath) => ipcRenderer.invoke('dir:read', dirPath),
  createFile: (parentPath, fileName) => ipcRenderer.invoke('file:create', parentPath, fileName),
  createFolder: (parentPath, folderName) => ipcRenderer.invoke('folder:create', parentPath, folderName),
  deleteItem: (itemPath, isDirectory) => ipcRenderer.invoke('item:delete', itemPath, isDirectory),
  moveItem: (sourcePath, targetPath, itemName, isDirectory) => ipcRenderer.invoke('item:move', sourcePath, targetPath, itemName, isDirectory),
  
  // Dialogs
  promptInput: (title, defaultValue) => ipcRenderer.invoke('dialog:prompt', title, defaultValue),
  confirmDialog: (title, message) => ipcRenderer.invoke('dialog:confirm', title, message),
  
  // Theme loading
  loadTheme: () => ipcRenderer.invoke('theme:load'),
  
  // App operations
  quit: () => ipcRenderer.invoke('app:quit')
});