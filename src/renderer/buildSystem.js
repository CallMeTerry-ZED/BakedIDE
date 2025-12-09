// Build System Management
let buildMenuDropdown = null;
let currentBuildConfig = null;
let isBuilding = false;
let buildOutputBuffer = '';
let buildOutputListenerSetup = false;
// PERMANENT storage for build output HTML - never cleared except for new builds
let permanentBuildOutputHTML = '';

// Use the prompt dialog from fileTree.js (or create our own if not available)
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

// Get current project path from fileTree
function getCurrentProjectPath() {
  if (window.fileTreeAPI && window.fileTreeAPI.getCurrentProjectPath) {
    return window.fileTreeAPI.getCurrentProjectPath();
  }
  return null;
}

// Helper to get basename from path
function getBasename(filePath) {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1];
}

// Update build status indicator
function updateBuildStatus() {
  const buildStatus = document.getElementById('build-status');
  if (!buildStatus) return;
  
  if (!currentBuildConfig || currentBuildConfig.buildSystem === 'none') {
    buildStatus.textContent = '';
    buildStatus.style.cursor = 'default';
    return;
  }
  
  const systemName = currentBuildConfig.buildSystem.charAt(0).toUpperCase() + currentBuildConfig.buildSystem.slice(1);
  const config = currentBuildConfig.configuration || '';
  buildStatus.textContent = `${systemName}${config ? ' | ' + config : ''}`;
  buildStatus.style.cursor = 'pointer';
  buildStatus.style.color = isBuilding ? '#39FF14' : '#858585';
  
  // Add click handler to open config dialog
  buildStatus.onclick = () => {
    showBuildConfigDialog();
  };
}

// Show build menu
function showBuildMenu(menuElement) {
  hideBuildMenu();
  
  buildMenuDropdown = document.createElement('div');
  buildMenuDropdown.id = 'build-menu-dropdown';
  buildMenuDropdown.style.cssText = `
    position: absolute;
    background-color: #2d2d30;
    border: 1px solid #3e3e42;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    z-index: 10000;
    min-width: 200px;
    padding: 4px 0;
  `;
  
  buildMenuDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  const projectPath = getCurrentProjectPath();
  const hasConfig = currentBuildConfig && currentBuildConfig.buildSystem !== 'none';
  
  const menuItems = [
    { label: 'Run Build', action: () => { runBuild(); hideBuildMenu(); }, shortcut: 'Ctrl+Shift+B', enabled: () => hasConfig && !isBuilding },
    { label: 'Clean Build', action: () => { cleanBuild(); hideBuildMenu(); }, shortcut: 'Ctrl+Shift+K', enabled: () => hasConfig && !isBuilding },
    { label: 'Rebuild', action: () => { rebuild(); hideBuildMenu(); }, shortcut: 'Ctrl+Shift+R', enabled: () => hasConfig && !isBuilding },
    { label: 'Configure', action: () => { configureBuild(); hideBuildMenu(); }, shortcut: 'Ctrl+Shift+C', enabled: () => hasConfig && !isBuilding },
    { label: '---' },
    { label: 'Run', action: () => { runExecutable(); hideBuildMenu(); }, shortcut: 'Ctrl+F5', enabled: () => hasConfig && !isBuilding },
    { label: 'Build and Run', action: () => { buildAndRun(); hideBuildMenu(); }, shortcut: 'F5', enabled: () => hasConfig && !isBuilding },
    { label: '---' },
    { label: 'Cancel Build', action: () => { cancelBuild(); hideBuildMenu(); }, shortcut: 'Ctrl+Break', enabled: () => isBuilding },
    { label: '---' },
    { label: 'Configuration: Debug', action: () => { setConfiguration('Debug'); hideBuildMenu(); }, shortcut: '', enabled: () => hasConfig && currentBuildConfig.buildSystem === 'cmake', checked: () => currentBuildConfig && currentBuildConfig.configuration === 'Debug' },
    { label: 'Configuration: Release', action: () => { setConfiguration('Release'); hideBuildMenu(); }, shortcut: '', enabled: () => hasConfig && currentBuildConfig.buildSystem === 'cmake', checked: () => currentBuildConfig && currentBuildConfig.configuration === 'Release' },
    { label: '---' },
    { label: 'Configure Build System...', action: () => { showBuildConfigDialog(); hideBuildMenu(); }, shortcut: '' },
  ];
  
  menuItems.forEach(item => {
    if (item.label === '---') {
      const separator = document.createElement('div');
      separator.style.cssText = 'height: 1px; background-color: #3e3e42; margin: 4px 0;';
      buildMenuDropdown.appendChild(separator);
    } else {
      const menuItem = document.createElement('div');
      const isEnabled = item.enabled ? item.enabled() : true;
      const isChecked = item.checked ? item.checked() : false;
      
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
      } else if (isChecked) {
        const checkmark = document.createElement('span');
        checkmark.textContent = '✓';
        checkmark.style.cssText = 'color: #007acc; font-size: 12px; margin-left: 20px;';
        menuItem.appendChild(checkmark);
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
      
      buildMenuDropdown.appendChild(menuItem);
    }
  });
  
  const rect = menuElement.getBoundingClientRect();
  buildMenuDropdown.style.top = `${rect.bottom + 2}px`;
  buildMenuDropdown.style.left = `${rect.left}px`;
  
  document.body.appendChild(buildMenuDropdown);
}

