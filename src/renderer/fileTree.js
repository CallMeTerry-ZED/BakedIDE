let currentProjectPath = null;
let fileTreeData = new Map();

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'build',
  'dist',
  'out',
  '.vscode',
  '.idea',
  '*.o',
  '*.obj',
  '*.exe',
  '*.dll',
  '*.so',
  '*.a',
  '*.lib'
];

function shouldIgnore(name) {
  return IGNORE_PATTERNS.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(name);
    }
    return name === pattern || name.startsWith(pattern + '/');
  });
}

async function openFolder() {
  const result = await window.electronAPI.openFolder();
  
  if (result && result.success) {
    currentProjectPath = result.folderPath;
    await loadFileTree(result.folderPath);
    document.getElementById('file-tree-sidebar').classList.add('visible');
  }
}

function getBasename(filePath) {
  return filePath.split(/[/\\]/).pop() || filePath;
}

function getDirname(filePath) {
  const parts = filePath.split(/[/\\]/);
  parts.pop();
  return parts.join('/') || '/';
}

async function moveItem(sourcePath, targetPath, isDirectory) {
  const sourceName = getBasename(sourcePath);
  const result = await window.electronAPI.moveItem(sourcePath, targetPath, sourceName, isDirectory);
  if (result.success) {
    await refreshFileTree();
  }
}

async function loadFileTree(rootPath) {
  fileTreeData.clear();
  const treeContainer = document.getElementById('file-tree');
  treeContainer.innerHTML = '';
  
  // Create root folder item
  const rootName = getBasename(rootPath);
  const rootItem = document.createElement('div');
  rootItem.className = 'tree-item folder expanded';
  rootItem.dataset.path = rootPath;
  rootItem.style.width = '100%';
  
  // Create row container for icon and label
  const rootRow = document.createElement('div');
  rootRow.className = 'tree-item-row';
  rootRow.style.paddingLeft = '8px';
  
  const rootIcon = document.createElement('span');
  rootIcon.className = 'tree-icon';
  rootRow.appendChild(rootIcon);
  
  const rootLabel = document.createElement('span');
  rootLabel.textContent = rootName;
  rootRow.appendChild(rootLabel);
  
  rootItem.appendChild(rootRow);
  
  const rootChildren = document.createElement('div');
  rootChildren.className = 'tree-children';
  rootChildren.style.width = '100%';
  rootChildren.style.display = 'flex';
  rootChildren.style.flexDirection = 'column';
  rootItem.appendChild(rootChildren);
  
  // Make root folder draggable (though typically you wouldn't move the root)
  rootItem.draggable = false; // Root folder shouldn't be moved
  
  // Add drag handlers to root folder for dropping items into it
  rootItem.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    rootItem.classList.add('drag-over');
  });
  
  rootItem.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    // Only remove drag-over if we're leaving the root item entirely
    if (!rootItem.contains(e.relatedTarget)) {
      rootItem.classList.remove('drag-over');
    }
  });
  
  rootItem.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    rootItem.classList.remove('drag-over');
    
    const draggedPath = e.dataTransfer.getData('text/plain');
    if (draggedPath && draggedPath !== rootPath) {
      const draggedItem = fileTreeData.get(draggedPath);
      if (draggedItem) {
        await moveItem(draggedPath, rootPath, draggedItem.isDirectory);
      }
    }
  });
  
  // Manage hover state on the row
  rootRow.addEventListener('mouseenter', (e) => {
    e.stopPropagation();
    rootItem.classList.add('hovering');
  });
  
  rootRow.addEventListener('mouseleave', (e) => {
    e.stopPropagation();
    rootItem.classList.remove('hovering');
  });
  
  // Add click handler to the row, not the whole item
  rootRow.addEventListener('click', async (e) => {
    e.stopPropagation();
    // Don't toggle if clicking on a nested child tree item
    const clickedChild = e.target.closest('.tree-item');
    if (clickedChild && clickedChild !== rootItem && rootItem.contains(clickedChild)) {
      // Clicked on a nested item, don't toggle parent
      return;
    }
    // Toggle expansion
    const isExpanded = rootItem.classList.contains('expanded');
    rootItem.classList.toggle('expanded');
    
    // Update display based on expanded state
    if (rootItem.classList.contains('expanded')) {
      rootChildren.style.display = 'flex';
      if (rootChildren.children.length === 0) {
        await buildTreeItem(rootChildren, rootPath, rootName, 1);
      }
    } else {
      rootChildren.style.display = 'none';
    }
  });
  
  rootRow.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e, rootPath, true);
  });
  
  treeContainer.appendChild(rootItem);
  fileTreeData.set(rootPath, { name: rootName, isDirectory: true });
  
  // Load root folder contents
  await buildTreeItem(rootChildren, rootPath, rootName, 1);
  
  // Add right-click handler for empty space in file tree
  treeContainer.addEventListener('contextmenu', (e) => {
    // Only show context menu if clicking on empty space (not on a tree item)
    if (e.target === treeContainer || e.target.id === 'file-tree') {
      e.preventDefault();
      showContextMenu(e, currentProjectPath, true);
    }
  });
}

