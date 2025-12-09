// Initialize Monaco Editor using the loader
let editors = new Map(); // Map of filePath -> editor instance
let activeEditor = null;
let activeFilePath = null;
let fileTabs = []; // Array of { filePath, fileName, editor }

// Expose editor functions globally for fileTree.js
window.editorAPI = {
  createEditorTab: null,
  setActiveTab: null,
  fileTabs: () => fileTabs
};

// Configure Monaco loader
require.config({ paths: { vs: '../../node_modules/monaco-editor/min/vs' } });

// Load Monaco Editor
require(['vs/editor/editor.main'], function () {
  loadTheme().then(() => {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => {
        initializeApp();
      });
    } else {
      initializeApp();
    }
  });
});

async function loadTheme() {
  try {
    const result = await window.electronAPI.loadTheme();
    if (result.success) {
      const themeData = result.data;
      
      monaco.editor.defineTheme('baked-theme', {
        base: themeData.base || 'vs-dark',
        inherit: themeData.inherit !== false,
        rules: themeData.rules || [],
        colors: themeData.colors || {}
      });
      
      monaco.editor.setTheme('baked-theme');
      
      // Force refresh all existing editors
      editors.forEach(editor => {
        editor.updateOptions({ theme: 'baked-theme' });
      });
    } else {
      console.warn('Failed to load theme:', result.error);
      monaco.editor.setTheme('vs-dark');
    }
  } catch (error) {
    console.warn('Failed to load theme:', error);
    monaco.editor.setTheme('vs-dark');
  }
}


function initializeApp() {
  setupMenus();
  createNewFile();
  setupKeyboardShortcuts();
  
  // Expose editor functions for fileTree.js
  window.editorAPI.createEditorTab = createEditorTab;
  window.editorAPI.setActiveTab = setActiveTab;
}

let fileMenuDropdown = null;
let helpMenuDropdown = null;

function setupMenus() {
  const fileMenu = document.getElementById('file-menu');
  fileMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showFileMenu(e.target);
  });

  document.getElementById('help-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showHelpMenu(e.target);
  });
  
  ['edit-menu', 'view-menu', 'window-menu'].forEach(menuId => {
    document.getElementById(menuId).addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
  
  document.addEventListener('click', (e) => {
    const fileMenu = document.getElementById('file-menu');
    const helpMenu = document.getElementById('help-menu');
    if (fileMenuDropdown && !fileMenuDropdown.contains(e.target) && !fileMenu.contains(e.target)) {
      hideFileMenu();
    }
    if (helpMenuDropdown && !helpMenuDropdown.contains(e.target) && !helpMenu.contains(e.target)) {
      hideHelpMenu();
    }
  });
}

function showFileMenu(menuElement) {
  // Remove existing dropdown if any
  hideFileMenu();
  
  // Create dropdown menu
  fileMenuDropdown = document.createElement('div');
  fileMenuDropdown.id = 'file-menu-dropdown';
  fileMenuDropdown.style.cssText = `
    position: absolute;
    background-color: #2d2d30;
    border: 1px solid #3e3e42;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    z-index: 10000;
    min-width: 200px;
    padding: 4px 0;
  `;
  
  fileMenuDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  const menuItems = [
    { label: 'New File', action: () => { createNewFile(); hideFileMenu(); }, shortcut: 'Ctrl+N' },
    { label: 'Open File...', action: () => { openFile(); hideFileMenu(); }, shortcut: 'Ctrl+O' },
    { label: 'Open Folder...', action: () => { if (window.fileTreeAPI) window.fileTreeAPI.openFolder(); hideFileMenu(); }, shortcut: 'Ctrl+K Ctrl+O' },
    { label: '---' },
    { label: 'Save', action: () => { saveCurrentFile(); hideFileMenu(); }, shortcut: 'Ctrl+S' },
    { label: 'Save As...', action: () => { saveFileAs(); hideFileMenu(); }, shortcut: 'Ctrl+Shift+S' },
    { label: '---' },
    { label: 'Quit', action: () => { window.electronAPI.quit(); } }
  ];
  
  menuItems.forEach(item => {
    if (item.label === '---') {
      const separator = document.createElement('div');
      separator.style.cssText = 'height: 1px; background-color: #3e3e42; margin: 4px 0;';
      fileMenuDropdown.appendChild(separator);
    } else {
      const menuItem = document.createElement('div');
      menuItem.style.cssText = `
        padding: 6px 20px 6px 12px;
        cursor: pointer;
        user-select: none;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;
      menuItem.appendChild(labelSpan);
      
      if (item.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.textContent = item.shortcut;
        shortcut.style.cssText = 'color: #858585; font-size: 11px; margin-left: 20px;';
        menuItem.appendChild(shortcut);
      }
      
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.backgroundColor = '#37373d';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.backgroundColor = 'transparent';
      });
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        item.action();
      });
      
      fileMenuDropdown.appendChild(menuItem);
    }
  });
  
  const rect = menuElement.getBoundingClientRect();
  fileMenuDropdown.style.top = `${rect.bottom + 2}px`;
  fileMenuDropdown.style.left = `${rect.left}px`;
  
  document.body.appendChild(fileMenuDropdown);
}

function hideFileMenu() {
  if (fileMenuDropdown) {
    fileMenuDropdown.remove();
    fileMenuDropdown = null;
  }
}

function showHelpMenu(menuElement) {
  hideHelpMenu();
  
  helpMenuDropdown = document.createElement('div');
  helpMenuDropdown.id = 'help-menu-dropdown';
  helpMenuDropdown.style.cssText = `
    position: absolute;
    background-color: #2d2d30;
    border: 1px solid #3e3e42;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    z-index: 10000;
    min-width: 200px;
    padding: 4px 0;
  `;
  
  helpMenuDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  const menuItems = [
    { label: 'About BakedIDE', action: () => { alert('BakedIDE v0.0.1\nAdvanced text editor inspired by Kate and VS Code'); hideHelpMenu(); } },
    { label: '---' },
    { label: 'Quit', action: () => { if (confirm('Are you sure you want to quit?')) { window.electronAPI.quit(); } } }
  ];
  
  menuItems.forEach(item => {
    if (item.label === '---') {
      const separator = document.createElement('div');
      separator.style.cssText = 'height: 1px; background-color: #3e3e42; margin: 4px 0;';
      helpMenuDropdown.appendChild(separator);
    } else {
      const menuItem = document.createElement('div');
      menuItem.style.cssText = `
        padding: 6px 20px 6px 12px;
        cursor: pointer;
        user-select: none;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      
      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;
      menuItem.appendChild(labelSpan);
      
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.backgroundColor = '#37373d';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.backgroundColor = 'transparent';
      });
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        item.action();
      });
      
      helpMenuDropdown.appendChild(menuItem);
    }
  });
  
  const rect = menuElement.getBoundingClientRect();
  helpMenuDropdown.style.top = `${rect.bottom + 2}px`;
  helpMenuDropdown.style.left = `${rect.left}px`;
  
  document.body.appendChild(helpMenuDropdown);
}

