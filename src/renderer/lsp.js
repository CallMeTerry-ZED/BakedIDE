// lsp.js - LSP Client for Monaco Editor

// Track active LSP servers per workspace
const activeServers = new Map(); // workspacePath -> { serverId, language }
const documentVersions = new Map(); // uri -> version
const diagnosticsDecorations = new Map(); // uri -> decorationIds

// LSP to Monaco severity mapping (initialized lazily)
let severityMap = null;

function getSeverityMap() {
  if (!severityMap && typeof monaco !== 'undefined') {
    severityMap = {
      1: monaco.MarkerSeverity.Error,
      2: monaco.MarkerSeverity.Warning,
      3: monaco.MarkerSeverity.Info,
      4: monaco.MarkerSeverity.Hint
    };
  }
  return severityMap || { 1: 8, 2: 4, 3: 2, 4: 1 }; // Fallback values
}

// Initialize LSP for a file
async function initLSPForFile(filePath, editor) {
  if (!filePath || typeof monaco === 'undefined') return null;
  
  // Get language from file extension
  const language = await window.electronAPI.lspGetLanguage(filePath);
  if (!language) {
    console.log(`[LSP] No language server for: ${filePath}`);
    return null;
  }
  
  // Skip TypeScript/JavaScript as Monaco handles these well natively
  if (language === 'typescript' || language === 'javascript') {
    console.log(`[LSP] Using Monaco's built-in support for ${language}`);
    return null;
  }
  
  // Get workspace path
  const workspacePath = window.fileTreeAPI?.getCurrentProjectPath?.();
  if (!workspacePath) {
    console.log('[LSP] No workspace path available');
    return null;
  }
  
  // Check if we already have a server for this workspace/language
  const serverKey = `${language}:${workspacePath}`;
  let serverInfo = activeServers.get(serverKey);
  
  if (!serverInfo) {
    // Initialize new server
    console.log(`[LSP] Initializing ${language} server for ${workspacePath}...`);
    const result = await window.electronAPI.lspInitialize(language, workspacePath);
    
    if (!result.success) {
      console.warn(`[LSP] Failed to initialize ${language}:`, result.error);
      if (result.installHint) {
        showLSPNotification(`${language} language server not found.\n${result.installHint}`, 'warning');
      }
      return null;
    }
    
    serverInfo = {
      serverId: result.serverId,
      language,
      capabilities: result.capabilities
    };
    activeServers.set(serverKey, serverInfo);
    console.log(`[LSP] ${language} server initialized with capabilities:`, result.capabilities);
  }
  
  // Notify server about opened document
  const uri = `file://${filePath}`;
  const text = editor.getValue();
  documentVersions.set(uri, 1);
  
  await window.electronAPI.lspDidOpen(
    serverInfo.serverId,
    uri,
    language,
    1,
    text
  );
  
  // Setup editor change listener
  setupEditorChangeListener(editor, serverInfo.serverId, uri);
  
  // Setup completion provider
  setupCompletionProvider(editor, serverInfo, uri);
  
  // Setup hover provider
  setupHoverProvider(editor, serverInfo, uri);
  
  // Setup definition provider (Ctrl+Click)
  setupDefinitionProvider(editor, serverInfo, uri);
  
  // Setup signature help provider
  setupSignatureHelpProvider(editor, serverInfo, uri);
  
  return serverInfo;
}

// Setup editor change listener for document sync
function setupEditorChangeListener(editor, serverId, uri) {
  editor.onDidChangeModelContent((e) => {
    const version = (documentVersions.get(uri) || 0) + 1;
    documentVersions.set(uri, version);
    
    // Convert Monaco changes to LSP format
    const changes = e.changes.map(change => ({
      range: {
        start: { line: change.range.startLineNumber - 1, character: change.range.startColumn - 1 },
        end: { line: change.range.endLineNumber - 1, character: change.range.endColumn - 1 }
      },
      rangeLength: change.rangeLength,
      text: change.text
    }));
    
    window.electronAPI.lspDidChange(serverId, uri, version, changes);
  });
}