async function buildTreeItem(container, itemPath, itemName, depth) {
  const result = await window.electronAPI.readDirectory(itemPath);
  
  if (!result.success) {
    return;
  }
  
  const items = result.items.filter(item => !shouldIgnore(item.name));
  items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
  
  for (const item of items) {
    const treeItem = document.createElement('div');
    treeItem.className = `tree-item ${item.isDirectory ? 'folder' : 'file'}`;
    treeItem.dataset.path = item.path;
    treeItem.style.width = '100%';
    
    // Create row container for icon and label
    const itemRow = document.createElement('div');
    itemRow.className = 'tree-item-row';
    
    // Set indentation based on depth
    const indentPixels = 8 + (depth * 20);
    itemRow.style.paddingLeft = `${indentPixels}px`;
    
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    itemRow.appendChild(icon);
    
    const label = document.createElement('span');
    label.textContent = item.name;
    itemRow.appendChild(label);
    
    treeItem.appendChild(itemRow);
    
    // Make tree items draggable - attach to the row
    itemRow.draggable = true;
    itemRow.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.path);
      treeItem.classList.add('dragging');
    });
    
    itemRow.addEventListener('dragend', (e) => {
      e.stopPropagation();
      treeItem.classList.remove('dragging');
      document.querySelectorAll('.tree-item.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
    });
    
    // Add drag handlers to the tree item itself, not just the row
    treeItem.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const dragOverItem = e.target.closest('.tree-item');
      if (dragOverItem && dragOverItem !== treeItem && dragOverItem.dataset.path !== item.path) {
        dragOverItem.classList.add('drag-over');
      }
    });
    
    treeItem.addEventListener('dragleave', (e) => {
      e.stopPropagation();
      // Only remove drag-over if we're leaving the tree item entirely
      if (!treeItem.contains(e.relatedTarget)) {
        treeItem.classList.remove('drag-over');
      }
    });
    
    treeItem.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      treeItem.classList.remove('drag-over');
      
      const draggedPath = e.dataTransfer.getData('text/plain');
      if (draggedPath && draggedPath !== item.path) {
        const draggedItem = fileTreeData.get(draggedPath);
        if (draggedItem) {
          const targetPath = item.isDirectory ? item.path : getDirname(item.path);
          await moveItem(draggedPath, targetPath, draggedItem.isDirectory);
        }
      }
    });
    
    // Manage hover state on the row
    itemRow.addEventListener('mouseenter', (e) => {
      e.stopPropagation();
      treeItem.classList.add('hovering');
      // Remove hover from parent
      const parent = treeItem.parentElement.closest('.tree-item');
      if (parent) {
        parent.classList.remove('hovering');
      }
    });
    
    itemRow.addEventListener('mouseleave', (e) => {
      e.stopPropagation();
      treeItem.classList.remove('hovering');
    });
    
    if (item.isDirectory) {
      // Ensure folder class is set (in case className didn't work)
      if (!treeItem.classList.contains('folder')) {
        treeItem.classList.add('folder');
      }
      if (treeItem.classList.contains('file')) {
        treeItem.classList.remove('file');
      }
      
      const children = document.createElement('div');
      children.className = 'tree-children';
      children.style.width = '100%';
      treeItem.appendChild(children);
      
      // Add click handler to the row
      itemRow.addEventListener('click', async (e) => {
        e.stopPropagation();
        // Don't toggle if clicking on a nested child tree item
        const clickedChild = e.target.closest('.tree-item');
        if (clickedChild && clickedChild !== treeItem && treeItem.contains(clickedChild)) {
          // Clicked on a nested item, don't toggle parent
          return;
        }
        // Toggle expansion
        const wasExpanded = treeItem.classList.contains('expanded');
        treeItem.classList.toggle('expanded');
        
        // Update display based on expanded state
        if (treeItem.classList.contains('expanded')) {
          children.style.display = 'flex';
          if (children.children.length === 0) {
            await buildTreeItem(children, item.path, item.name, depth + 1);
          }
        } else {
          children.style.display = 'none';
        }
      });
      
      itemRow.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e, item.path, true);
      });
    } else {
      // Ensure file class is set and folder class is removed
      if (!treeItem.classList.contains('file')) {
        treeItem.classList.add('file');
      }
      if (treeItem.classList.contains('folder')) {
        treeItem.classList.remove('folder');
      }
      
      itemRow.addEventListener('click', async (e) => {
        e.stopPropagation();
        // Remove selection from other items
        document.querySelectorAll('.tree-item.selected').forEach(el => {
          el.classList.remove('selected');
        });
        treeItem.classList.add('selected');
        await openFileFromTree(item.path);
      });
      
      itemRow.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e, item.path, false);
      });
    }
    
    container.appendChild(treeItem);
    fileTreeData.set(item.path, { name: item.name, isDirectory: item.isDirectory });
  }
}

