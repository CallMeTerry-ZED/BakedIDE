const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const { spawn } = require('child_process');

let mainWindow;
let currentBuildProcess = null;

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
      { name: 'C++', extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hxx', 'h'] },
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

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, folderPath: result.filePaths[0] };
  }
  
  return { success: false, canceled: true };
});

ipcMain.handle('dir:read', async (event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items = [];
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      items.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile()
      });
    }
    
    return { success: true, items };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('file:create', async (event, parentPath, fileName) => {
  try {
    const filePath = path.join(parentPath, fileName);
    await fs.writeFile(filePath, '', 'utf-8');
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('folder:create', async (event, parentPath, folderName) => {
  try {
    const folderPath = path.join(parentPath, folderName);
    await fs.mkdir(folderPath, { recursive: true });
    return { success: true, folderPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('item:delete', async (event, itemPath, isDirectory) => {
  try {
    if (isDirectory) {
      await fs.rmdir(itemPath, { recursive: true });
    } else {
      await fs.unlink(itemPath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('item:move', async (event, sourcePath, targetPath, itemName, isDirectory) => {
  try {
    const newPath = path.join(targetPath, itemName);
    
    // Check if target already exists
    try {
      await fs.access(newPath);
      return { success: false, error: 'Item with that name already exists' };
    } catch {
      // File doesn't exist, proceed
    }
    
    // Move the item
    await fs.rename(sourcePath, newPath);
    return { success: true, newPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dialog:prompt', async (event, title, defaultValue) => {
  // This is handled by the renderer's custom prompt dialog
  // We'll just return null here as the renderer handles it directly
  return null;
});

ipcMain.handle('dialog:confirm', async (event, title, message) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Yes', 'No'],
    defaultId: 1,
    title: title,
    message: title,
    detail: message
  });
  
  return result.response === 0;
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

// Build system IPC handlers
ipcMain.handle('build:detect', async (event, projectPath) => {
  try {
    const buildFiles = {
      cmake: [],
      premake: [],
      make: []
    };
    
    async function scanDirectory(dirPath, depth = 0) {
      if (depth > 3) return; // Limit recursion depth
      
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            // Skip common build/output directories
            if (['build', 'dist', 'out', 'node_modules', '.git', '.bakedide'].includes(entry.name)) {
              continue;
            }
            await scanDirectory(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const name = entry.name.toLowerCase();
            if (name === 'cmakelists.txt') {
              buildFiles.cmake.push(fullPath);
            } else if (name === 'premake5.lua' || name === 'premake4.lua') {
              buildFiles.premake.push(fullPath);
            } else if (name === 'makefile' || name === 'makefile') {
              buildFiles.make.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Ignore permission errors
      }
    }
    
    await scanDirectory(projectPath);
    
    // Find root files (files in project root)
    const rootFiles = {
      cmake: buildFiles.cmake.filter(f => path.dirname(f) === projectPath),
      premake: buildFiles.premake.filter(f => path.dirname(f) === projectPath),
      make: buildFiles.make.filter(f => path.dirname(f) === projectPath)
    };
    
    return {
      success: true,
      detected: {
        cmake: buildFiles.cmake,
        premake: buildFiles.premake,
        make: buildFiles.make
      },
      rootFiles: rootFiles
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('build:getConfig', async (event, projectPath) => {
  try {
    const configPath = path.join(projectPath, '.bakedide', 'config.json');
    const content = await fs.readFile(configPath, 'utf-8');
    return { success: true, config: JSON.parse(content) };
  } catch (error) {
    // Config doesn't exist, return default
    return {
      success: true,
      config: {
        buildSystem: 'none',
        buildSystemFile: null,
        buildDirectory: 'build',
        configuration: 'Debug',
        cmakeGenerator: 'Unix Makefiles',
        premakeAction: 'gmake2'
      }
    };
  }
});

ipcMain.handle('build:saveConfig', async (event, projectPath, config) => {
  try {
    const bakedideDir = path.join(projectPath, '.bakedide');
    try {
      await fs.mkdir(bakedideDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    
    const configPath = path.join(bakedideDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('build:checkTool', async (event, tool) => {
  return new Promise((resolve) => {
    const command = tool === 'cmake' ? 'cmake' : tool === 'premake' ? 'premake5' : tool === 'ninja' ? 'ninja' : 'make';
    const checkProcess = spawn('which', [command], { shell: true });
    
    checkProcess.on('close', (code) => {
      resolve({ success: code === 0, installed: code === 0 });
    });
    
    checkProcess.on('error', () => {
      resolve({ success: false, installed: false });
    });
  });
});

// Check available CMake generators
ipcMain.handle('build:checkCmakeGenerators', async () => {
  return new Promise((resolve) => {
    const checkProcess = spawn('cmake', ['--help'], { shell: true });
    let output = '';
    
    checkProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    checkProcess.on('close', (code) => {
      if (code === 0) {
        // Parse available generators from cmake --help output
        const generators = [];
        const lines = output.split('\n');
        let inGeneratorsSection = false;
        
        for (const line of lines) {
          if (line.includes('Generators')) {
            inGeneratorsSection = true;
            continue;
          }
          if (inGeneratorsSection && line.trim() === '') {
            break;
          }
          if (inGeneratorsSection && line.trim().startsWith('=')) {
            continue;
          }
          if (inGeneratorsSection && line.trim()) {
            const match = line.match(/^\s*\*\s*(.+?)(?:\s|$)/);
            if (match) {
              generators.push(match[1].trim());
            }
          }
        }
        
        // Check for common generators
        const available = {
          'Unix Makefiles': true, // Usually available on Unix systems
          'Ninja': false,
          'Ninja Multi-Config': false
        };
        
        // Check if ninja is installed
        const ninjaCheck = spawn('which', ['ninja'], { shell: true });
        ninjaCheck.on('close', (ninjaCode) => {
          available['Ninja'] = ninjaCode === 0;
          available['Ninja Multi-Config'] = ninjaCode === 0;
          resolve({ success: true, generators: available, allGenerators: generators });
        });
        ninjaCheck.on('error', () => {
          resolve({ success: true, generators: available, allGenerators: generators });
        });
      } else {
        resolve({ success: false, error: 'CMake not found' });
      }
    });
    
    checkProcess.on('error', () => {
      resolve({ success: false, error: 'Failed to check CMake' });
    });
  });
});

ipcMain.handle('build:execute', async (event, projectPath, config, action) => {
  // Cancel any existing build
  if (currentBuildProcess) {
    try {
      currentBuildProcess.kill();
    } catch (error) {
      // Ignore
    }
    currentBuildProcess = null;
  }
  
  return new Promise((resolve) => {
    let command = '';
    let args = [];
    const buildDir = path.join(projectPath, config.buildDirectory);
    
    if (config.buildSystem === 'cmake') {
      if (action === 'configure') {
        command = 'cmake';
        args = ['-B', buildDir, '-S', projectPath, '-DCMAKE_BUILD_TYPE=' + config.configuration];
        if (config.cmakeGenerator) {
          args.push('-G', config.cmakeGenerator);
        }
      } else if (action === 'build') {
        command = 'cmake';
        // For single-config generators (Unix Makefiles, Ninja), use --build with -j for parallel builds
        // For multi-config generators (Visual Studio), use --config
        if (config.cmakeGenerator && (config.cmakeGenerator.includes('Visual Studio') || config.cmakeGenerator.includes('Xcode'))) {
          args = ['--build', buildDir, '--config', config.configuration];
        } else {
          args = ['--build', buildDir];
        }
      } else if (action === 'clean') {
        command = 'cmake';
        args = ['--build', buildDir, '--target', 'clean'];
      }
    } else if (config.buildSystem === 'premake') {
      if (action === 'configure') {
        command = 'premake5';
        args = [config.premakeAction || 'gmake2'];
      } else if (action === 'build') {
        command = 'make';
        args = ['-C', projectPath];
      } else if (action === 'clean') {
        command = 'make';
        args = ['-C', projectPath, 'clean'];
      }
    } else if (config.buildSystem === 'make') {
      if (action === 'build') {
        command = 'make';
        args = ['-C', projectPath];
      } else if (action === 'clean') {
        command = 'make';
        args = ['-C', projectPath, 'clean'];
      }
    }
    
    if (!command) {
      resolve({ success: false, error: 'Invalid build system or action' });
      return;
    }
    
    currentBuildProcess = spawn(command, args, {
      cwd: projectPath,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    currentBuildProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      mainWindow.webContents.send('build:output', { type: 'stdout', data: data.toString() });
    });
    
    currentBuildProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      mainWindow.webContents.send('build:output', { type: 'stderr', data: data.toString() });
    });
    
    currentBuildProcess.on('close', (code) => {
      currentBuildProcess = null;
      resolve({
        success: code === 0,
        exitCode: code,
        stdout: stdout,
        stderr: stderr
      });
    });
    
    currentBuildProcess.on('error', (error) => {
      currentBuildProcess = null;
      resolve({
        success: false,
        error: error.message,
        stdout: stdout,
        stderr: stderr
      });
    });
  });
});

ipcMain.handle('build:cancel', async () => {
  if (currentBuildProcess) {
    try {
      currentBuildProcess.kill();
      currentBuildProcess = null;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: true };
});

// Session management - save/load last project
const sessionFilePath = path.join(app.getPath('userData'), 'session.json');

async function saveLastProject(projectPath) {
  try {
    const sessionData = {
      lastProjectPath: projectPath,
      timestamp: Date.now()
    };
    await fs.writeFile(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function loadLastProject() {
  try {
    const content = await fs.readFile(sessionFilePath, 'utf-8');
    const sessionData = JSON.parse(content);
    
    // Verify the path still exists
    if (sessionData.lastProjectPath) {
      try {
        const stats = await fs.stat(sessionData.lastProjectPath);
        if (stats.isDirectory()) {
          return { success: true, projectPath: sessionData.lastProjectPath };
        }
      } catch (error) {
        // Path doesn't exist anymore, ignore it
        return { success: false, error: 'Path no longer exists' };
      }
    }
    
    return { success: false, error: 'No saved project' };
  } catch (error) {
    // Session file doesn't exist or is invalid
    return { success: false, error: error.message };
  }
}

ipcMain.handle('session:saveLastProject', async (event, projectPath) => {
  return await saveLastProject(projectPath);
});

ipcMain.handle('session:loadLastProject', async () => {
  return await loadLastProject();
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