// Setup completion provider
function setupCompletionProvider(editor, serverInfo, uri) {
  const model = editor.getModel();
  if (!model) return;
  
  // Store disposable to clean up later
  const disposable = monaco.languages.registerCompletionItemProvider(model.getLanguageId(), {
    triggerCharacters: ['.', ':', '<', '"', "'", '/', '@', '#'],
    provideCompletionItems: async (model, position) => {
      const lspPosition = {
        line: position.lineNumber - 1,
        character: position.column - 1
      };
      
      const result = await window.electronAPI.lspCompletion(serverInfo.serverId, uri, lspPosition);
      
      if (!result.success || !result.result) {
        return { suggestions: [] };
      }
      
      const items = result.result.items || result.result;
      const suggestions = items.map(item => ({
        label: item.label,
        kind: mapCompletionKind(item.kind),
        detail: item.detail,
        documentation: item.documentation?.value || item.documentation,
        insertText: item.insertText || item.label,
        insertTextRules: item.insertTextFormat === 2 
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet 
          : undefined,
        range: item.textEdit?.range ? {
          startLineNumber: item.textEdit.range.start.line + 1,
          startColumn: item.textEdit.range.start.character + 1,
          endLineNumber: item.textEdit.range.end.line + 1,
          endColumn: item.textEdit.range.end.character + 1
        } : undefined,
        sortText: item.sortText,
        filterText: item.filterText
      }));
      
      return { suggestions };
    }
  });
}

// Setup hover provider
function setupHoverProvider(editor, serverInfo, uri) {
  const model = editor.getModel();
  if (!model) return;
  
  monaco.languages.registerHoverProvider(model.getLanguageId(), {
    provideHover: async (model, position) => {
      const lspPosition = {
        line: position.lineNumber - 1,
        character: position.column - 1
      };
      
      const result = await window.electronAPI.lspHover(serverInfo.serverId, uri, lspPosition);
      
      if (!result.success || !result.result) {
        return null;
      }
      
      const hover = result.result;
      let contents;
      
      if (typeof hover.contents === 'string') {
        contents = [{ value: hover.contents }];
      } else if (hover.contents.kind === 'markdown') {
        contents = [{ value: hover.contents.value }];
      } else if (Array.isArray(hover.contents)) {
        contents = hover.contents.map(c => ({ value: typeof c === 'string' ? c : c.value }));
      } else if (hover.contents.value) {
        contents = [{ value: hover.contents.value }];
      } else {
        contents = [{ value: String(hover.contents) }];
      }
      
      return {
        contents,
        range: hover.range ? {
          startLineNumber: hover.range.start.line + 1,
          startColumn: hover.range.start.character + 1,
          endLineNumber: hover.range.end.line + 1,
          endColumn: hover.range.end.character + 1
        } : undefined
      };
    }
  });
}

// Setup definition provider (Go to Definition)
function setupDefinitionProvider(editor, serverInfo, uri) {
  const model = editor.getModel();
  if (!model) return;
  
  monaco.languages.registerDefinitionProvider(model.getLanguageId(), {
    provideDefinition: async (model, position) => {
      const lspPosition = {
        line: position.lineNumber - 1,
        character: position.column - 1
      };
      
      const result = await window.electronAPI.lspDefinition(serverInfo.serverId, uri, lspPosition);
      
      if (!result.success || !result.result) {
        return null;
      }
      
      const locations = Array.isArray(result.result) ? result.result : [result.result];
      
      return locations.map(loc => ({
        uri: monaco.Uri.parse(loc.uri || loc.targetUri),
        range: {
          startLineNumber: (loc.range || loc.targetRange).start.line + 1,
          startColumn: (loc.range || loc.targetRange).start.character + 1,
          endLineNumber: (loc.range || loc.targetRange).end.line + 1,
          endColumn: (loc.range || loc.targetRange).end.character + 1
        }
      }));
    }
  });
}

// Setup signature help provider
function setupSignatureHelpProvider(editor, serverInfo, uri) {
  const model = editor.getModel();
  if (!model) return;
  
  monaco.languages.registerSignatureHelpProvider(model.getLanguageId(), {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp: async (model, position) => {
      const lspPosition = {
        line: position.lineNumber - 1,
        character: position.column - 1
      };
      
      const result = await window.electronAPI.lspSignatureHelp(serverInfo.serverId, uri, lspPosition);
      
      if (!result.success || !result.result) {
        return null;
      }
      
      const sigHelp = result.result;
      
      return {
        value: {
          signatures: sigHelp.signatures.map(sig => ({
            label: sig.label,
            documentation: sig.documentation?.value || sig.documentation,
            parameters: (sig.parameters || []).map(p => ({
              label: p.label,
              documentation: p.documentation?.value || p.documentation
            }))
          })),
          activeSignature: sigHelp.activeSignature || 0,
          activeParameter: sigHelp.activeParameter || 0
        },
        dispose: () => {}
      };
    }
  });
}