async function openFileFromTree(filePath) {
  const result = await window.electronAPI.readFile(filePath);
  
  if (result && result.success) {
    const tabs = window.editorAPI.fileTabs();
    const existingTab = tabs.find(t => t.filePath === filePath);
    if (existingTab && window.editorAPI.setActiveTab) {
      window.editorAPI.setActiveTab(existingTab);
      return;
    }
    
    const fileName = filePath.split(/[/\\]/).pop();
    if (window.editorAPI.createEditorTab) {
      window.editorAPI.createEditorTab(filePath, fileName, result.content);
    }
  }
}

// Context menu
let contextMenu = null;
let contextMenuTarget = null;

function showContextMenu(event, targetPath, isDirectory) {
  // Remove existing context menu
  if (contextMenu) {
    contextMenu.remove();
  }
  
  contextMenuTarget = targetPath;
  const isFolder = isDirectory;
  
  contextMenu = document.createElement('div');
  contextMenu.id = 'context-menu';
  contextMenu.style.position = 'fixed';
  contextMenu.style.left = `${event.clientX}px`;
  contextMenu.style.top = `${event.clientY}px`;
  contextMenu.style.backgroundColor = '#2d2d30';
  contextMenu.style.border = '1px solid #3e3e42';
  contextMenu.style.borderRadius = '4px';
  contextMenu.style.padding = '4px 0';
  contextMenu.style.minWidth = '180px';
  contextMenu.style.zIndex = '10000';
  contextMenu.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
  
  const menuItems = [];
  
  if (isFolder) {
    menuItems.push(
      { label: 'New File', action: () => createNewFileInFolder(targetPath) },
      { label: 'New Folder', action: () => createNewFolderInFolder(targetPath) },
      { label: '---' },
      { label: 'Delete', action: () => deleteItem(targetPath, true) }
    );
  } else {
    menuItems.push(
      { label: 'Delete', action: () => deleteItem(targetPath, false) }
    );
  }
  
  menuItems.forEach(item => {
    if (item.label === '---') {
      const separator = document.createElement('div');
      separator.style.height = '1px';
      separator.style.backgroundColor = '#3e3e42';
      separator.style.margin = '4px 0';
      contextMenu.appendChild(separator);
    } else {
      const menuItem = document.createElement('div');
      menuItem.className = 'context-menu-item';
      menuItem.textContent = item.label;
      menuItem.style.padding = '6px 16px';
      menuItem.style.cursor = 'pointer';
      menuItem.style.fontSize = '13px';
      menuItem.style.color = '#cccccc';
      
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.backgroundColor = '#094771';
      });
      
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.backgroundColor = 'transparent';
      });
      
      menuItem.addEventListener('click', () => {
        item.action();
        hideContextMenu();
      });
      
      contextMenu.appendChild(menuItem);
    }
  });
  
  document.body.appendChild(contextMenu);
  
  // Close context menu when clicking elsewhere
  const closeMenu = (e) => {
    if (contextMenu && !contextMenu.contains(e.target)) {
      hideContextMenu();
      document.removeEventListener('click', closeMenu);
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

function hideContextMenu() {
  if (contextMenu) {
    contextMenu.remove();
    contextMenu = null;
    contextMenuTarget = null;
  }
}

function showPromptDialog(title, defaultValue) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('prompt-dialog');
    const titleEl = document.getElementById('prompt-dialog-title');
    const inputEl = document.getElementById('prompt-dialog-input');
    const okBtn = document.getElementById('prompt-ok');
    const cancelBtn = document.getElementById('prompt-cancel');
    
    titleEl.textContent = title;
    inputEl.value = defaultValue || '';
    dialog.classList.add('visible');
    inputEl.focus();
    inputEl.select();
    
    const cleanup = () => {
      dialog.classList.remove('visible');
      okBtn.removeEventListener('click', okHandler);
      cancelBtn.removeEventListener('click', cancelHandler);
      inputEl.removeEventListener('keydown', keyHandler);
    };
    
    const okHandler = () => {
      const value = inputEl.value.trim();
      cleanup();
      resolve(value || null);
    };
    
    const cancelHandler = () => {
      cleanup();
      resolve(null);
    };
    
    const keyHandler = (e) => {
      if (e.key === 'Enter') {
        okHandler();
      } else if (e.key === 'Escape') {
        cancelHandler();
      }
    };
    
    okBtn.addEventListener('click', okHandler);
    cancelBtn.addEventListener('click', cancelHandler);
    inputEl.addEventListener('keydown', keyHandler);
  });
}

