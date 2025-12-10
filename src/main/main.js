const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const { spawn } = require('child_process');
const os = require('os');
const pty = require('node-pty');
const { setupLSPHandlers, shutdownAll: shutdownLSP } = require('./lspManager');

let mainWindow;
let currentBuildProcess = null;
let ptyProcess = null;

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

ipcMain.handle('item:rename', async (event, itemPath, newName) => {
  try {
    const parentDir = path.dirname(itemPath);
    const newPath = path.join(parentDir, newName);
    
    // Check if new name already exists
    try {
      await fs.access(newPath);
      return { success: false, error: 'An item with that name already exists' };
    } catch {
      // File doesn't exist, proceed
    }
    
    // Rename the item
    await fs.rename(itemPath, newPath);
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

// Detect executable in build directory
ipcMain.handle('build:detectExecutable', async (event, projectPath, config) => {
  try {
    const buildDir = path.join(projectPath, config.buildDirectory || 'build');
    
    // Common locations to search for executables
    const searchPaths = [
      buildDir,
      path.join(buildDir, 'bin'),
      path.join(buildDir, 'Debug'),
      path.join(buildDir, 'Release'),
      path.join(buildDir, 'bin', 'Debug'),
      path.join(buildDir, 'bin', 'Release')
    ];
    
    for (const searchPath of searchPaths) {
      try {
        const entries = await fs.readdir(searchPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const fullPath = path.join(searchPath, entry.name);
            // Check if it's an executable (no extension on Unix, .exe on Windows)
            const isExecutable = !entry.name.includes('.') || 
                                 entry.name.endsWith('.exe') ||
                                 entry.name.endsWith('.out');
            
            if (isExecutable) {
              // Verify it's actually executable
              try {
                await fs.access(fullPath, fs.constants ? fs.constants.X_OK : 1);
                // Return path relative to project
                const relativePath = path.relative(projectPath, fullPath);
                return { success: true, executable: relativePath };
              } catch {
                // Not executable, continue searching
              }
            }
          }
        }
      } catch {
        // Directory doesn't exist, continue
      }
    }
    
    return { success: false, error: 'No executable found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Run executable
let currentRunProcess = null;

ipcMain.handle('build:runExecutable', async (event, projectPath, executablePath) => {
  // Cancel any existing run
  if (currentRunProcess) {
    try {
      currentRunProcess.kill();
    } catch (error) {
      // Ignore
    }
    currentRunProcess = null;
  }
  
  return new Promise((resolve) => {
    const fullPath = path.isAbsolute(executablePath) 
      ? executablePath 
      : path.join(projectPath, executablePath);
    
    // Check if file exists
    fs.access(fullPath).then(() => {
      currentRunProcess = spawn(fullPath, [], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      currentRunProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        mainWindow.webContents.send('build:output', { type: 'stdout', data: data.toString() });
      });
      
      currentRunProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        mainWindow.webContents.send('build:output', { type: 'stderr', data: data.toString() });
      });
      
      currentRunProcess.on('close', (code) => {
        currentRunProcess = null;
        resolve({
          success: true,
          exitCode: code,
          stdout: stdout,
          stderr: stderr
        });
      });
      
      currentRunProcess.on('error', (error) => {
        currentRunProcess = null;
        resolve({
          success: false,
          error: error.message,
          stdout: stdout,
          stderr: stderr
        });
      });
    }).catch((error) => {
      resolve({
        success: false,
        error: `Executable not found: ${fullPath}`
      });
    });
  });
});

// Terminal IPC handlers - using node-pty for real PTY
ipcMain.handle('terminal:create', async (event, cwd) => {
  // Kill existing PTY if any
  if (ptyProcess) {
    try {
      ptyProcess.kill();
    } catch (e) {
      // Ignore
    }
  }
  
  try {
    const shell = process.platform === 'win32' 
      ? 'powershell.exe' 
      : (process.env.SHELL || '/bin/bash');
    
    const ptyOptions = {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || process.env.HOME || os.homedir(),
      env: process.env
    };
    
    ptyProcess = pty.spawn(shell, [], ptyOptions);
    
    // Send PTY output to renderer
    ptyProcess.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', data);
      }
    });
    
    ptyProcess.onExit(({ exitCode, signal }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', { exitCode, signal });
      }
      ptyProcess = null;
    });
    
    return { success: true };
  } catch (error) {
    console.error('Failed to create PTY:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('terminal:write', async (event, data) => {
  if (ptyProcess) {
    try {
      ptyProcess.write(data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'No PTY process' };
});

ipcMain.handle('terminal:resize', async (event, cols, rows) => {
  if (ptyProcess) {
    try {
      ptyProcess.resize(cols, rows);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'No PTY process' };
});

ipcMain.handle('terminal:kill', async () => {
  if (ptyProcess) {
    try {
      ptyProcess.kill();
      ptyProcess = null;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: true };
});

// Git IPC handlers
function runGitCommand(cwd, args) {
  return new Promise((resolve) => {
    const git = spawn('git', args, { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    
    git.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    git.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    git.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout: stdout.trimEnd(),  // Only trim trailing whitespace, preserve leading spaces
        stderr: stderr.trim(),
        exitCode: code
      });
    });
    
    git.on('error', (error) => {
      resolve({
        success: false,
        stdout: '',
        stderr: error.message,
        exitCode: -1
      });
    });
  });
}

// Check if directory is a git repo
ipcMain.handle('git:isRepo', async (event, projectPath) => {
  const result = await runGitCommand(projectPath, ['rev-parse', '--is-inside-work-tree']);
  return { success: result.success && result.stdout === 'true', isRepo: result.stdout === 'true' };
});

// Get git status
ipcMain.handle('git:status', async (event, projectPath) => {
  const result = await runGitCommand(projectPath, ['status', '--porcelain', '-u']);
  if (!result.success) {
    return { success: false, error: result.stderr };
  }
  
  const files = [];
  const lines = result.stdout.split('\n').filter(line => line.length >= 4);
  
  for (const line of lines) {
    // Git status format: XY PATH
    // X = index status (staged)
    // Y = work tree status
    // Position 0-1 = status, position 2 = space, position 3+ = path
    const indexStatus = line.charAt(0);
    const workTreeStatus = line.charAt(1);
    const filePath = line.substring(3);
    
    // Determine file state
    let state = 'untracked';
    if (indexStatus === 'M' || workTreeStatus === 'M') state = 'modified';
    else if (indexStatus === 'A') state = 'added';
    else if (indexStatus === 'D' || workTreeStatus === 'D') state = 'deleted';
    else if (indexStatus === 'R') state = 'renamed';
    else if (indexStatus === '?' && workTreeStatus === '?') state = 'untracked';
    
    // File is staged if index status is not space or ?
    const staged = indexStatus !== ' ' && indexStatus !== '?';
    
    files.push({ path: filePath, status: state, staged, statusCode: indexStatus + workTreeStatus });
  }
  
  return { success: true, files };
});

// Get current branch
ipcMain.handle('git:branch', async (event, projectPath) => {
  const result = await runGitCommand(projectPath, ['branch', '--show-current']);
  if (!result.success) {
    return { success: false, error: result.stderr };
  }
  return { success: true, branch: result.stdout || 'HEAD detached' };
});

// Get all branches
ipcMain.handle('git:branches', async (event, projectPath) => {
  const result = await runGitCommand(projectPath, ['branch', '-a']);
  if (!result.success) {
    return { success: false, error: result.stderr };
  }
  
  const branches = result.stdout.split('\n')
    .map(b => b.trim())
    .filter(b => b)
    .map(b => ({
      name: b.replace(/^\*\s*/, '').replace(/^remotes\//, ''),
      current: b.startsWith('*'),
      remote: b.includes('remotes/')
    }));
  
  return { success: true, branches };
});

// Stage file(s)
ipcMain.handle('git:add', async (event, projectPath, files) => {
  const fileArgs = Array.isArray(files) ? files : [files];
  const result = await runGitCommand(projectPath, ['add', '--', ...fileArgs]);
  return { success: result.success, error: result.stderr };
});

// Unstage file(s)
ipcMain.handle('git:unstage', async (event, projectPath, files) => {
  const fileArgs = Array.isArray(files) ? files : [files];
  const result = await runGitCommand(projectPath, ['reset', 'HEAD', ...fileArgs]);
  return { success: result.success, error: result.stderr };
});

// Stage all changes
ipcMain.handle('git:addAll', async (event, projectPath) => {
  const result = await runGitCommand(projectPath, ['add', '-A']);
  return { success: result.success, error: result.stderr };
});

// Commit
ipcMain.handle('git:commit', async (event, projectPath, message) => {
  if (!message || !message.trim()) {
    return { success: false, error: 'Commit message is required' };
  }
  const result = await runGitCommand(projectPath, ['commit', '-m', message]);
  return { success: result.success, error: result.stderr, output: result.stdout };
});

// Push
ipcMain.handle('git:push', async (event, projectPath) => {
  const result = await runGitCommand(projectPath, ['push']);
  return { success: result.success, error: result.stderr, output: result.stdout };
});

// Pull
ipcMain.handle('git:pull', async (event, projectPath) => {
  const result = await runGitCommand(projectPath, ['pull']);
  return { success: result.success, error: result.stderr, output: result.stdout };
});

// Checkout branch
ipcMain.handle('git:checkout', async (event, projectPath, branch) => {
  const result = await runGitCommand(projectPath, ['checkout', branch]);
  return { success: result.success, error: result.stderr };
});

// Get diff for a file
ipcMain.handle('git:diff', async (event, projectPath, filePath, staged) => {
  const args = staged ? ['diff', '--cached', filePath] : ['diff', filePath];
  const result = await runGitCommand(projectPath, args);
  return { success: result.success, diff: result.stdout, error: result.stderr };
});

// Discard changes to a file
ipcMain.handle('git:discard', async (event, projectPath, filePath) => {
  const result = await runGitCommand(projectPath, ['checkout', '--', filePath]);
  return { success: result.success, error: result.stderr };
});

// Get recent commits
ipcMain.handle('git:log', async (event, projectPath, count = 20) => {
  const result = await runGitCommand(projectPath, [
    'log', 
    `--max-count=${count}`,
    '--pretty=format:%H|%h|%an|%ae|%ar|%s'
  ]);
  
  if (!result.success) {
    return { success: false, error: result.stderr };
  }
  
  const commits = result.stdout.split('\n')
    .filter(line => line.trim())
    .map(line => {
      const [hash, shortHash, author, email, date, ...msgParts] = line.split('|');
      return { hash, shortHash, author, email, date, message: msgParts.join('|') };
    });
  
  return { success: true, commits };
});

// Settings management
const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');

const defaultSettings = {
  editor: {
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'off',
    lineNumbers: 'on',
    minimap: false,
    cursorBlinking: 'blink',
    cursorStyle: 'line',
    renderWhitespace: 'none',
    bracketPairColorization: true
  },
  appearance: {
    theme: 'baked-dark',
    uiScale: 100
  },
  files: {
    autoSave: 'off',  // 'off', 'afterDelay', 'onFocusChange'
    autoSaveDelay: 1000,
    trimTrailingWhitespace: false,
    insertFinalNewline: true
  },
  terminal: {
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace"
  }
};

async function loadSettings() {
  try {
    const content = await fs.readFile(settingsFilePath, 'utf-8');
    const userSettings = JSON.parse(content);
    // Deep merge with defaults
    return deepMerge(defaultSettings, userSettings);
  } catch (error) {
    // Return defaults if file doesn't exist
    return { ...defaultSettings };
  }
}

async function saveSettings(settings) {
  try {
    await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

ipcMain.handle('settings:load', async () => {
  const settings = await loadSettings();
  return { success: true, settings };
});

ipcMain.handle('settings:save', async (event, settings) => {
  return await saveSettings(settings);
});

ipcMain.handle('settings:getDefaults', async () => {
  return { success: true, settings: defaultSettings };
});

ipcMain.handle('settings:reset', async () => {
  try {
    await fs.unlink(settingsFilePath);
    return { success: true, settings: defaultSettings };
  } catch (error) {
    return { success: true, settings: defaultSettings };
  }
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
  
  // Setup LSP handlers after window is created
  setupLSPHandlers(mainWindow);

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // Shutdown all LSP servers
  shutdownLSP();
  
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});