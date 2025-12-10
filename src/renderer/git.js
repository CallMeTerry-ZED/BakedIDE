// Git Integration Module
// Only works on the currently opened root folder if it contains a .git directory

let isGitRepo = false;
let currentBranch = '';
let gitFiles = { staged: [], unstaged: [] };

// Get the currently opened project path
function getProjectPath() {
    if (window.fileTreeAPI && window.fileTreeAPI.getCurrentProjectPath) {
        return window.fileTreeAPI.getCurrentProjectPath();
    }
    return null;
}

// Initialize git when project loads
async function initGit() {
    setupGitEventListeners();
}

function setupGitEventListeners() {
    // Refresh button
    document.getElementById('git-refresh-btn')?.addEventListener('click', refreshGitStatus);
    
    // Pull button
    document.getElementById('git-pull-btn')?.addEventListener('click', gitPull);
    
    // Push button
    document.getElementById('git-push-btn')?.addEventListener('click', gitPush);
    
    // Commit button
    document.getElementById('git-commit-btn')?.addEventListener('click', gitCommit);
    
    // Commit input - enable/disable commit button based on message and staged files
    document.getElementById('git-commit-input')?.addEventListener('input', updateCommitButton);
}

function updateCommitButton() {
    const commitInput = document.getElementById('git-commit-input');
    const commitBtn = document.getElementById('git-commit-btn');
    if (commitInput && commitBtn) {
        const hasMessage = commitInput.value.trim().length > 0;
        const hasStaged = gitFiles.staged.length > 0;
        commitBtn.disabled = !hasMessage || !hasStaged;
    }
}

// Check if opened folder is a git repo
async function checkGitRepo(projectPath) {
    if (!projectPath) {
        showNotRepo();
        return;
    }
    
    const result = await window.electronAPI.gitIsRepo(projectPath);
    isGitRepo = result.success && result.isRepo;
    
    if (isGitRepo) {
        showGitPanel();
        await refreshGitStatus();
    } else {
        showNotRepo();
    }
}

function showNotRepo() {
    isGitRepo = false;
    document.getElementById('git-not-repo').style.display = 'flex';
    document.getElementById('git-panel').style.display = 'none';
}

function showGitPanel() {
    document.getElementById('git-not-repo').style.display = 'none';
    document.getElementById('git-panel').style.display = 'flex';
}

// Refresh git status
async function refreshGitStatus() {
    const projectPath = getProjectPath();
    if (!projectPath || !isGitRepo) return;
    
    // Get branch
    const branchResult = await window.electronAPI.gitBranch(projectPath);
    if (branchResult.success) {
        currentBranch = branchResult.branch;
        document.getElementById('git-branch-name').textContent = currentBranch || 'HEAD';
    }
    
    // Get status
    const statusResult = await window.electronAPI.gitStatus(projectPath);
    if (statusResult.success) {
        gitFiles.staged = statusResult.files.filter(f => f.staged);
        gitFiles.unstaged = statusResult.files.filter(f => !f.staged);
        renderGitFiles();
    }
}

// Render git files in the UI
function renderGitFiles() {
    // Staged files
    const stagedContainer = document.getElementById('git-staged-files');
    document.getElementById('git-staged-count').textContent = gitFiles.staged.length;
    stagedContainer.innerHTML = gitFiles.staged.map(f => createFileRow(f, true)).join('');
    
    // Unstaged files
    const unstagedContainer = document.getElementById('git-unstaged-files');
    document.getElementById('git-unstaged-count').textContent = gitFiles.unstaged.length;
    unstagedContainer.innerHTML = gitFiles.unstaged.map(f => createFileRow(f, false)).join('');
    
    // Add click handlers
    addFileClickHandlers();
    
    // Update commit button state
    updateCommitButton();
}

function createFileRow(file, isStaged) {
    const statusLetter = getStatusLetter(file.status);
    const fileName = file.path.split('/').pop();
    const escapedPath = file.path.replace(/'/g, "\\'");
    
    return `
        <div class="git-file-item" data-path="${escapedPath}" data-staged="${isStaged}">
            <span class="git-file-status ${file.status}">${statusLetter}</span>
            <span class="git-file-name" title="${file.path}">${fileName}</span>
            <div class="git-file-actions">
                ${isStaged 
                    ? '<button class="git-file-action unstage-btn" title="Unstage">−</button>'
                    : '<button class="git-file-action stage-btn" title="Stage">+</button>'}
                ${!isStaged && file.status !== 'untracked' 
                    ? '<button class="git-file-action discard-btn" title="Discard">↩</button>' 
                    : ''}
            </div>
        </div>
    `;
}

function getStatusLetter(status) {
    const letters = { modified: 'M', added: 'A', deleted: 'D', untracked: 'U', renamed: 'R' };
    return letters[status] || '?';
}

function addFileClickHandlers() {
    // Stage buttons
    document.querySelectorAll('.stage-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const filePath = btn.closest('.git-file-item').dataset.path;
            await stageFile(filePath);
        });
    });
    
    // Unstage buttons
    document.querySelectorAll('.unstage-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const filePath = btn.closest('.git-file-item').dataset.path;
            await unstageFile(filePath);
        });
    });
    
    // Discard buttons
    document.querySelectorAll('.discard-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const filePath = btn.closest('.git-file-item').dataset.path;
            if (confirm(`Discard changes to ${filePath}?\nThis cannot be undone.`)) {
                await discardChanges(filePath);
            }
        });
    });
    
    // File click to open
    document.querySelectorAll('.git-file-item').forEach(item => {
        item.addEventListener('click', () => {
            openGitFile(item.dataset.path);
        });
    });
}

