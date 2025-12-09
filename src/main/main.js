const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    titleBarStyle: 'default',
    autoHideMenuBar: true, // Hide the default menu bar
    show: false // Don't show until ready
  });

  // Remove the default menu completely
  Menu.setApplicationMenu(null);

  // Load the index.html
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for file operations
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Supported Files', extensions: ['js', 'jsx', 'ts', 'tsx', 'cpp', 'cc', 'cxx', 'hpp', 'h', 'hxx', 'c', 'cs', 'py', 'lua', 'luau', 'json', 'html', 'css', 'md', 'txt'] },
      { name: 'JavaScript', extensions: ['js', 'jsx'] },
      { name: 'TypeScript', extensions: ['ts', 'tsx'] },
      { name: 'C++', extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hxx'] },
      { name: 'C', extensions: ['c', 'h'] },
      { name: 'C#', extensions: ['cs'] },
      { name: 'Python', extensions: ['py'] },
      { name: 'Lua', extensions: ['lua', 'luau'] },
      { name: 'Text Files', extensions: ['txt', 'md'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { success: true, filePath, content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  return { success: false, canceled: true };
});

ipcMain.handle('dialog:saveFile', async (event, content, filePath) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dialog:saveFileAs', async (event, content) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt', 'md'] },
      { name: 'JavaScript', extensions: ['js'] },
      { name: 'TypeScript', extensions: ['ts'] },
      { name: 'C++', extensions: ['cpp', 'hpp'] },
      { name: 'C', extensions: ['c', 'h'] },
      { name: 'C#', extensions: ['cs'] },
      { name: 'Python', extensions: ['py'] },
      { name: 'Lua', extensions: ['lua'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    try {
      await fs.writeFile(result.filePath, content, 'utf-8');
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  return { success: false, canceled: true };
});

ipcMain.handle('file:read', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('theme:load', async () => {
  try {
    const themePath = path.join(__dirname, '../../assets/themes/baked-theme.json');
    const content = await fs.readFile(themePath, 'utf-8');
    return { success: true, data: JSON.parse(content) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC handler for quit
ipcMain.handle('app:quit', () => {
  app.quit();
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});