function hideHelpMenu() {
  if (helpMenuDropdown) {
    helpMenuDropdown.remove();
    helpMenuDropdown = null;
  }
}

function setupKeyboardShortcuts() {
  if (typeof monaco !== 'undefined') {
    monaco.editor.addKeybindingRule({
      keybinding: monaco.KeyCode.KeyN | monaco.KeyMod.CtrlCmd,
      command: 'bakedide.newFile'
    });
    
    monaco.editor.addKeybindingRule({
      keybinding: monaco.KeyCode.KeyO | monaco.KeyMod.CtrlCmd,
      command: 'bakedide.openFile'
    });
    
    monaco.editor.addKeybindingRule({
      keybinding: monaco.KeyCode.KeyS | monaco.KeyMod.CtrlCmd,
      command: 'bakedide.saveFile'
    });
    
    monaco.editor.addKeybindingRule({
      keybinding: monaco.KeyCode.KeyS | monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift,
      command: 'bakedide.saveFileAs'
    });
    
    monaco.editor.registerCommand('bakedide.newFile', () => createNewFile());
    monaco.editor.registerCommand('bakedide.openFile', () => openFile());
    monaco.editor.registerCommand('bakedide.saveFile', () => saveCurrentFile());
    monaco.editor.registerCommand('bakedide.saveFileAs', () => saveFileAs());
  }
  
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'n' && !e.shiftKey) {
      e.preventDefault();
      createNewFile();
    } else if (e.ctrlKey && e.key === 'o' && !e.shiftKey) {
      e.preventDefault();
      openFile();
    } else if (e.ctrlKey && e.key === 's' && !e.shiftKey) {
      e.preventDefault();
      saveCurrentFile();
    } else if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      saveFileAs();
    }
  });
}

function createNewFile() {
  const fileName = `Untitled-${fileTabs.length + 1}`;
  const filePath = null; // New files don't have a path yet
  
  createEditorTab(filePath, fileName, `// ${fileName}\n\n`);
}

