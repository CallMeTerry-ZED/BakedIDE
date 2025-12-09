// Terminal module - uses xterm.js with node-pty for real terminal emulation

let term = null;
let fitAddon = null;
let terminalInitialized = false;
let firstTimeOpened = true;

// Initialize the terminal
async function initTerminal() {
    if (terminalInitialized) return;
    
    const container = document.getElementById('terminal-xterm');
    if (!container) {
        console.error('Terminal container not found');
        return;
    }
    
    // Check if Terminal is available (loaded via script tag)
    if (typeof Terminal === 'undefined') {
        console.error('xterm.js Terminal not loaded');
        container.innerHTML = '<div style="padding: 10px; color: #f44;">Terminal library not available</div>';
        return;
    }
    
    try {
        // Create terminal instance
        term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#d4d4d4',
                cursorAccent: '#1e1e1e',
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#ffffff'
            },
            allowTransparency: false,
            scrollback: 10000
        });
        
        // Create fit addon if available
        if (typeof FitAddon !== 'undefined') {
            fitAddon = new FitAddon.FitAddon();
            term.loadAddon(fitAddon);
        }
        
        // Open terminal in container
        term.open(container);
        
        // Fit to container - call multiple times to ensure proper sizing
        if (fitAddon) {
            // Initial fit
            fitAddon.fit();
            // Fit again after a short delay
            setTimeout(() => {
                fitAddon.fit();
                window.electronAPI.terminalResize(term.cols, term.rows);
            }, 100);
            // And again after layout settles
            setTimeout(() => {
                fitAddon.fit();
                window.electronAPI.terminalResize(term.cols, term.rows);
            }, 500);
        }
        
        // Set up event listeners for terminal data from main process (PTY output)
        window.electronAPI.onTerminalData((data) => {
            if (term) {
                term.write(data);
            }
        });
        
        window.electronAPI.onTerminalExit((exitData) => {
            if (term) {
                term.write(`\r\n\x1b[33m[Shell exited with code ${exitData.exitCode}]\x1b[0m\r\n`);
                // Restart shell after a short delay
                setTimeout(() => {
                    startShell();
                }, 1000);
            }
        });
        
        // Handle terminal input - send directly to PTY
        term.onData((data) => {
            window.electronAPI.terminalWrite(data);
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            fitTerminal();
        });
        
        terminalInitialized = true;
        
        // Start the shell
        await startShell();
        
    } catch (error) {
        console.error('Failed to initialize terminal:', error);
        container.innerHTML = `<div style="padding: 10px; color: #f44;">Failed to initialize terminal: ${error.message}</div>`;
    }
}

// Start the shell process
async function startShell() {
    if (!term) return;
    
    // Get the current project path if available
    let cwd = null;
    if (window.currentProjectPath) {
        cwd = window.currentProjectPath;
    }
    
    const result = await window.electronAPI.terminalCreate(cwd);
    if (!result.success) {
        term.write(`\x1b[31mFailed to start shell: ${result.error}\x1b[0m\r\n`);
    }
}

// Fit terminal to container and notify PTY of new size
function fitTerminal() {
    if (fitAddon && term) {
        // Clear on first time opening the terminal tab
        if (firstTimeOpened) {
            firstTimeOpened = false;
            term.clear();
        }
        
        // Use multiple animation frames to ensure container has settled
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                try {
                    fitAddon.fit();
                    // Notify PTY of new size
                    window.electronAPI.terminalResize(term.cols, term.rows);
                } catch (e) {
                    console.warn('Terminal fit error:', e);
                }
            });
        });
    }
}

// Focus the terminal
function focusTerminal() {
    if (term) {
        term.focus();
    }
}

// Expose terminal API globally
window.terminalAPI = {
    init: initTerminal,
    fit: fitTerminal,
    focus: focusTerminal,
    write: (data) => term && term.write(data),
    clear: () => term && term.clear()
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Delay initialization slightly to ensure xterm.js is fully ready
    setTimeout(() => {
        initTerminal();
    }, 200);
});
