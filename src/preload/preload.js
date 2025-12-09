const { contextBridge } = require('electron');

// Expose protected methods that allow the renderer process to use the APIs
// This is needed for a secure way to bridge between the main and renderer processes
contextBridge.exposeInMainWorld('electronAPI', {
  // Add more APIs here as needed
});