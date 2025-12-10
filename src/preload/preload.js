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
  renameItem: (itemPath, newName) => ipcRenderer.invoke('item:rename', itemPath, newName),
  
  // Dialogs
  promptInput: (title, defaultValue) => ipcRenderer.invoke('dialog:prompt', title, defaultValue),
  confirmDialog: (title, message) => ipcRenderer.invoke('dialog:confirm', title, message),
  
  // Theme loading
  loadTheme: () => ipcRenderer.invoke('theme:load'),
  
  // App operations
  quit: () => ipcRenderer.invoke('app:quit'),
  
  // Build system operations
  detectBuildSystem: (projectPath) => ipcRenderer.invoke('build:detect', projectPath),
  getBuildConfig: (projectPath) => ipcRenderer.invoke('build:getConfig', projectPath),
  saveBuildConfig: (projectPath, config) => ipcRenderer.invoke('build:saveConfig', projectPath, config),
  checkBuildTool: (tool) => ipcRenderer.invoke('build:checkTool', tool),
  checkCmakeGenerators: () => ipcRenderer.invoke('build:checkCmakeGenerators'),
  executeBuild: (projectPath, config, action) => ipcRenderer.invoke('build:execute', projectPath, config, action),
  cancelBuild: () => ipcRenderer.invoke('build:cancel'),
  detectExecutable: (projectPath, config) => ipcRenderer.invoke('build:detectExecutable', projectPath, config),
  runExecutable: (projectPath, executablePath) => ipcRenderer.invoke('build:runExecutable', projectPath, executablePath),
  
  // Listen for build output
  onBuildOutput: (callback) => {
    ipcRenderer.on('build:output', (event, data) => {
      callback(event, data);
    });
  },
  removeBuildOutputListener: () => {
    ipcRenderer.removeAllListeners('build:output');
  },
  
  // Session management
  saveLastProject: (projectPath) => ipcRenderer.invoke('session:saveLastProject', projectPath),
  loadLastProject: () => ipcRenderer.invoke('session:loadLastProject'),
  
  // Terminal
  terminalCreate: (cwd) => ipcRenderer.invoke('terminal:create', cwd),
  terminalWrite: (data) => ipcRenderer.invoke('terminal:write', data),
  terminalResize: (cols, rows) => ipcRenderer.invoke('terminal:resize', cols, rows),
  terminalKill: () => ipcRenderer.invoke('terminal:kill'),
  onTerminalData: (callback) => {
    ipcRenderer.on('terminal:data', (event, data) => callback(data));
  },
  onTerminalExit: (callback) => {
    ipcRenderer.on('terminal:exit', (event, data) => callback(data));
  },
  removeTerminalListeners: () => {
    ipcRenderer.removeAllListeners('terminal:data');
    ipcRenderer.removeAllListeners('terminal:exit');
  },
  
  // Git operations
  gitIsRepo: (projectPath) => ipcRenderer.invoke('git:isRepo', projectPath),
  gitStatus: (projectPath) => ipcRenderer.invoke('git:status', projectPath),
  gitBranch: (projectPath) => ipcRenderer.invoke('git:branch', projectPath),
  gitBranches: (projectPath) => ipcRenderer.invoke('git:branches', projectPath),
  gitAdd: (projectPath, files) => ipcRenderer.invoke('git:add', projectPath, files),
  gitUnstage: (projectPath, files) => ipcRenderer.invoke('git:unstage', projectPath, files),
  gitAddAll: (projectPath) => ipcRenderer.invoke('git:addAll', projectPath),
  gitCommit: (projectPath, message) => ipcRenderer.invoke('git:commit', projectPath, message),
  gitPush: (projectPath) => ipcRenderer.invoke('git:push', projectPath),
  gitPull: (projectPath) => ipcRenderer.invoke('git:pull', projectPath),
  gitCheckout: (projectPath, branch) => ipcRenderer.invoke('git:checkout', projectPath, branch),
  gitDiff: (projectPath, filePath, staged) => ipcRenderer.invoke('git:diff', projectPath, filePath, staged),
  gitDiscard: (projectPath, filePath) => ipcRenderer.invoke('git:discard', projectPath, filePath),
  gitLog: (projectPath, count) => ipcRenderer.invoke('git:log', projectPath, count)
});