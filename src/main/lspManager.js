// lspManager.js - Language Server Protocol Manager
const { spawn } = require('child_process');
const path = require('path');
const { ipcMain } = require('electron');

// Store active language servers
const languageServers = new Map();
let nextRequestId = 1;
const pendingRequests = new Map();

// Language server configurations
const serverConfigs = {
  // C/C++ - clangd
  'c': { command: 'clangd', args: ['--background-index'] },
  'cpp': { command: 'clangd', args: ['--background-index'] },
  'h': { command: 'clangd', args: ['--background-index'] },
  'hpp': { command: 'clangd', args: ['--background-index'] },
  
  // Python - pylsp or pyright
  'python': { command: 'pylsp', args: [] },
  
  // Rust - rust-analyzer
  'rust': { command: 'rust-analyzer', args: [] },
  
  // Go - gopls
  'go': { command: 'gopls', args: ['serve'] },
  
  // JavaScript/TypeScript - handled by Monaco's built-in support
  // But we can also use typescript-language-server for enhanced features
  'typescript': { command: 'typescript-language-server', args: ['--stdio'] },
  'javascript': { command: 'typescript-language-server', args: ['--stdio'] },
};

// Map file extensions to language IDs
const extensionToLanguage = {
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cxx': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
};

// Check if a language server is available
function isServerAvailable(command) {
  const { execSync } = require('child_process');
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Get language from file path
function getLanguageFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return extensionToLanguage[ext] || null;
}

// Initialize a language server for a workspace
async function initializeServer(language, workspacePath, mainWindow) {
  const key = `${language}:${workspacePath}`;
  
  // Return existing server if available
  if (languageServers.has(key)) {
    return { success: true, serverId: key };
  }
  
  const config = serverConfigs[language];
  if (!config) {
    return { success: false, error: `No language server configured for ${language}` };
  }
  
  // Check if server is installed
  if (!isServerAvailable(config.command)) {
    return { 
      success: false, 
      error: `Language server '${config.command}' not found. Please install it.`,
      installHint: getInstallHint(config.command)
    };
  }
  
  try {
    const serverProcess = spawn(config.command, config.args, {
      cwd: workspacePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    
    const server = {
      process: serverProcess,
      language,
      workspacePath,
      initialized: false,
      capabilities: null,
      rawBuffer: Buffer.alloc(0),
      contentLength: null
    };
    
    // Handle stdout (LSP responses)
    serverProcess.stdout.on('data', (data) => {
      handleServerOutput(key, data, mainWindow);
    });
    
    // Handle stderr (logs)
    serverProcess.stderr.on('data', (data) => {
      console.log(`[LSP ${language}] ${data.toString()}`);
    });
    
    // Handle process exit
    serverProcess.on('close', (code) => {
      console.log(`[LSP ${language}] Server exited with code ${code}`);
      languageServers.delete(key);
    });
    
    serverProcess.on('error', (err) => {
      console.error(`[LSP ${language}] Error:`, err);
      languageServers.delete(key);
    });
    
    languageServers.set(key, server);
    
    // Send initialize request
    const initResult = await sendRequest(key, 'initialize', {
      processId: process.pid,
      rootUri: `file://${workspacePath}`,
      rootPath: workspacePath,
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              deprecatedSupport: true,
              preselectSupport: true
            },
            contextSupport: true
          },
          hover: {
            contentFormat: ['markdown', 'plaintext']
          },
          signatureHelp: {
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: {
                labelOffsetSupport: true
              }
            },
            contextSupport: true
          },
          definition: { linkSupport: true },
          references: {},
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true
          },
          publishDiagnostics: {
            relatedInformation: true,
            tagSupport: { valueSet: [1, 2] }
          }
        },
        workspace: {
          workspaceFolders: true,
          configuration: true
        }
      },
      workspaceFolders: [{
        uri: `file://${workspacePath}`,
        name: path.basename(workspacePath)
      }]
    });
    
    if (initResult.success) {
      server.capabilities = initResult.result.capabilities;
      server.initialized = true;
      
      // Send initialized notification
      sendNotification(key, 'initialized', {});
      
      return { success: true, serverId: key, capabilities: server.capabilities };
    } else {
      return { success: false, error: initResult.error };
    }
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Handle server output (parse LSP messages)
function handleServerOutput(serverId, data, mainWindow) {
  const server = languageServers.get(serverId);
  if (!server) return;
  
  // Use Buffer for proper byte handling
  if (!server.rawBuffer) {
    server.rawBuffer = Buffer.alloc(0);
  }
  server.rawBuffer = Buffer.concat([server.rawBuffer, data]);
  
  while (true) {
    // Parse headers if we don't have content length yet
    if (server.contentLength === null) {
      const headerEnd = server.rawBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      
      const headers = server.rawBuffer.slice(0, headerEnd).toString('utf8');
      const match = headers.match(/Content-Length: (\d+)/i);
      if (match) {
        server.contentLength = parseInt(match[1], 10);
        server.rawBuffer = server.rawBuffer.slice(headerEnd + 4);
      } else {
        // Invalid header, skip this byte and try again
        server.rawBuffer = server.rawBuffer.slice(1);
        continue;
      }
    }
    
    // Wait for complete message (compare byte length)
    if (server.rawBuffer.length < server.contentLength) break;
    
    // Extract message
    const messageBuffer = server.rawBuffer.slice(0, server.contentLength);
    server.rawBuffer = server.rawBuffer.slice(server.contentLength);
    server.contentLength = null;
    
    try {
      const messageStr = messageBuffer.toString('utf8');
      const message = JSON.parse(messageStr);
      handleServerMessage(serverId, message, mainWindow);
    } catch (e) {
      console.error('[LSP] Failed to parse message:', e.message);
    }
  }
}