// Map LSP completion kind to Monaco
function mapCompletionKind(kind) {
  const kindMap = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    11: monaco.languages.CompletionItemKind.Unit,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    16: monaco.languages.CompletionItemKind.Color,
    17: monaco.languages.CompletionItemKind.File,
    18: monaco.languages.CompletionItemKind.Reference,
    19: monaco.languages.CompletionItemKind.Folder,
    20: monaco.languages.CompletionItemKind.EnumMember,
    21: monaco.languages.CompletionItemKind.Constant,
    22: monaco.languages.CompletionItemKind.Struct,
    23: monaco.languages.CompletionItemKind.Event,
    24: monaco.languages.CompletionItemKind.Operator,
    25: monaco.languages.CompletionItemKind.TypeParameter
  };
  return kindMap[kind] || monaco.languages.CompletionItemKind.Text;
}

// Handle diagnostics from LSP server
function handleDiagnostics(data) {
  if (typeof monaco === 'undefined') return;
  
  const { uri, diagnostics } = data;
  
  // Convert URI to file path for Monaco
  const filePath = uri.replace('file://', '');
  
  // Find the model for this file
  const models = monaco.editor.getModels();
  const model = models.find(m => m.uri.path === filePath || m.uri.fsPath === filePath);
  
  if (!model) return;
  
  // Convert LSP diagnostics to Monaco markers
  const sevMap = getSeverityMap();
  const markers = diagnostics.map(d => ({
    severity: sevMap[d.severity] || sevMap[1],
    message: d.message,
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
    source: d.source || 'LSP',
    code: d.code
  }));
  
  // Set markers on model
  monaco.editor.setModelMarkers(model, 'lsp', markers);
}

// Notify server about document save
async function notifyDocumentSaved(filePath, text) {
  const workspacePath = window.fileTreeAPI?.getCurrentProjectPath?.();
  if (!workspacePath) return;
  
  const language = await window.electronAPI.lspGetLanguage(filePath);
  if (!language) return;
  
  const serverKey = `${language}:${workspacePath}`;
  const serverInfo = activeServers.get(serverKey);
  if (!serverInfo) return;
  
  const uri = `file://${filePath}`;
  await window.electronAPI.lspDidSave(serverInfo.serverId, uri, text);
}

// Notify server about document close
async function notifyDocumentClosed(filePath) {
  const workspacePath = window.fileTreeAPI?.getCurrentProjectPath?.();
  if (!workspacePath) return;
  
  const language = await window.electronAPI.lspGetLanguage(filePath);
  if (!language) return;
  
  const serverKey = `${language}:${workspacePath}`;
  const serverInfo = activeServers.get(serverKey);
  if (!serverInfo) return;
  
  const uri = `file://${filePath}`;
  await window.electronAPI.lspDidClose(serverInfo.serverId, uri);
  documentVersions.delete(uri);
}

// Get available language servers
async function getAvailableServers() {
  return await window.electronAPI.lspAvailableServers();
}

// Show LSP notification
function showLSPNotification(message, type = 'info') {
  const notification = document.createElement('div');
  const bgColor = type === 'error' ? '#c24038' : type === 'warning' ? '#cca700' : '#0e639c';
  notification.style.cssText = `
    position: fixed;
    bottom: 60px;
    right: 20px;
    padding: 12px 20px;
    background-color: ${bgColor};
    color: white;
    border-radius: 6px;
    font-size: 13px;
    z-index: 10004;
    max-width: 400px;
    white-space: pre-wrap;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// Initialize LSP listeners
function initLSP() {
  // Listen for diagnostics from main process
  window.electronAPI.onLspDiagnostics(handleDiagnostics);
  
  console.log('[LSP] LSP client initialized');
}

// Cleanup LSP
function cleanupLSP() {
  window.electronAPI.removeLspListeners();
  activeServers.clear();
  documentVersions.clear();
}

// Export API
window.lspAPI = {
  init: initLSP,
  cleanup: cleanupLSP,
  initForFile: initLSPForFile,
  notifySaved: notifyDocumentSaved,
  notifyClosed: notifyDocumentClosed,
  getAvailableServers,
  handleDiagnostics
};