function hideBuildMenu() {
  if (buildMenuDropdown) {
    buildMenuDropdown.remove();
    buildMenuDropdown = null;
  }
}

// Load build config for current project
async function loadBuildConfig() {
  const projectPath = getCurrentProjectPath();
  if (!projectPath) {
    currentBuildConfig = null;
    updateBuildStatus();
    return;
  }
  
  try {
    const result = await window.electronAPI.getBuildConfig(projectPath);
    if (result.success) {
      currentBuildConfig = {
        projectPath: projectPath,
        ...result.config
      };
      
      // Check if CMake generator is valid (only fix if it's actually broken)
      if (currentBuildConfig.buildSystem === 'cmake') {
        if (!currentBuildConfig.cmakeGenerator) {
          // Default to Unix Makefiles if not set
          currentBuildConfig.cmakeGenerator = 'Unix Makefiles';
          await saveBuildConfig(projectPath, currentBuildConfig);
        }
        // Don't force change if user has explicitly set Ninja - let them try it
        // The build will fail with a clear error if Ninja isn't installed
      }
      
      updateBuildStatus();
    }
  } catch (error) {
    console.error('Failed to load build config:', error);
    currentBuildConfig = null;
    updateBuildStatus();
  }
}

// Detect build systems in project
async function detectBuildSystems(projectPath) {
  try {
    const result = await window.electronAPI.detectBuildSystem(projectPath);
    if (result.success) {
      return result;
    }
    return { success: false, error: 'Failed to detect build systems' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Show build configuration dialog
async function showBuildConfigDialog() {
  const projectPath = getCurrentProjectPath();
  if (!projectPath) {
    alert('Please open a folder first');
    return;
  }
  
  // Detect build systems
  const detection = await detectBuildSystems(projectPath);
  if (!detection.success) {
    alert('Failed to detect build systems: ' + detection.error);
    return;
  }
  
  // If multiple build files found, ask user to select
  let selectedBuildFile = null;
  let buildSystem = 'none';
  
  const allFiles = [
    ...detection.detected.cmake.map(f => ({ path: f, system: 'cmake', name: 'CMakeLists.txt' })),
    ...detection.detected.premake.map(f => ({ path: f, system: 'premake', name: getBasename(f) })),
    ...detection.detected.make.map(f => ({ path: f, system: 'make', name: 'Makefile' }))
  ];
  
  if (allFiles.length === 0) {
    // No build files found, allow manual selection
    buildSystem = await showBuildSystemSelector(['none', 'cmake', 'premake', 'make']);
    if (!buildSystem || buildSystem === 'none') {
      // Save none config
      await saveBuildConfig(projectPath, {
        buildSystem: 'none',
        buildSystemFile: null,
        buildDirectory: 'build',
        configuration: 'Debug',
        cmakeGenerator: 'Unix Makefiles',
        premakeAction: 'gmake2'
      });
      await loadBuildConfig();
      return;
    }
  } else if (allFiles.length === 1) {
    // Single build file found
    selectedBuildFile = allFiles[0].path;
    buildSystem = allFiles[0].system;
  } else {
    // Multiple build files found - ask user to select
    const selected = await showBuildFileSelector(allFiles);
    if (!selected) return;
    selectedBuildFile = selected.path;
    buildSystem = selected.system;
  }
  
  // Load current config
  const configResult = await window.electronAPI.getBuildConfig(projectPath);
  const currentConfig = configResult.success ? configResult.config : {
    buildSystem: 'none',
    buildSystemFile: null,
    buildDirectory: 'build',
    configuration: 'Debug',
    cmakeGenerator: 'Unix Makefiles',
    premakeAction: 'gmake2'
  };
  
  // Show configuration dialog
  const config = await showBuildConfigForm(buildSystem, currentConfig, selectedBuildFile);
  if (config) {
    await saveBuildConfig(projectPath, config);
    await loadBuildConfig();
  }
}

// Helper function to show build system selector
function showBuildSystemSelector(options) {
  return new Promise(async (resolve) => {
    // Use custom prompt dialog
    const optionsText = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
    const selected = await showPromptDialog(`Select build system:\n${optionsText}\n\nEnter number:`, '1');
    if (selected && parseInt(selected) > 0 && parseInt(selected) <= options.length) {
      resolve(options[parseInt(selected) - 1]);
    } else {
      resolve(null);
    }
  });
}

// Helper function to show build file selector
function showBuildFileSelector(files) {
  return new Promise(async (resolve) => {
    const fileList = files.map((f, i) => `${i + 1}. ${f.name} (${f.system}) - ${f.path}`).join('\n');
    const selected = await showPromptDialog(`Multiple build files detected. Select one:\n\n${fileList}\n\nEnter number:`, '1');
    if (selected && parseInt(selected) > 0 && parseInt(selected) <= files.length) {
      resolve(files[parseInt(selected) - 1]);
    } else {
      resolve(null);
    }
  });
}

// Helper function to show build config form
function showBuildConfigForm(buildSystem, currentConfig, buildFile) {
  return new Promise(async (resolve) => {
    // Use custom prompt dialog
    const buildDir = await showPromptDialog('Build directory:', currentConfig.buildDirectory || 'build');
    if (!buildDir) {
      resolve(null);
      return;
    }
    
    let config = {
      buildSystem: buildSystem,
      buildSystemFile: buildFile,
      buildDirectory: buildDir,
      configuration: currentConfig.configuration || 'Debug',
      cmakeGenerator: currentConfig.cmakeGenerator || 'Unix Makefiles',
      premakeAction: currentConfig.premakeAction || 'gmake2'
    };
    
    // Ensure CMake generator defaults to Unix Makefiles if not set
    if (buildSystem === 'cmake' && !config.cmakeGenerator) {
      config.cmakeGenerator = 'Unix Makefiles';
    }
    
    if (buildSystem === 'cmake') {
      // Check available generators
      const generatorsResult = await window.electronAPI.checkCmakeGenerators();
      let generatorOptions = 'Unix Makefiles, Ninja';
      if (generatorsResult.success && generatorsResult.generators) {
        const available = [];
        if (generatorsResult.generators['Unix Makefiles']) available.push('Unix Makefiles');
        if (generatorsResult.generators['Ninja']) available.push('Ninja');
        if (available.length > 0) {
          generatorOptions = available.join(', ');
        }
      }
      
      const cmakeGen = await showPromptDialog(`CMake Generator (${generatorOptions}):`, config.cmakeGenerator || 'Unix Makefiles');
      if (cmakeGen) {
        config.cmakeGenerator = cmakeGen;
      } else {
        // Default to Unix Makefiles if user cancels
        config.cmakeGenerator = 'Unix Makefiles';
      }
    } else if (buildSystem === 'premake') {
      const premakeAction = await showPromptDialog('Premake Action (gmake2, vs2022, etc.):', config.premakeAction);
      if (premakeAction) {
        config.premakeAction = premakeAction;
      }
    }
    
    resolve(config);
  });
}

// Save build config
async function saveBuildConfig(projectPath, config) {
  try {
    const result = await window.electronAPI.saveBuildConfig(projectPath, config);
    return result.success;
  } catch (error) {
    console.error('Failed to save build config:', error);
    return false;
  }
}

// Run build
async function runBuild() {
  if (!currentBuildConfig || currentBuildConfig.buildSystem === 'none') {
    alert('No build system configured. Please configure a build system first.');
    return;
  }
  
  if (isBuilding) {
    alert('Build already in progress');
    return;
  }
  
  const projectPath = getCurrentProjectPath();
  if (!projectPath) {
    alert('No project folder open');
    return;
  }
  
  // Switch to Build Output tab
  switchToBuildOutputTab();
  clearBuildOutput();
  
  // Wait a bit for the panel and tab to be fully visible
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Ensure build output element is accessible
  const buildOutput = document.getElementById('build-output-text');
  if (!buildOutput) {
    console.error('Build output element not found after switching tabs!');
    // Try switching again
    switchToBuildOutputTab();
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  isBuilding = true;
  updateBuildStatus();
  addBuildOutput('Starting build...\n', 'info');
  console.log('Starting build, currentBuildConfig:', currentBuildConfig);
  
  // Auto-configure if needed (for CMake and Premake)
  // Only configure if build directory doesn't exist or CMakeCache.txt doesn't exist
  if (currentBuildConfig.buildSystem === 'cmake') {
    const buildDir = currentBuildConfig.buildDirectory || 'build';
    const projectPath = getCurrentProjectPath();
    const buildPath = projectPath + (projectPath.includes('\\') ? '\\' : '/') + buildDir;
    const cachePath = buildPath + (buildPath.includes('\\') ? '\\' : '/') + 'CMakeCache.txt';
    
    // Check if we need to configure (simplified - in real implementation, we'd check file existence via IPC)
    // For now, always try to configure first, but don't fail if it's already configured
    addBuildOutput('Configuring build system...\n', 'info');
    const configResult = await executeBuild('configure');
    if (!configResult.success) {
      // Configuration might have failed because it's already configured, try building anyway
      addBuildOutput(`Configuration warning: ${configResult.error || 'Unknown error'}\n`, 'warning');
      addBuildOutput('Attempting to build anyway...\n', 'info');
    }
  } else if (currentBuildConfig.buildSystem === 'premake') {
    addBuildOutput('Configuring build system...\n', 'info');
    const configResult = await executeBuild('configure');
    if (!configResult.success) {
      addBuildOutput(`Configuration failed: ${configResult.error || 'Unknown error'}\n`, 'error');
      isBuilding = false;
      updateBuildStatus();
      return;
    }
  }
  
  // Execute build
  addBuildOutput('Building project...\n', 'info');
  const result = await executeBuild('build');
  
  isBuilding = false;
  updateBuildStatus();
  
  if (result.success) {
    addBuildOutput('\n✓ Build succeeded!\n', 'success');
    // Refresh file tree to show build output
    if (window.fileTreeAPI && window.fileTreeAPI.refreshFileTree) {
      setTimeout(() => window.fileTreeAPI.refreshFileTree(), 500);
    }
  } else {
    addBuildOutput(`\n✗ Build failed with exit code ${result.exitCode}\n`, 'error');
    if (result.stderr) {
      addBuildOutput(`Error details: ${result.stderr}\n`, 'error');
    }
  }
}

// Clean build
async function cleanBuild() {
  if (!currentBuildConfig || currentBuildConfig.buildSystem === 'none') {
    alert('No build system configured');
    return;
  }
  
  if (isBuilding) {
    alert('Build in progress');
    return;
  }
  
  const projectPath = getCurrentProjectPath();
  if (!projectPath) {
    alert('No project folder open');
    return;
  }
  
  switchToBuildOutputTab();
  clearBuildOutput();
  
  isBuilding = true;
  updateBuildStatus();
  addBuildOutput('Cleaning build...\n', 'info');
  
  const result = await executeBuild('clean');
  
  isBuilding = false;
  updateBuildStatus();
  
  if (result.success) {
    addBuildOutput('\n✓ Clean succeeded!\n', 'success');
  } else {
    addBuildOutput(`\n✗ Clean failed\n`, 'error');
  }
}

// Rebuild (clean + build)
async function rebuild() {
  await cleanBuild();
  if (!isBuilding) {
    await runBuild();
  }
}

// Configure build
async function configureBuild() {
  if (!currentBuildConfig || currentBuildConfig.buildSystem === 'none') {
    alert('No build system configured');
    return;
  }
  
  if (isBuilding) {
    alert('Build in progress');
    return;
  }
  
  const projectPath = getCurrentProjectPath();
  if (!projectPath) {
    alert('No project folder open');
    return;
  }
  
  switchToBuildOutputTab();
  clearBuildOutput();
  
  isBuilding = true;
  updateBuildStatus();
  addBuildOutput('Configuring build system...\n', 'info');
  
  const result = await executeBuild('configure');
  
  isBuilding = false;
  updateBuildStatus();
  
  if (result.success) {
    addBuildOutput('\n✓ Configuration succeeded!\n', 'success');
  } else {
    addBuildOutput(`\n✗ Configuration failed: ${result.error || 'Unknown error'}\n`, 'error');
  }
}

// Cancel build
async function cancelBuild() {
  if (!isBuilding) {
    return;
  }
  
  try {
    await window.electronAPI.cancelBuild();
    addBuildOutput('\n\nBuild cancelled by user\n', 'warning');
    isBuilding = false;
    updateBuildStatus();
  } catch (error) {
    console.error('Failed to cancel build:', error);
  }
}

// Run executable
async function runExecutable() {
  if (!currentBuildConfig || currentBuildConfig.buildSystem === 'none') {
    alert('No build system configured');
    return;
  }
  
  if (isBuilding) {
    alert('Build in progress');
    return;
  }
  
  const projectPath = getCurrentProjectPath();
  if (!projectPath) {
    alert('No project folder open');
    return;
  }
  
  // Get executable path - either configured or auto-detect
  let executablePath = currentBuildConfig.executablePath;
  
  if (!executablePath) {
    // Try to auto-detect executable
    const detected = await window.electronAPI.detectExecutable(projectPath, currentBuildConfig);
    if (detected.success && detected.executable) {
      executablePath = detected.executable;
      addBuildOutput(`Auto-detected executable: ${executablePath}\n`, 'info');
    } else {
      // Ask user to configure
      const userPath = await showPromptDialog('Enter executable path (relative to project):', 'build/bin/myprogram');
      if (!userPath) {
        return;
      }
      executablePath = userPath;
      // Save for future use
      currentBuildConfig.executablePath = executablePath;
      await saveBuildConfig(projectPath, currentBuildConfig);
    }
  }
  
  switchToBuildOutputTab();
  addBuildOutput('\n' + '─'.repeat(50) + '\n', 'info');
  addBuildOutput(`Running: ${executablePath}\n`, 'info');
  addBuildOutput('─'.repeat(50) + '\n\n', 'info');
  
  isBuilding = true;
  updateBuildStatus();
  
  try {
    const result = await window.electronAPI.runExecutable(projectPath, executablePath);
    
    isBuilding = false;
    updateBuildStatus();
    
    if (result.success) {
      addBuildOutput(`\n\n✓ Program exited with code ${result.exitCode}\n`, result.exitCode === 0 ? 'success' : 'warning');
    } else {
      addBuildOutput(`\n✗ Failed to run: ${result.error}\n`, 'error');
    }
  } catch (error) {
    isBuilding = false;
    updateBuildStatus();
    addBuildOutput(`\n✗ Error: ${error.message}\n`, 'error');
  }
}

// Build and run
async function buildAndRun() {
  if (!currentBuildConfig || currentBuildConfig.buildSystem === 'none') {
    alert('No build system configured');
    return;
  }
  
  if (isBuilding) {
    alert('Build in progress');
    return;
  }
  
  // First build
  await runBuild();
  
  // Check if build succeeded (isBuilding will be false after build completes)
  // We need to wait a moment and check the last build output
  setTimeout(async () => {
    const buildOutput = document.getElementById('build-output-text');
    if (buildOutput && buildOutput.innerHTML.includes('Build succeeded')) {
      await runExecutable();
    }
  }, 100);
}

// Set configuration (Debug/Release)
async function setConfiguration(config) {
  if (!currentBuildConfig || currentBuildConfig.buildSystem !== 'cmake') {
    return;
  }
  
  currentBuildConfig.configuration = config;
  await saveBuildConfig(currentBuildConfig.projectPath, currentBuildConfig);
  updateBuildStatus();
}

// Set up build output listener (call once at initialization)
function setupBuildOutputListener() {
  if (buildOutputListenerSetup) return;
  
  window.electronAPI.onBuildOutput((event, data) => {
    console.log('Build output received:', event, data);
    if (data) {
      // Handle both formats: {type: 'stderr', data: '...'} and direct data
      const outputText = data.data || data;
      const outputType = data.type === 'stderr' ? 'error' : (data.type === 'stdout' ? 'info' : 'info');
      if (outputText && typeof outputText === 'string') {
        console.log('Adding build output:', outputText.substring(0, 50) + '...');
        addBuildOutput(outputText, outputType);
      } else {
        console.warn('Invalid build output data:', data);
      }
    }
  });
  
  buildOutputListenerSetup = true;
  console.log('Build output listener set up');
}

// Execute build command
async function executeBuild(action) {
  const projectPath = getCurrentProjectPath();
  if (!projectPath || !currentBuildConfig) {
    return { success: false, error: 'No project or config' };
  }
  
  // Ensure listener is set up
  setupBuildOutputListener();
  
  try {
    const result = await window.electronAPI.executeBuild(projectPath, currentBuildConfig, action);
    return result;
  } catch (error) {
    console.error('Build execution error:', error);
    return { success: false, error: error.message };
  }
}

// Switch to Build Output tab
function switchToBuildOutputTab() {
  // Show bottom panel if hidden
  const bottomPanel = document.getElementById('bottom-panel');
  if (bottomPanel && !bottomPanel.classList.contains('visible')) {
    if (window.toggleBottomPanel) {
      window.toggleBottomPanel();
    }
  }
  
  // Manually switch tabs to ensure content is preserved
  const buildTab = document.querySelector('.panel-tab[data-tab="build"]');
  const buildContent = document.getElementById('build-output-content');
  const terminalTab = document.querySelector('.panel-tab[data-tab="terminal"]');
  
  if (buildTab && buildContent) {
    // Preserve build output content before switching
    const buildOutput = document.getElementById('build-output-text');
    const preservedContent = buildOutput ? buildOutput.innerHTML : null;
    
    // Remove active from all tabs
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    buildTab.classList.add('active');
    
    // Just toggle the active class - z-index handles visibility
    document.querySelectorAll('.panel-tab-content').forEach(c => {
      c.classList.remove('active');
    });
    buildContent.classList.add('active');
    
    // Restore content if it was somehow lost (shouldn't happen, but safety check)
    if (buildOutput && preservedContent && buildOutput.innerHTML !== preservedContent) {
      console.warn('Build output content was lost during tab switch, restoring...');
      buildOutput.innerHTML = preservedContent;
    }
  }
}

// Clear build output (only called when starting a new build/clean/configure)
function clearBuildOutput() {
  const buildOutput = document.getElementById('build-output-text');
  const backupElement = document.getElementById('build-output-backup');
  if (buildOutput) {
    // Allow clearing by setting the flag
    if (window.allowBuildOutputClear) {
      window.allowBuildOutputClear(true);
    }
    
    // Only clear if we're actually starting a new operation
    // Don't clear when just switching tabs
    // Preserve the element structure, just clear the content
    const currentContent = buildOutput.innerHTML;
    buildOutput.innerHTML = '';
    buildOutputBuffer = '';
    // DON'T clear backup element - it should only be updated, not cleared
    // The backup will be updated when new content is added
    console.log('Build output cleared for new operation. Previous content length:', currentContent.length);
  }
}

// Add build output with color coding
function addBuildOutput(text, type = 'info') {
  if (!text || (typeof text !== 'string')) {
    console.warn('Invalid text passed to addBuildOutput:', text, typeof text);
    return;
  }
  
  if (text.trim() === '') return;
  
  // Ensure Build Output tab is active
  const buildContent = document.getElementById('build-output-content');
  if (buildContent && !buildContent.classList.contains('active')) {
    // Tab is not active, switch to it
    switchToBuildOutputTab();
  }
  
  const buildOutput = document.getElementById('build-output-text');
  if (!buildOutput) {
    console.error('Build output element not found! Available elements:', {
      'build-output-content': document.getElementById('build-output-content'),
      'build-output-text': document.getElementById('build-output-text'),
      'bottom-panel': document.getElementById('bottom-panel'),
      'build-content-active': buildContent ? buildContent.classList.contains('active') : 'N/A'
    });
    // Try to find it again after a short delay
    setTimeout(() => {
      const retryOutput = document.getElementById('build-output-text');
      if (retryOutput) {
        console.log('Found build output element on retry, adding output');
        addBuildOutput(text, type);
      } else {
        console.error('Still could not find build output element');
      }
    }, 100);
    return;
  }
  
  // Check if parent is visible - ensure the tab is active via CSS class
  if (buildContent && !buildContent.classList.contains('active')) {
    // Tab is not active, switch to it (this will handle visibility via CSS classes)
    switchToBuildOutputTab();
  }
  
  console.log('Adding output to element, type:', type, 'text length:', text.length);
  
  buildOutputBuffer += text;
  
  // Parse errors for clickable links
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    // Skip empty lines except for the last one if it's part of a multi-line message
    if (line === '' && index < lines.length - 1) {
      return;
    }
    
    const div = document.createElement('div');
    
    // Error parsing (GCC/Clang format: file:line:column: error: message)
    // Also handle relative paths
    const errorMatch = line.match(/^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/);
    if (errorMatch) {
      const [, file, lineNum, col, severity, message] = errorMatch;
      // Resolve relative paths
      const projectPath = getCurrentProjectPath();
      let fullPath = file;
      if (projectPath && !pathIsAbsolute(file)) {
        // Simple path joining
        const separator = projectPath.includes('\\') ? '\\' : '/';
        fullPath = projectPath + separator + file.replace(/^\.\//, '');
      }
      
      div.innerHTML = `<span style="color: ${severity === 'error' ? '#FF6B6B' : '#FFE66D'}; cursor: pointer; text-decoration: underline;" data-file="${fullPath}" data-line="${lineNum}" data-col="${col}">${line}</span>`;
      const span = div.querySelector('span');
      if (span) {
        span.addEventListener('click', () => {
          openFileAtLine(fullPath, parseInt(lineNum), parseInt(col));
        });
      }
    } else {
      // Regular output
      let color = '#cccccc';
      if (type === 'error') color = '#FF6B6B';
      else if (type === 'success') color = '#39FF14';
      else if (type === 'warning') color = '#FFE66D';
      else if (type === 'info') color = '#00F5FF';
      
      div.style.color = color;
      div.textContent = line || ' '; // Use space for empty lines to maintain spacing
    }
    
    buildOutput.appendChild(div);
  });
  
  // Auto-scroll to bottom
  buildOutput.scrollTop = buildOutput.scrollHeight;
  
  // ALWAYS update permanent storage with current content - do this EVERY time content is added
  // Build the HTML from all child nodes to get the complete content
  let fullHTML = '';
  for (let i = 0; i < buildOutput.children.length; i++) {
    const child = buildOutput.children[i];
    fullHTML += child.outerHTML;
  }
  permanentBuildOutputHTML = fullHTML;
  
  console.log('Updated permanent storage, length:', permanentBuildOutputHTML.length, 'children:', buildOutput.children.length, 'first 50:', permanentBuildOutputHTML.substring(0, 50));
  
  // Also update the backup element with current content
  const backupElement = document.getElementById('build-output-backup');
  if (backupElement) {
    backupElement.innerHTML = permanentBuildOutputHTML;
  }
  
  // Update preserved content in editor.js
  if (window.preservedBuildOutputContent !== undefined) {
    window.preservedBuildOutputContent = permanentBuildOutputHTML;
  }
}

// Helper to check if path is absolute
function pathIsAbsolute(filePath) {
  return filePath.startsWith('/') || /^[A-Z]:/.test(filePath);
}

// Open file at specific line
function openFileAtLine(filePath, line, column) {
  // Use editor API to open file
  if (window.editorAPI && window.editorAPI.openFileAtLine) {
    window.editorAPI.openFileAtLine(filePath, line, column || 1);
  } else {
    // Fallback: just open the file
    if (window.editorAPI && window.editorAPI.openFile) {
      window.editorAPI.openFile(filePath).then(() => {
        // Try to set cursor position
        if (window.editorAPI && window.editorAPI.setCursorPosition) {
          window.editorAPI.setCursorPosition(line, column || 1);
        }
      });
    }
  }
}

// Expose functions globally
window.buildSystemAPI = {
  showBuildMenu,
  hideBuildMenu,
  loadBuildConfig,
  updateBuildStatus,
  getCurrentConfig: () => currentBuildConfig,
  runBuild,
  cleanBuild,
  rebuild,
  configureBuild,
  cancelBuild,
  runExecutable,
  buildAndRun,
  showBuildConfigDialog,
  isBuilding: () => isBuilding,
  getPermanentBuildOutput: () => permanentBuildOutputHTML,
  setPermanentBuildOutput: (html) => { permanentBuildOutputHTML = html; }
};

// Initialize when project path changes
if (window.fileTreeAPI) {
  const originalOpenFolder = window.fileTreeAPI.openFolder;
  if (originalOpenFolder) {
    window.fileTreeAPI.openFolder = async function(...args) {
      const result = await originalOpenFolder.apply(this, args);
      await loadBuildConfig();
      return result;
    };
  }
}

// Initialize build output listener on startup
setupBuildOutputListener();

// Load config on startup
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(loadBuildConfig, 1000); // Wait for fileTree to initialize
  });
} else {
  setTimeout(loadBuildConfig, 1000);
}

