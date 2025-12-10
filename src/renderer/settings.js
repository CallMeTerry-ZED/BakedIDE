// settings.js - Settings/Preferences management

let currentSettings = null;

// Initialize settings on app load
async function initSettings() {
    const result = await window.electronAPI.loadSettings();
    if (result.success) {
        currentSettings = result.settings;
        applySettings();
    }
    setupSettingsDialog();
}

// Apply settings to the application
function applySettings() {
    if (!currentSettings) return;
    
    // Apply theme first (affects all editors)
    applyTheme();
    
    // Apply to all Monaco editors (editors is a Map)
    if (typeof editors !== 'undefined' && editors instanceof Map) {
        for (const editor of editors.values()) {
            if (editor) {
                applyEditorSettings(editor);
            }
        }
    }
    
    // Also check tabs array for editors
    if (typeof tabs !== 'undefined' && Array.isArray(tabs)) {
        for (const tab of tabs) {
            if (tab && tab.editor) {
                applyEditorSettings(tab.editor);
            }
        }
    }
    
    // Apply terminal settings
    if (window.terminalAPI && window.terminalAPI.terminal) {
        applyTerminalSettings(window.terminalAPI.terminal);
    }
    
    // Apply UI scale - ALWAYS set it, even for 100%
    document.body.style.zoom = currentSettings.appearance.uiScale / 100;
}

// Apply theme to Monaco
function applyTheme() {
    if (!currentSettings || typeof monaco === 'undefined') return;
    
    const themeSetting = currentSettings.appearance.theme;
    
    // Map our theme names to Monaco theme names
    const themeMap = {
        'baked-dark': 'baked-theme',  // Our custom theme
        'vs-dark': 'vs-dark',
        'vs': 'vs',
        'hc-black': 'hc-black'
    };
    
    const monacoTheme = themeMap[themeSetting] || 'baked-theme';
    monaco.editor.setTheme(monacoTheme);
}

// Apply settings to a specific Monaco editor
function applyEditorSettings(editor) {
    if (!currentSettings || !editor) return;
    
    const editorSettings = currentSettings.editor;
    
    try {
        editor.updateOptions({
            fontSize: editorSettings.fontSize,
            fontFamily: editorSettings.fontFamily,
            tabSize: editorSettings.tabSize,
            insertSpaces: editorSettings.insertSpaces,
            wordWrap: editorSettings.wordWrap,
            lineNumbers: editorSettings.lineNumbers,
            minimap: { enabled: editorSettings.minimap },
            cursorBlinking: editorSettings.cursorBlinking,
            cursorStyle: editorSettings.cursorStyle,
            renderWhitespace: editorSettings.renderWhitespace,
            'bracketPairColorization.enabled': editorSettings.bracketPairColorization
        });
        
        // Update model options too
        const model = editor.getModel();
        if (model) {
            model.updateOptions({
                tabSize: editorSettings.tabSize,
                insertSpaces: editorSettings.insertSpaces
            });
        }
    } catch (e) {
        console.error('Error applying editor settings:', e);
    }
}

// Apply settings to terminal
function applyTerminalSettings(terminal) {
    if (!currentSettings || !terminal) return;
    
    const termSettings = currentSettings.terminal;
    
    terminal.options.fontSize = termSettings.fontSize;
    terminal.options.fontFamily = termSettings.fontFamily;
    
    // Refit after font change
    if (window.terminalAPI && window.terminalAPI.fit) {
        window.terminalAPI.fit();
    }
}

// Setup settings dialog
function setupSettingsDialog() {
    const overlay = document.getElementById('settings-overlay');
    const closeBtn = document.getElementById('settings-close');
    const saveBtn = document.getElementById('settings-save');
    const resetBtn = document.getElementById('settings-reset');
    const navItems = document.querySelectorAll('.settings-nav-item');
    
    if (!overlay) return;
    
    // Close dialog
    closeBtn?.addEventListener('click', closeSettings);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSettings();
    });
    
    // Save settings
    saveBtn?.addEventListener('click', saveSettings);
    
    // Reset settings
    resetBtn?.addEventListener('click', resetSettings);
    
    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            
            // Update nav
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            // Update content
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
            document.getElementById(`settings-${section}`)?.classList.add('active');
        });
    });
    
    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
        // Ctrl+, for settings
        if (e.ctrlKey && e.key === ',') {
            e.preventDefault();
            openSettings();
        }
        // Escape to close
        if (e.key === 'Escape' && overlay.classList.contains('visible')) {
            closeSettings();
        }
    });
}

// Open settings dialog
function openSettings() {
    populateSettingsForm();
    document.getElementById('settings-overlay')?.classList.add('visible');
}