async function createNewFileInFolder(folderPath) {
  const fileName = await showPromptDialog('Enter file name:', 'newfile.txt');
  if (fileName && fileName.trim()) {
    const result = await window.electronAPI.createFile(folderPath, fileName.trim());
    if (result.success) {
      await refreshFileTree();
    }
  }
}

async function createNewFolderInFolder(folderPath) {
  const folderName = await showPromptDialog('Enter folder name:', 'newfolder');
  if (folderName && folderName.trim()) {
    const result = await window.electronAPI.createFolder(folderPath, folderName.trim());
    if (result.success) {
      await refreshFileTree();
    }
  }
}

async function deleteItem(itemPath, isDirectory) {
  const itemName = getBasename(itemPath);
  const itemType = isDirectory ? 'folder' : 'file';
  const confirm = await window.electronAPI.confirmDialog(
    `Delete ${itemType}?`,
    `Are you sure you want to delete "${itemName}"? This action cannot be undone.`
  );
  
  if (confirm) {
    const result = await window.electronAPI.deleteItem(itemPath, isDirectory);
    if (result.success) {
      await refreshFileTree();
    }
  }
}

async function refreshFileTree() {
  if (currentProjectPath) {
    await loadFileTree(currentProjectPath);
  }
}

// Sidebar resize functionality
function setupSidebarResizer() {
  const sidebar = document.getElementById('file-tree-sidebar');
  const resizer = document.getElementById('sidebar-resizer');
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;
  
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const diff = e.clientX - startX;
    const newWidth = startWidth + diff;
    const minWidth = 150;
    const maxWidth = 600;
    
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      sidebar.style.width = `${newWidth}px`;
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// Initialize resize functionality when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupSidebarResizer);
} else {
  setupSidebarResizer();
}

window.fileTreeAPI = {
  openFolder,
  loadFileTree,
  openFileFromTree,
  refreshFileTree
};

