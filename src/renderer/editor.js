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


async function initializeApp() {
  setupMenus();
  setupKeyboardShortcuts();
  setupBottomPanel();
  
  // MutationObserver removed - visibility-based CSS preserves content naturally
  
  // Expose editor functions for fileTree.js
  window.editorAPI.createEditorTab = createEditorTab;
  window.editorAPI.setActiveTab = setActiveTab;
  window.editorAPI.openFileAtLine = openFileAtLine;
  window.editorAPI.setCursorPosition = (line, column) => {
    if (activeEditor) {
      activeEditor.setPosition({ lineNumber: line, column: column || 1 });
      activeEditor.revealLineInCenter(line);
    }
  };
  
  // Try to load last project, otherwise create new file
  if (window.fileTreeAPI && window.fileTreeAPI.loadLastProject) {
    try {
      await window.fileTreeAPI.loadLastProject();
      // If no project was loaded, create a new file
      if (!window.fileTreeAPI.getCurrentProjectPath()) {
        createNewFile();
      }
    } catch (error) {
      console.error('Failed to load last project:', error);
      createNewFile();
    }
  } else {
    // Fallback if fileTreeAPI isn't ready yet
    setTimeout(async () => {
      if (window.fileTreeAPI && window.fileTreeAPI.loadLastProject) {
        try {
          await window.fileTreeAPI.loadLastProject();
          if (!window.fileTreeAPI.getCurrentProjectPath()) {
            createNewFile();
          }
        } catch (error) {
          createNewFile();
        }
      } else {
        createNewFile();
      }
    }, 500);
  }
}

let fileMenuDropdown = null;
let editMenuDropdown = null;
let viewMenuDropdown = null;
let windowMenuDropdown = null;
let helpMenuDropdown = null;

// View state
let sidebarVisible = false;
let statusBarVisible = true;
let bottomPanelVisible = false;
let currentZoom = 0; // 0 = 100%, positive = zoomed in, negative = zoomed out
let bottomPanelHeight = 300; // Default height in pixels