// Close settings dialog
function closeSettings() {
    document.getElementById('settings-overlay')?.classList.remove('visible');
}

// Populate form with current settings
function populateSettingsForm() {
    if (!currentSettings) return;
    
    const editor = currentSettings.editor;
    const appearance = currentSettings.appearance;
    const files = currentSettings.files;
    const terminal = currentSettings.terminal;
    
    // Editor settings
    setInputValue('setting-fontSize', editor.fontSize);
    setInputValue('setting-fontFamily', editor.fontFamily);
    setInputValue('setting-tabSize', editor.tabSize);
    setInputValue('setting-insertSpaces', editor.insertSpaces);
    setInputValue('setting-wordWrap', editor.wordWrap);
    setInputValue('setting-lineNumbers', editor.lineNumbers);
    setInputValue('setting-minimap', editor.minimap);
    setInputValue('setting-cursorStyle', editor.cursorStyle);
    setInputValue('setting-renderWhitespace', editor.renderWhitespace);
    setInputValue('setting-bracketPairColorization', editor.bracketPairColorization);
    
    // Appearance settings
    setInputValue('setting-theme', appearance.theme);
    setInputValue('setting-uiScale', appearance.uiScale);
    
    // Files settings
    setInputValue('setting-autoSave', files.autoSave);
    setInputValue('setting-autoSaveDelay', files.autoSaveDelay);
    setInputValue('setting-trimTrailingWhitespace', files.trimTrailingWhitespace);
    setInputValue('setting-insertFinalNewline', files.insertFinalNewline);
    
    // Terminal settings
    setInputValue('setting-terminalFontSize', terminal.fontSize);
    setInputValue('setting-terminalFontFamily', terminal.fontFamily);
}

// Helper to set input values
function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (el.type === 'checkbox') {
        el.checked = value;
    } else {
        el.value = value;
    }
}

// Helper to get input values
function getInputValue(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    
    if (el.type === 'checkbox') {
        return el.checked;
    } else if (el.type === 'number') {
        return parseInt(el.value, 10);
    } else {
        return el.value;
    }
}

// Save settings
async function saveSettings() {
    const newSettings = {
        editor: {
            fontSize: getInputValue('setting-fontSize'),
            fontFamily: getInputValue('setting-fontFamily'),
            tabSize: parseInt(getInputValue('setting-tabSize'), 10),
            insertSpaces: getInputValue('setting-insertSpaces'),
            wordWrap: getInputValue('setting-wordWrap'),
            lineNumbers: getInputValue('setting-lineNumbers'),
            minimap: getInputValue('setting-minimap'),
            cursorBlinking: 'blink',
            cursorStyle: getInputValue('setting-cursorStyle'),
            renderWhitespace: getInputValue('setting-renderWhitespace'),
            bracketPairColorization: getInputValue('setting-bracketPairColorization')
        },
        appearance: {
            theme: getInputValue('setting-theme'),
            uiScale: parseInt(getInputValue('setting-uiScale'), 10)
        },
        files: {
            autoSave: getInputValue('setting-autoSave'),
            autoSaveDelay: getInputValue('setting-autoSaveDelay'),
            trimTrailingWhitespace: getInputValue('setting-trimTrailingWhitespace'),
            insertFinalNewline: getInputValue('setting-insertFinalNewline')
        },
        terminal: {
            fontSize: getInputValue('setting-terminalFontSize'),
            fontFamily: getInputValue('setting-terminalFontFamily')
        }
    };
    
    const result = await window.electronAPI.saveSettings(newSettings);
    
    if (result.success) {
        currentSettings = newSettings;
        applySettings();
        closeSettings();
        showNotification('Settings saved successfully');
    } else {
        showNotification('Failed to save settings', 'error');
    }
}

// Reset settings to defaults
async function resetSettings() {
    if (!confirm('Reset all settings to defaults?')) return;
    
    const result = await window.electronAPI.resetSettings();
    
    if (result.success) {
        currentSettings = result.settings;
        populateSettingsForm();
        applySettings();
        showNotification('Settings reset to defaults');
    }
}

// Simple notification
function showNotification(message, type = 'success') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background-color: ${type === 'error' ? '#c24038' : '#2ea043'};
        color: white;
        border-radius: 6px;
        font-size: 13px;
        z-index: 10004;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 2500);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Get current settings (for external use)
function getSettings() {
    return currentSettings;
}

// Export for global access
window.settingsAPI = {
    init: initSettings,
    open: openSettings,
    close: closeSettings,
    apply: applySettings,
    applyToEditor: applyEditorSettings,
    getSettings: getSettings
};