// Handle parsed LSP message
function handleServerMessage(serverId, message, mainWindow) {
  // Response to our request
  if (message.id !== undefined && !message.method) {
    const pending = pendingRequests.get(message.id);
    if (pending) {
      pendingRequests.delete(message.id);
      if (message.error) {
        pending.reject(message.error);
      } else {
        pending.resolve(message.result);
      }
    }
    return;
  }
  
  // Server notification or request
  if (message.method) {
    // Forward diagnostics to renderer
    if (message.method === 'textDocument/publishDiagnostics' && mainWindow) {
      mainWindow.webContents.send('lsp:diagnostics', {
        serverId,
        uri: message.params.uri,
        diagnostics: message.params.diagnostics
      });
    }
    
    // Handle other notifications/requests as needed
    if (message.method === 'window/logMessage') {
      console.log(`[LSP Log] ${message.params.message}`);
    }
  }
}

// Send LSP request
function sendRequest(serverId, method, params) {
  return new Promise((resolve, reject) => {
    const server = languageServers.get(serverId);
    if (!server) {
      reject(new Error('Server not found'));
      return;
    }
    
    const id = nextRequestId++;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    
    pendingRequests.set(id, { resolve: (result) => resolve({ success: true, result }), reject: (error) => resolve({ success: false, error }) });
    
    // Set timeout
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        resolve({ success: false, error: 'Request timed out' });
      }
    }, 30000);
    
    sendMessage(server, message);
  });
}

// Send LSP notification (no response expected)
function sendNotification(serverId, method, params) {
  const server = languageServers.get(serverId);
  if (!server) return;
  
  const message = {
    jsonrpc: '2.0',
    method,
    params
  };
  
  sendMessage(server, message);
}

// Send raw message to server
function sendMessage(server, message) {
  const content = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
  server.process.stdin.write(header + content);
}

// Document sync functions
function didOpenDocument(serverId, uri, languageId, version, text) {
  sendNotification(serverId, 'textDocument/didOpen', {
    textDocument: {
      uri,
      languageId,
      version,
      text
    }
  });
}

function didChangeDocument(serverId, uri, version, changes) {
  sendNotification(serverId, 'textDocument/didChange', {
    textDocument: { uri, version },
    contentChanges: changes
  });
}

function didCloseDocument(serverId, uri) {
  sendNotification(serverId, 'textDocument/didClose', {
    textDocument: { uri }
  });
}

function didSaveDocument(serverId, uri, text) {
  sendNotification(serverId, 'textDocument/didSave', {
    textDocument: { uri },
    text
  });
}

// Get completion
async function getCompletion(serverId, uri, position) {
  return sendRequest(serverId, 'textDocument/completion', {
    textDocument: { uri },
    position
  });
}

// Get hover info
async function getHover(serverId, uri, position) {
  return sendRequest(serverId, 'textDocument/hover', {
    textDocument: { uri },
    position
  });
}