function setupMenus() {
  const fileMenu = document.getElementById('file-menu');
  fileMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showFileMenu(e.target);
  });

  document.getElementById('edit-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showEditMenu(e.target);
  });

  document.getElementById('build-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (window.buildSystemAPI && window.buildSystemAPI.showBuildMenu) {
      window.buildSystemAPI.showBuildMenu(e.target);
    }
  });

  document.getElementById('view-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showViewMenu(e.target);
  });

  document.getElementById('window-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showWindowMenu(e.target);
  });

  document.getElementById('help-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showHelpMenu(e.target);
  });
  
  document.addEventListener('click', (e) => {
    const fileMenu = document.getElementById('file-menu');
    const editMenu = document.getElementById('edit-menu');
    const buildMenu = document.getElementById('build-menu');
    const viewMenu = document.getElementById('view-menu');
    const windowMenu = document.getElementById('window-menu');
    const helpMenu = document.getElementById('help-menu');
    if (fileMenuDropdown && !fileMenuDropdown.contains(e.target) && !fileMenu.contains(e.target)) {
      hideFileMenu();
    }
    if (editMenuDropdown && !editMenuDropdown.contains(e.target) && !editMenu.contains(e.target)) {
      hideEditMenu();
    }
    if (buildMenu && window.buildSystemAPI && window.buildSystemAPI.hideBuildMenu) {
      // Check if build menu dropdown exists (it's managed in buildSystem.js)
      const buildMenuDropdown = document.getElementById('build-menu-dropdown');
      if (buildMenuDropdown && !buildMenuDropdown.contains(e.target) && !buildMenu.contains(e.target)) {
        window.buildSystemAPI.hideBuildMenu();
      }
    }
    if (viewMenuDropdown && !viewMenuDropdown.contains(e.target) && !viewMenu.contains(e.target)) {
      hideViewMenu();
    }
    if (windowMenuDropdown && !windowMenuDropdown.contains(e.target) && !windowMenu.contains(e.target)) {
      hideWindowMenu();
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
    { label: 'Configure Build System...', action: () => { if (window.buildSystemAPI && window.buildSystemAPI.showBuildConfigDialog) window.buildSystemAPI.showBuildConfigDialog(); hideFileMenu(); } },
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

function showEditMenu(menuElement) {
  hideEditMenu();
  
  editMenuDropdown = document.createElement('div');
  editMenuDropdown.id = 'edit-menu-dropdown';
  editMenuDropdown.style.cssText = `
    position: absolute;
    background-color: #2d2d30;
    border: 1px solid #3e3e42;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    z-index: 10000;
    min-width: 200px;
    padding: 4px 0;
  `;
  
  editMenuDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  const menuItems = [
    { label: 'Undo', action: () => { executeEditorCommand('undo'); hideEditMenu(); }, shortcut: 'Ctrl+Z', enabled: () => activeEditor && activeEditor.getModel().canUndo() },
    { label: 'Redo', action: () => { executeEditorCommand('redo'); hideEditMenu(); }, shortcut: 'Ctrl+Y', enabled: () => activeEditor && activeEditor.getModel().canRedo() },
    { label: '---' },
    { label: 'Cut', action: () => { executeEditorCommand('editor.action.clipboardCutAction'); hideEditMenu(); }, shortcut: 'Ctrl+X', enabled: () => activeEditor && activeEditor.hasTextFocus() },
    { label: 'Copy', action: () => { executeEditorCommand('editor.action.clipboardCopyAction'); hideEditMenu(); }, shortcut: 'Ctrl+C', enabled: () => activeEditor && activeEditor.hasTextFocus() },
    { label: 'Paste', action: () => { executeEditorCommand('editor.action.clipboardPasteAction'); hideEditMenu(); }, shortcut: 'Ctrl+V', enabled: () => activeEditor && activeEditor.hasTextFocus() },
    { label: '---' },
    { label: 'Select All', action: () => { executeEditorCommand('editor.action.selectAll'); hideEditMenu(); }, shortcut: 'Ctrl+A', enabled: () => activeEditor !== null },
    { label: '---' },
    { label: 'Find', action: () => { executeEditorCommand('actions.find'); hideEditMenu(); }, shortcut: 'Ctrl+F', enabled: () => activeEditor !== null },
    { label: 'Replace', action: () => { executeEditorCommand('editor.action.startFindReplaceAction'); hideEditMenu(); }, shortcut: 'Ctrl+H', enabled: () => activeEditor !== null },
  ];
  
  menuItems.forEach(item => {
    if (item.label === '---') {
      const separator = document.createElement('div');
      separator.style.cssText = 'height: 1px; background-color: #3e3e42; margin: 4px 0;';
      editMenuDropdown.appendChild(separator);
    } else {
      const menuItem = document.createElement('div');
      const isEnabled = item.enabled ? item.enabled() : true;
      
      menuItem.style.cssText = `
        padding: 6px 20px 6px 12px;
        cursor: ${isEnabled ? 'pointer' : 'default'};
        user-select: none;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: ${isEnabled ? '#cccccc' : '#666666'};
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
      
      if (isEnabled) {
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
      }
      
      editMenuDropdown.appendChild(menuItem);
    }
  });
  
  const rect = menuElement.getBoundingClientRect();
  editMenuDropdown.style.top = `${rect.bottom + 2}px`;
  editMenuDropdown.style.left = `${rect.left}px`;
  
  document.body.appendChild(editMenuDropdown);
}

function hideEditMenu() {
  if (editMenuDropdown) {
    editMenuDropdown.remove();
    editMenuDropdown = null;
  }
}

function showViewMenu(menuElement) {
  hideViewMenu();
  
  // Update state from DOM
  const sidebar = document.getElementById('file-tree-sidebar');
  const statusBar = document.getElementById('status-bar');
  const bottomPanel = document.getElementById('bottom-panel');
  sidebarVisible = sidebar.classList.contains('visible');
  statusBarVisible = statusBar.style.display !== 'none';
  bottomPanelVisible = bottomPanel.classList.contains('visible');
  
  viewMenuDropdown = document.createElement('div');
  viewMenuDropdown.id = 'view-menu-dropdown';
  viewMenuDropdown.style.cssText = `
    position: absolute;
    background-color: #2d2d30;
    border: 1px solid #3e3e42;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    z-index: 10000;
    min-width: 200px;
    padding: 4px 0;
  `;
  
  viewMenuDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  // Check current editor settings
  const wordWrapEnabled = activeEditor ? activeEditor.getOption(monaco.editor.EditorOption.wordWrap) === 'on' : true;
  const minimapEnabled = activeEditor ? activeEditor.getOption(monaco.editor.EditorOption.minimap).enabled : true;
  
  const menuItems = [
    { label: 'Explorer', action: () => { toggleSidebar(); hideViewMenu(); }, shortcut: 'Ctrl+Shift+E', checked: sidebarVisible },
    { label: 'Status Bar', action: () => { toggleStatusBar(); hideViewMenu(); }, checked: statusBarVisible },
    { label: 'Bottom Panel', action: () => { toggleBottomPanel(); hideViewMenu(); }, checked: bottomPanelVisible },
    { label: '---' },
    { label: 'Zoom In', action: () => { zoomIn(); hideViewMenu(); }, shortcut: 'Ctrl+=' },
    { label: 'Zoom Out', action: () => { zoomOut(); hideViewMenu(); }, shortcut: 'Ctrl+-' },
    { label: 'Reset Zoom', action: () => { resetZoom(); hideViewMenu(); }, shortcut: 'Ctrl+0' },
    { label: '---' },
    { label: 'Word Wrap', action: () => { toggleWordWrap(); hideViewMenu(); }, checked: wordWrapEnabled },
    { label: 'Minimap', action: () => { toggleMinimap(); hideViewMenu(); }, checked: minimapEnabled },
  ];
  
  menuItems.forEach(item => {
    if (item.label === '---') {
      const separator = document.createElement('div');
      separator.style.cssText = 'height: 1px; background-color: #3e3e42; margin: 4px 0;';
      viewMenuDropdown.appendChild(separator);
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
      } else if (item.checked !== undefined) {
        const checkmark = document.createElement('span');
        checkmark.textContent = item.checked ? '✓' : '';
        checkmark.style.cssText = 'color: #007acc; font-size: 12px; margin-left: 20px;';
        menuItem.appendChild(checkmark);
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
      
      viewMenuDropdown.appendChild(menuItem);
    }
  });
  
  const rect = menuElement.getBoundingClientRect();
  viewMenuDropdown.style.top = `${rect.bottom + 2}px`;
  viewMenuDropdown.style.left = `${rect.left}px`;
  
  document.body.appendChild(viewMenuDropdown);
}

function hideViewMenu() {
  if (viewMenuDropdown) {
    viewMenuDropdown.remove();
    viewMenuDropdown = null;
  }
}

function showWindowMenu(menuElement) {
  hideWindowMenu();
  
  windowMenuDropdown = document.createElement('div');
  windowMenuDropdown.id = 'window-menu-dropdown';
  windowMenuDropdown.style.cssText = `
    position: absolute;
    background-color: #2d2d30;
    border: 1px solid #3e3e42;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    z-index: 10000;
    min-width: 200px;
    padding: 4px 0;
  `;
  
  windowMenuDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  const menuItems = [
    { label: 'New Window', action: () => { createNewWindow(); hideWindowMenu(); }, shortcut: 'Ctrl+Shift+N' },
    { label: 'Close Editor', action: () => { closeCurrentEditor(); hideWindowMenu(); }, shortcut: 'Ctrl+W', enabled: () => activeEditor !== null },
    { label: '---' },
    { label: 'Split Editor Right', action: () => { splitEditor('vertical'); hideWindowMenu(); }, shortcut: 'Ctrl+\\', enabled: () => activeEditor !== null },
    { label: 'Split Editor Down', action: () => { splitEditor('horizontal'); hideWindowMenu(); }, shortcut: 'Ctrl+K Ctrl+\\', enabled: () => activeEditor !== null },
    { label: 'Close Editor Group', action: () => { closeEditorGroup(); hideWindowMenu(); }, enabled: () => activeEditor !== null },
    { label: '---' },
    { label: 'Close All Editors', action: () => { closeAllEditors(); hideWindowMenu(); }, enabled: () => fileTabs.length > 0 },
  ];
  
  menuItems.forEach(item => {
    if (item.label === '---') {
      const separator = document.createElement('div');
      separator.style.cssText = 'height: 1px; background-color: #3e3e42; margin: 4px 0;';
      windowMenuDropdown.appendChild(separator);
    } else {
      const menuItem = document.createElement('div');
      const isEnabled = item.enabled ? item.enabled() : true;
      
      menuItem.style.cssText = `
        padding: 6px 20px 6px 12px;
        cursor: ${isEnabled ? 'pointer' : 'default'};
        user-select: none;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: ${isEnabled ? '#cccccc' : '#666666'};
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
      
      if (isEnabled) {
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
      }
      
      windowMenuDropdown.appendChild(menuItem);
    }
  });
  
  const rect = menuElement.getBoundingClientRect();
  windowMenuDropdown.style.top = `${rect.bottom + 2}px`;
  windowMenuDropdown.style.left = `${rect.left}px`;
  
  document.body.appendChild(windowMenuDropdown);
}

function hideWindowMenu() {
  if (windowMenuDropdown) {
    windowMenuDropdown.remove();
    windowMenuDropdown = null;
  }
}

function createNewWindow() {
  // For now, just create a new file - in the future this could open a new Electron window
  createNewFile();
}

function closeCurrentEditor() {
  if (activeEditor && activeFilePath) {
    const currentTab = fileTabs.find(t => t.filePath === activeFilePath || t.editor === activeEditor);
    if (currentTab) {
      closeTab(currentTab);
    }
  } else if (activeEditor) {
    // Handle untitled files
    const currentTab = fileTabs.find(t => t.editor === activeEditor);
    if (currentTab) {
      closeTab(currentTab);
    }
  }
}

function splitEditor(direction) {
  // Placeholder for split view - will be implemented later
  alert(`Split editor ${direction} - Feature coming soon!`);
}

function closeEditorGroup() {
  // Placeholder for closing editor group - will be implemented with split view
  alert('Close editor group - Feature coming soon!');
}

function closeAllEditors() {
  if (fileTabs.length === 0) return;
  
  const hasUnsavedChanges = fileTabs.some(tab => {
    return tab.tabElement.querySelector('span').textContent.includes('*');
  });
  
  if (hasUnsavedChanges) {
    if (!confirm('Some files have unsaved changes. Close all editors anyway?')) {
      return;
    }
  }
  
  // Close all tabs
  const tabsToClose = [...fileTabs];
  tabsToClose.forEach(tab => {
    closeTab(tab);
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById('file-tree-sidebar');
  const isVisible = sidebar.classList.contains('visible');
  sidebarVisible = !isVisible;
  if (sidebarVisible) {
    sidebar.classList.add('visible');
  } else {
    sidebar.classList.remove('visible');
  }
}

function toggleStatusBar() {
  const statusBar = document.getElementById('status-bar');
  statusBarVisible = !statusBarVisible;
  if (statusBarVisible) {
    statusBar.style.display = 'flex';
  } else {
    statusBar.style.display = 'none';
  }
}

function toggleBottomPanel() {
  const bottomPanel = document.getElementById('bottom-panel');
  bottomPanelVisible = !bottomPanelVisible;
  if (bottomPanelVisible) {
    bottomPanel.classList.add('visible');
    bottomPanel.style.height = `${bottomPanelHeight}px`;
  } else {
    bottomPanel.classList.remove('visible');
  }
}

function setupBottomPanel() {
  // Tab switching
  const panelTabs = document.querySelectorAll('.panel-tab');
  
  panelTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('TAB CLICKED:', tab.dataset.tab);
      
      // Remove active class from all tabs
      panelTabs.forEach(t => t.classList.remove('active'));
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Just toggle the active class - both tabs are always rendered
      // The active one has higher z-index and appears on top
      document.querySelectorAll('.panel-tab-content').forEach(content => {
        content.classList.remove('active');
      });
      
      const tabName = tab.dataset.tab;
      const content = document.getElementById(`${tabName}-content`);
      if (content) {
        content.classList.add('active');
      }
      
      // If switching to terminal, fit and focus it
      if (tabName === 'terminal' && window.terminalAPI) {
        setTimeout(() => {
          window.terminalAPI.fit();
          window.terminalAPI.focus();
        }, 50);
      }
      
      console.log('Switched to tab:', tabName);
    });
  });
  
  // Panel resizer
  const panelResizer = document.getElementById('panel-resizer');
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;
  
  panelResizer.addEventListener('mousedown', (e) => {
    if (!bottomPanelVisible) return;
    isResizing = true;
    startY = e.clientY;
    const bottomPanel = document.getElementById('bottom-panel');
    startHeight = bottomPanel.offsetHeight;
    panelResizer.classList.add('resizing');
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const deltaY = startY - e.clientY; // Inverted because we're resizing from top
    const newHeight = Math.max(150, Math.min(window.innerHeight * 0.8, startHeight + deltaY));
    bottomPanelHeight = newHeight;
    const bottomPanel = document.getElementById('bottom-panel');
    if (bottomPanel && bottomPanelVisible) {
      bottomPanel.style.height = `${newHeight}px`;
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      panelResizer.classList.remove('resizing');
      document.body.style.cursor = '';
    }
  });
  
  // Terminal input handling (basic implementation)
  const terminalInput = document.getElementById('terminal-input');
  const terminalOutput = document.getElementById('terminal-output');
  
  if (terminalInput) {
    terminalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const command = terminalInput.value.trim();
        if (command) {
          // Add command to output
          const commandLine = document.createElement('div');
          commandLine.style.color = '#39FF14';
          commandLine.textContent = `$ ${command}`;
          terminalOutput.appendChild(commandLine);
          
          // Add output (placeholder - will be implemented with actual command execution later)
          const outputLine = document.createElement('div');
          outputLine.style.color = '#cccccc';
          outputLine.textContent = `Command "${command}" executed (terminal functionality coming soon)`;
          terminalOutput.appendChild(outputLine);
          
          // Clear input
          terminalInput.value = '';
          
          // Scroll to bottom
          terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
        e.preventDefault();
      }
    });
  }
}