// Stage a file
async function stageFile(filePath) {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    
    const result = await window.electronAPI.gitAdd(projectPath, filePath);
    if (result.success) {
        await refreshGitStatus();
    } else {
        alert('Failed to stage file: ' + result.error);
    }
}

// Unstage a file
async function unstageFile(filePath) {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    
    const result = await window.electronAPI.gitUnstage(projectPath, filePath);
    if (result.success) {
        await refreshGitStatus();
    } else {
        alert('Failed to unstage file: ' + result.error);
    }
}

// Discard changes
async function discardChanges(filePath) {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    
    const result = await window.electronAPI.gitDiscard(projectPath, filePath);
    if (result.success) {
        await refreshGitStatus();
    } else {
        alert('Failed to discard changes: ' + result.error);
    }
}

// Commit staged changes
async function gitCommit() {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    
    const commitInput = document.getElementById('git-commit-input');
    const message = commitInput.value.trim();
    
    if (!message) {
        alert('Please enter a commit message');
        return;
    }
    
    if (gitFiles.staged.length === 0) {
        alert('No staged changes to commit');
        return;
    }
    
    const commitBtn = document.getElementById('git-commit-btn');
    commitBtn.disabled = true;
    commitBtn.textContent = 'Committing...';
    
    const result = await window.electronAPI.gitCommit(projectPath, message);
    
    commitBtn.textContent = '✓ Commit';
    
    if (result.success) {
        commitInput.value = '';
        await refreshGitStatus();
        showNotification('Commit successful!');
    } else {
        alert('Commit failed: ' + result.error);
        updateCommitButton();
    }
}

// Push to remote
async function gitPush() {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    
    const pushBtn = document.getElementById('git-push-btn');
    pushBtn.disabled = true;
    pushBtn.textContent = 'Pushing...';
    
    const result = await window.electronAPI.gitPush(projectPath);
    
    pushBtn.disabled = false;
    pushBtn.textContent = '⬆ Push';
    
    if (result.success) {
        showNotification('Push successful!');
    } else {
        alert('Push failed: ' + (result.error || 'Unknown error'));
    }
}

// Pull from remote
async function gitPull() {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    
    const pullBtn = document.getElementById('git-pull-btn');
    pullBtn.disabled = true;
    pullBtn.textContent = 'Pulling...';
    
    const result = await window.electronAPI.gitPull(projectPath);
    
    pullBtn.disabled = false;
    pullBtn.textContent = '⬇ Pull';
    
    if (result.success) {
        showNotification('Pull successful!');
        await refreshGitStatus();
        // Refresh file tree if available
        if (window.fileTreeAPI && window.fileTreeAPI.refresh) {
            window.fileTreeAPI.refresh();
        }
    } else {
        alert('Pull failed: ' + (result.error || 'Unknown error'));
    }
}

// Open a git file in editor
async function openGitFile(filePath) {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    
    const fullPath = projectPath + '/' + filePath;
    
    if (window.editorAPI && window.editorAPI.createEditorTab) {
        try {
            const result = await window.electronAPI.readFile(fullPath);
            if (result.success) {
                const fileName = filePath.split('/').pop();
                window.editorAPI.createEditorTab(fullPath, fileName, result.content);
            }
        } catch (error) {
            console.error('Error opening file:', error);
        }
    }
}

// Show notification in status bar
function showNotification(message) {
    const status = document.getElementById('status-text');
    if (status) {
        const original = status.textContent;
        status.textContent = message;
        setTimeout(() => {
            status.textContent = original;
        }, 3000);
    }
}

// Expose API
window.gitAPI = {
    init: initGit,
    refresh: refreshGitStatus,
    checkRepo: checkGitRepo,
    isRepo: () => isGitRepo
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initGit, 300);
});

// Refresh when switching to git tab
document.addEventListener('DOMContentLoaded', () => {
    const gitTab = document.querySelector('.panel-tab[data-tab="git"]');
    if (gitTab) {
        gitTab.addEventListener('click', () => {
            const projectPath = getProjectPath();
            if (projectPath && isGitRepo) {
                refreshGitStatus();
            } else if (projectPath) {
                checkGitRepo(projectPath);
            }
        });
    }
});