// Get definition
async function getDefinition(serverId, uri, position) {
  return sendRequest(serverId, 'textDocument/definition', {
    textDocument: { uri },
    position
  });
}

// Get references
async function getReferences(serverId, uri, position, includeDeclaration = true) {
  return sendRequest(serverId, 'textDocument/references', {
    textDocument: { uri },
    position,
    context: { includeDeclaration }
  });
}

// Get signature help
async function getSignatureHelp(serverId, uri, position) {
  return sendRequest(serverId, 'textDocument/signatureHelp', {
    textDocument: { uri },
    position
  });
}

// Get document symbols
async function getDocumentSymbols(serverId, uri) {
  return sendRequest(serverId, 'textDocument/documentSymbol', {
    textDocument: { uri }
  });
}

// Shutdown server
function shutdownServer(serverId) {
  const server = languageServers.get(serverId);
  if (!server) return;
  
  sendRequest(serverId, 'shutdown', null).then(() => {
    sendNotification(serverId, 'exit', null);
    server.process.kill();
    languageServers.delete(serverId);
  });
}

// Shutdown all servers
function shutdownAll() {
  for (const serverId of languageServers.keys()) {
    shutdownServer(serverId);
  }
}

// Get install hint for server
function getInstallHint(command) {
  const hints = {
    'clangd': 'Install with: sudo pacman -S clang (Arch) or sudo apt install clangd (Debian/Ubuntu)',
    'pylsp': 'Install with: pip install python-lsp-server',
    'rust-analyzer': 'Install with: rustup component add rust-analyzer',
    'gopls': 'Install with: go install golang.org/x/tools/gopls@latest',
    'typescript-language-server': 'Install with: npm install -g typescript-language-server typescript'
  };
  return hints[command] || `Install ${command} and ensure it's in your PATH`;
}

// Get available servers info
function getAvailableServers() {
  const available = {};
  for (const [lang, config] of Object.entries(serverConfigs)) {
    available[lang] = {
      command: config.command,
      installed: isServerAvailable(config.command),
      installHint: getInstallHint(config.command)
    };
  }
  return available;
}

// Setup IPC handlers
function setupLSPHandlers(mainWindow) {
  ipcMain.handle('lsp:initialize', async (event, { language, workspacePath }) => {
    return initializeServer(language, workspacePath, mainWindow);
  });
  
  ipcMain.handle('lsp:getLanguage', (event, filePath) => {
    return getLanguageFromPath(filePath);
  });
  
  ipcMain.handle('lsp:didOpen', async (event, { serverId, uri, languageId, version, text }) => {
    didOpenDocument(serverId, uri, languageId, version, text);
    return { success: true };
  });
  
  ipcMain.handle('lsp:didChange', async (event, { serverId, uri, version, changes }) => {
    didChangeDocument(serverId, uri, version, changes);
    return { success: true };
  });
  
  ipcMain.handle('lsp:didClose', async (event, { serverId, uri }) => {
    didCloseDocument(serverId, uri);
    return { success: true };
  });
  
  ipcMain.handle('lsp:didSave', async (event, { serverId, uri, text }) => {
    didSaveDocument(serverId, uri, text);
    return { success: true };
  });
  
  ipcMain.handle('lsp:completion', async (event, { serverId, uri, position }) => {
    return getCompletion(serverId, uri, position);
  });
  
  ipcMain.handle('lsp:hover', async (event, { serverId, uri, position }) => {
    return getHover(serverId, uri, position);
  });
  
  ipcMain.handle('lsp:definition', async (event, { serverId, uri, position }) => {
    return getDefinition(serverId, uri, position);
  });
  
  ipcMain.handle('lsp:references', async (event, { serverId, uri, position }) => {
    return getReferences(serverId, uri, position);
  });
  
  ipcMain.handle('lsp:signatureHelp', async (event, { serverId, uri, position }) => {
    return getSignatureHelp(serverId, uri, position);
  });
  
  ipcMain.handle('lsp:documentSymbols', async (event, { serverId, uri }) => {
    return getDocumentSymbols(serverId, uri);
  });
  
  ipcMain.handle('lsp:shutdown', async (event, serverId) => {
    shutdownServer(serverId);
    return { success: true };
  });
  
  ipcMain.handle('lsp:availableServers', () => {
    return getAvailableServers();
  });
}

module.exports = {
  setupLSPHandlers,
  shutdownAll,
  getLanguageFromPath
};