function createEditorTab(filePath, fileName, content) {
  const container = document.getElementById('editor-container');
  
  // Clear container if it's the first editor
  if (editors.size === 0) {
    container.innerHTML = '';
  }
  
  // Create editor instance
  const editorId = `editor-${Date.now()}`;
  const editorDiv = document.createElement('div');
  editorDiv.id = editorId;
  editorDiv.style.width = '100%';
  editorDiv.style.height = '100%';
  editorDiv.style.display = activeEditor ? 'none' : 'block';
  editorDiv.style.position = 'absolute';
  editorDiv.style.top = '0';
  editorDiv.style.left = '0';
  editorDiv.style.right = '0';
  editorDiv.style.bottom = '0';
  container.appendChild(editorDiv);
  
  // Detect language from file extension
  const language = detectLanguage(filePath || fileName);
  
  // Create Monaco editor
  const editor = monaco.editor.create(editorDiv, {
    value: content,
    language: language,
    theme: 'baked-theme',
    automaticLayout: true,
    'semanticHighlighting.enabled': true,
    fontSize: 14,
    minimap: {
      enabled: true
    },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    bracketPairColorization: {
      enabled: true
    },
    guides: {
      bracketPairs: 'active'
    }
  });
  
  // Track editor
  editors.set(filePath || editorId, editor);
  
  // Add to tabs
  const tabInfo = {
    filePath: filePath,
    fileName: fileName,
    editorId: editorId,
    editor: editor,
    editorDiv: editorDiv
  };
  fileTabs.push(tabInfo);
  
  // Create tab element
  createTabElement(tabInfo);
  
  // Set as active
  setActiveTab(tabInfo);
  
  // Track changes
  editor.onDidChangeModelContent(() => {
    updateTabModified(tabInfo, true);
  });
  
  console.log(`Editor created for: ${fileName}`);
}

function createTabElement(tabInfo) {
  const tabsContainer = document.getElementById('tabs-container');
  
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.editorId = tabInfo.editorId;
  
  const fileNameSpan = document.createElement('span');
  fileNameSpan.textContent = tabInfo.fileName;
  fileNameSpan.style.flex = '1';
  
  const closeBtn = document.createElement('span');
  closeBtn.className = 'tab-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close';
  
  tab.appendChild(fileNameSpan);
  tab.appendChild(closeBtn);
  
  // Make tab draggable
  tab.draggable = true;
  tab.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabInfo.editorId);
    tab.classList.add('dragging');
  });
  
  tab.addEventListener('dragend', (e) => {
    tab.classList.remove('dragging');
    document.querySelectorAll('.tab-drag-over').forEach(el => {
      el.classList.remove('tab-drag-over');
    });
  });
  
  tab.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const afterElement = getDragAfterElement(tabsContainer, e.clientX);
    const dragging = document.querySelector('.tab.dragging');
    if (afterElement == null) {
      tabsContainer.appendChild(dragging);
    } else {
      tabsContainer.insertBefore(dragging, afterElement);
    }
  });
  
  tab.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (!tab.classList.contains('dragging')) {
      tab.classList.add('tab-drag-over');
    }
  });
  
  tab.addEventListener('dragleave', (e) => {
    tab.classList.remove('tab-drag-over');
  });
  
  tab.addEventListener('drop', (e) => {
    e.preventDefault();
    tab.classList.remove('tab-drag-over');
    const draggedId = e.dataTransfer.getData('text/plain');
    const draggedTab = fileTabs.find(t => t.editorId === draggedId);
    const draggedTabElement = draggedTab.tabElement;
    
    if (draggedTabElement !== tab) {
      const tabs = Array.from(tabsContainer.children);
      const draggedIndex = tabs.indexOf(draggedTabElement);
      const targetIndex = tabs.indexOf(tab);
      
      // Reorder tabs array
      fileTabs.splice(targetIndex, 0, fileTabs.splice(draggedIndex, 1)[0]);
      
      // Reorder DOM
      if (targetIndex > draggedIndex) {
        tabsContainer.insertBefore(draggedTabElement, tab.nextSibling);
      } else {
        tabsContainer.insertBefore(draggedTabElement, tab);
      }
    }
  });
  
  tab.addEventListener('click', (e) => {
    if (e.target === closeBtn || e.target.parentElement === closeBtn) {
      closeTab(tabInfo);
    } else {
      setActiveTab(tabInfo);
    }
  });
  
  tabsContainer.appendChild(tab);
  tabInfo.tabElement = tab;
}