function zoomIn() {
  if (!activeEditor) return;
  currentZoom = Math.min(currentZoom + 1, 5); // Max zoom level
  const newFontSize = 14 + (currentZoom * 2);
  activeEditor.updateOptions({ fontSize: newFontSize });
  // Apply to all editors
  editors.forEach(editor => {
    editor.updateOptions({ fontSize: newFontSize });
  });
}

function zoomOut() {
  if (!activeEditor) return;
  currentZoom = Math.max(currentZoom - 1, -5); // Min zoom level
  const newFontSize = 14 + (currentZoom * 2);
  activeEditor.updateOptions({ fontSize: newFontSize });
  // Apply to all editors
  editors.forEach(editor => {
    editor.updateOptions({ fontSize: newFontSize });
  });
}

function resetZoom() {
  if (!activeEditor) return;
  currentZoom = 0;
  activeEditor.updateOptions({ fontSize: 14 });
  // Apply to all editors
  editors.forEach(editor => {
    editor.updateOptions({ fontSize: 14 });
  });
}

function toggleWordWrap() {
  if (!activeEditor) return;
  const currentWrap = activeEditor.getOption(monaco.editor.EditorOption.wordWrap);
  const newWrap = currentWrap === 'on' ? 'off' : 'on';
  activeEditor.updateOptions({ wordWrap: newWrap });
  // Apply to all editors
  editors.forEach(editor => {
    editor.updateOptions({ wordWrap: newWrap });
  });
}