function getDragAfterElement(container, x) {
  const draggableElements = [...container.querySelectorAll('.tab:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function setActiveTab(tabInfo) {
  // Hide all editors
  fileTabs.forEach(t => {
    t.editorDiv.style.display = 'none';
    t.tabElement.classList.remove('active');
  });
  
  // Show active editor
  tabInfo.editorDiv.style.display = 'block';
  tabInfo.tabElement.classList.add('active');
  
  activeEditor = tabInfo.editor;
  activeFilePath = tabInfo.filePath;
  
  // Update status bar
  updateStatusBar(tabInfo);
  
  // Focus editor
  tabInfo.editor.focus();
}

function closeTab(tabInfo) {
  // Check if file has unsaved changes
  const hasChanges = tabInfo.tabElement.querySelector('span').textContent.includes('*');
  
  if (hasChanges) {
    const save = confirm(`${tabInfo.fileName} has unsaved changes. Save before closing?`);
    if (save) {
      if (tabInfo.filePath) {
        saveFile(tabInfo);
      } else {
        saveFileAs(tabInfo);
      }
    }
  }
  
  // Remove editor
  tabInfo.editor.dispose();
  editors.delete(tabInfo.filePath || tabInfo.editorId);
  
  // Remove tab element
  tabInfo.tabElement.remove();
  
  // Remove from tabs array
  const index = fileTabs.indexOf(tabInfo);
  fileTabs.splice(index, 1);
  
  // If this was the active tab, switch to another
  if (activeEditor === tabInfo.editor) {
    if (fileTabs.length > 0) {
      setActiveTab(fileTabs[fileTabs.length - 1]);
    } else {
      // No tabs left, create new file
      createNewFile();
    }
  }
}

function updateTabModified(tabInfo, modified) {
  const fileNameSpan = tabInfo.tabElement.querySelector('span');
  if (modified && !fileNameSpan.textContent.includes('*')) {
    fileNameSpan.textContent = tabInfo.fileName + ' *';
  } else if (!modified) {
    fileNameSpan.textContent = tabInfo.fileName;
  }
}

async function openFile() {
  if (!window.electronAPI) {
    alert('File operations not available');
    return;
  }
  
  const result = await window.electronAPI.openFile();
  
  if (result && result.success) {
    const existingTab = fileTabs.find(t => t.filePath === result.filePath);
    if (existingTab) {
      setActiveTab(existingTab);
      return;
    }
    
    const fileName = result.filePath.split(/[/\\]/).pop();
    createEditorTab(result.filePath, fileName, result.content);
  }
}

async function saveCurrentFile() {
  if (!activeFilePath) {
    await saveFileAs();
    return;
  }
  
  const tabInfo = fileTabs.find(t => t.editor === activeEditor);
  if (tabInfo) {
    await saveFile(tabInfo);
  }
}

async function saveFile(tabInfo) {
  const content = tabInfo.editor.getValue();
  const result = await window.electronAPI.saveFile(content, tabInfo.filePath);
  
  if (result.success) {
    updateTabModified(tabInfo, false);
    updateStatusBar(tabInfo);
  } else {
    alert(`Error saving file: ${result.error}`);
  }
}

async function saveFileAs(tabInfo = null) {
  const editorToSave = tabInfo ? tabInfo.editor : activeEditor;
  const content = editorToSave.getValue();
  
  const result = await window.electronAPI.saveFileAs(content);
  
  if (result.success) {
    const tab = tabInfo || fileTabs.find(t => t.editor === editorToSave);
    if (tab) {
      // Update tab with new file path
      const fileName = result.filePath.split(/[/\\]/).pop();
      tab.filePath = result.filePath;
      tab.fileName = fileName;
      tab.tabElement.querySelector('span').textContent = fileName;
      
      // Update editor language
      const language = detectLanguage(result.filePath);
      monaco.editor.setModelLanguage(editorToSave.getModel(), language);
      
      updateTabModified(tab, false);
      updateStatusBar(tab);
    }
  }
}

function detectLanguage(filePath) {
  if (!filePath) return 'plaintext';
  
  const ext = filePath.split('.').pop().toLowerCase();
  const languageMap = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'hpp': 'cpp',
    'hxx': 'cpp',
    'h': 'c',
    'c': 'c',
    'cs': 'csharp',
    'py': 'python',
    'lua': 'lua',
    'luau': 'luau',
    'json': 'json',
    'html': 'html',
    'css': 'css',
    'md': 'markdown'
  };
  
  return languageMap[ext] || 'plaintext';
}

function updateStatusBar(tabInfo) {
  const statusText = document.getElementById('status-text');
  if (tabInfo.filePath) {
    statusText.textContent = tabInfo.filePath;
  } else {
    statusText.textContent = `BakedIDE - ${tabInfo.fileName}`;
  }
}

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  editors.forEach(editor => {
    editor.dispose();
  });
});