function toggleMinimap() {
  if (!activeEditor) return;
  const currentMinimap = activeEditor.getOption(monaco.editor.EditorOption.minimap).enabled;
  const newMinimap = !currentMinimap;
  activeEditor.updateOptions({ minimap: { enabled: newMinimap } });
  // Apply to all editors
  editors.forEach(editor => {
    editor.updateOptions({ minimap: { enabled: newMinimap } });
  });
}

function executeEditorCommand(command) {
  if (!activeEditor) {
    return;
  }
  
  // Focus the editor first
  activeEditor.focus();
  
  // Execute the command
  activeEditor.trigger('keyboard', command, null);
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

// Open file at specific line and column
async function openFileAtLine(filePath, line, column = 1) {
  try {
    // Open the file
    const result = await window.electronAPI.readFile(filePath);
    if (!result.success) {
      console.error('Failed to read file:', result.error);
      return;
    }
    
    // Find or create tab for this file
    let tabInfo = fileTabs.find(t => t.filePath === filePath);
    if (!tabInfo) {
      // Create new tab
      tabInfo = createEditorTab(filePath, result.content);
    } else {
      // Switch to existing tab
      setActiveTab(tabInfo);
    }
    
    // Set cursor position
    if (tabInfo.editor) {
      tabInfo.editor.setPosition({ lineNumber: line, column: column });
      tabInfo.editor.revealLineInCenter(line);
      tabInfo.editor.focus();
    }
  } catch (error) {
    console.error('Failed to open file at line:', error);
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
    // Build system shortcuts
    if (e.ctrlKey && e.shiftKey && e.key === 'B') {
      e.preventDefault();
      if (window.buildSystemAPI && window.buildSystemAPI.runBuild) {
        window.buildSystemAPI.runBuild();
      }
      return;
    }
    
    if (e.ctrlKey && e.shiftKey && e.key === 'K') {
      e.preventDefault();
      if (window.buildSystemAPI && window.buildSystemAPI.cleanBuild) {
        window.buildSystemAPI.cleanBuild();
      }
      return;
    }
    
    if (e.ctrlKey && e.shiftKey && e.key === 'R') {
      e.preventDefault();
      if (window.buildSystemAPI && window.buildSystemAPI.rebuild) {
        window.buildSystemAPI.rebuild();
      }
      return;
    }
    
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      if (window.buildSystemAPI && window.buildSystemAPI.showBuildConfigDialog) {
        window.buildSystemAPI.showBuildConfigDialog();
      }
      return;
    }
    
    // Run shortcuts
    if (e.key === 'F5' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (window.buildSystemAPI && window.buildSystemAPI.buildAndRun) {
        window.buildSystemAPI.buildAndRun();
      }
      return;
    }
    
    if (e.ctrlKey && e.key === 'F5') {
      e.preventDefault();
      if (window.buildSystemAPI && window.buildSystemAPI.runExecutable) {
        window.buildSystemAPI.runExecutable();
      }
      return;
    }
    
    // Cancel build (Ctrl+C when not in editor and build is running)
    if (e.ctrlKey && e.key === 'c' && !e.target.closest('.monaco-editor')) {
      if (window.buildSystemAPI && window.buildSystemAPI.cancelBuild && window.buildSystemAPI.isBuilding) {
        window.buildSystemAPI.cancelBuild();
      }
    }
    
    // File operations
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
    // Edit operations - Monaco handles these natively, but we can add fallbacks
    else if (e.ctrlKey && e.key === 'f' && !e.shiftKey) {
      // Find - Monaco handles this natively
    } else if (e.ctrlKey && e.key === 'h' && !e.shiftKey) {
      // Replace - Monaco handles this natively
    } else if (e.ctrlKey && e.key === 'a' && !e.shiftKey) {
      // Select All - Monaco handles this natively
    }
    // View operations
    else if (e.ctrlKey && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      toggleSidebar();
    } else if (e.ctrlKey && e.key === '=') {
      e.preventDefault();
      zoomIn();
    } else if (e.ctrlKey && e.key === '-' || (e.ctrlKey && e.key === '_')) {
      e.preventDefault();
      zoomOut();
    } else if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      resetZoom();
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