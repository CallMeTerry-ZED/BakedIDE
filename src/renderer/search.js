// Search functionality - Fuzzy Finder & Find in Files

let allFiles = [];
let fuzzyFinderVisible = false;
let findInFilesVisible = false;
let selectedIndex = 0;
let searchResults = [];

// ==================== FUZZY FINDER (Ctrl+P) ====================

async function showFuzzyFinder() {
    const finder = document.getElementById('fuzzy-finder');
    const input = document.getElementById('fuzzy-finder-input');
    const results = document.getElementById('fuzzy-finder-results');
    
    // Load all files from project
    await loadAllFiles();
    
    // Reset state
    input.value = '';
    results.innerHTML = '';
    selectedIndex = 0;
    searchResults = [];
    
    // Show finder
    finder.classList.add('visible');
    fuzzyFinderVisible = true;
    input.focus();
    
    // Show initial results (recent or all files)
    updateFuzzyResults('');
}

function hideFuzzyFinder() {
    const finder = document.getElementById('fuzzy-finder');
    finder.classList.remove('visible');
    fuzzyFinderVisible = false;
}

async function loadAllFiles() {
    allFiles = [];
    const projectPath = window.fileTreeAPI?.getCurrentProjectPath();
    if (!projectPath) return;
    
    // Recursively get all files
    await collectFiles(projectPath, '');
}

async function collectFiles(dirPath, relativePath) {
    try {
        const result = await window.electronAPI.readDirectory(dirPath);
        if (!result.success) return;
        
        for (const item of result.items) {
            // Skip ignored directories
            if (shouldIgnoreFile(item.name)) continue;
            
            const itemRelPath = relativePath ? `${relativePath}/${item.name}` : item.name;
            
            if (item.isDirectory) {
                await collectFiles(item.path, itemRelPath);
            } else {
                allFiles.push({
                    name: item.name,
                    path: item.path,
                    relativePath: itemRelPath
                });
            }
        }
    } catch (error) {
        console.error('Error collecting files:', error);
    }
}

function shouldIgnoreFile(name) {
    const ignoreList = ['node_modules', '.git', '.vscode', '.idea', '.bakedide'];
    return ignoreList.includes(name) || name.startsWith('.');
}

function fuzzyMatch(query, str) {
    query = query.toLowerCase();
    str = str.toLowerCase();
    
    let queryIdx = 0;
    let strIdx = 0;
    let score = 0;
    let consecutiveBonus = 0;
    let matchPositions = [];
    
    while (queryIdx < query.length && strIdx < str.length) {
        if (query[queryIdx] === str[strIdx]) {
            matchPositions.push(strIdx);
            score += 1 + consecutiveBonus;
            consecutiveBonus += 0.5;
            queryIdx++;
        } else {
            consecutiveBonus = 0;
        }
        strIdx++;
    }
    
    // Did we match all query characters?
    if (queryIdx !== query.length) {
        return { match: false, score: 0, positions: [] };
    }
    
    // Bonus for matching at start
    if (matchPositions[0] === 0) {
        score += 10;
    }
    
    // Bonus for shorter strings (more relevant)
    score += Math.max(0, 20 - str.length);
    
    return { match: true, score, positions: matchPositions };
}

function updateFuzzyResults(query) {
    const resultsDiv = document.getElementById('fuzzy-finder-results');
    
    if (!query) {
        // Show first 20 files when no query
        searchResults = allFiles.slice(0, 20);
    } else {
        // Fuzzy search
        const matches = allFiles
            .map(file => ({
                file,
                ...fuzzyMatch(query, file.name)
            }))
            .filter(m => m.match)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20);
        
        searchResults = matches.map(m => ({ ...m.file, positions: m.positions }));
    }
    
    selectedIndex = 0;
    renderFuzzyResults(query);
}

function renderFuzzyResults(query) {
    const resultsDiv = document.getElementById('fuzzy-finder-results');
    
    if (searchResults.length === 0) {
        resultsDiv.innerHTML = '<div class="fuzzy-no-results">No files found</div>';
        return;
    }
    
    resultsDiv.innerHTML = searchResults.map((file, idx) => {
        const icon = getFileIcon(file.name);
        const highlightedName = highlightMatches(file.name, file.positions || []);
        const selected = idx === selectedIndex ? 'selected' : '';
        
        return `
            <div class="fuzzy-result ${selected}" data-index="${idx}" data-path="${file.path}">
                <span class="fuzzy-result-icon">${icon}</span>
                <span class="fuzzy-result-name">${highlightedName}</span>
                <span class="fuzzy-result-path">${file.relativePath}</span>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    resultsDiv.querySelectorAll('.fuzzy-result').forEach(el => {
        el.addEventListener('click', () => {
            const path = el.dataset.path;
            openFileFromSearch(path);
        });
    });
}

function highlightMatches(str, positions) {
    if (!positions || positions.length === 0) return escapeHtml(str);
    
    let result = '';
    let lastIdx = 0;
    
    for (const pos of positions) {
        result += escapeHtml(str.slice(lastIdx, pos));
        result += `<span class="highlight">${escapeHtml(str[pos])}</span>`;
        lastIdx = pos + 1;
    }
    result += escapeHtml(str.slice(lastIdx));
    
    return result;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'js': '📜', 'ts': '📘', 'jsx': '⚛️', 'tsx': '⚛️',
        'html': '🌐', 'css': '🎨', 'scss': '🎨', 'less': '🎨',
        'json': '📋', 'md': '📝', 'txt': '📄',
        'py': '🐍', 'rb': '💎', 'go': '🐹', 'rs': '🦀',
        'c': '⚙️', 'cpp': '⚙️', 'h': '⚙️', 'hpp': '⚙️',
        'java': '☕', 'kt': '🎯', 'swift': '🍎',
        'sh': '🖥️', 'bash': '🖥️', 'zsh': '🖥️',
        'yml': '⚙️', 'yaml': '⚙️', 'toml': '⚙️',
        'svg': '🖼️', 'png': '🖼️', 'jpg': '🖼️', 'gif': '🖼️',
    };
    return icons[ext] || '📄';
}

async function openFileFromSearch(filePath) {
    hideFuzzyFinder();
    hideFindInFiles();
    
    if (window.editorAPI && window.editorAPI.createEditorTab) {
        try {
            const result = await window.electronAPI.readFile(filePath);
            if (result.success) {
                const fileName = filePath.split('/').pop();
                window.editorAPI.createEditorTab(filePath, fileName, result.content);
            }
        } catch (error) {
            console.error('Error opening file:', error);
        }
    }
}

function handleFuzzyKeydown(e) {
    if (!fuzzyFinderVisible) return;
    
    if (e.key === 'Escape') {
        e.preventDefault();
        hideFuzzyFinder();
        return;
    }
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, searchResults.length - 1);
        updateSelectedResult();
        return;
    }
    
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        updateSelectedResult();
        return;
    }
    
    if (e.key === 'Enter') {
        e.preventDefault();
        if (searchResults[selectedIndex]) {
            openFileFromSearch(searchResults[selectedIndex].path);
        }
        return;
    }
}

function updateSelectedResult() {
    const results = document.querySelectorAll('.fuzzy-result');
    results.forEach((el, idx) => {
        el.classList.toggle('selected', idx === selectedIndex);
    });
    
    // Scroll into view
    const selected = document.querySelector('.fuzzy-result.selected');
    if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
    }
}

// ==================== FIND IN FILES (Ctrl+Shift+F) ====================

let findInFilesAbortController = null;

function showFindInFiles() {
    const panel = document.getElementById('find-in-files');
    const input = document.getElementById('find-in-files-input');
    const results = document.getElementById('find-in-files-results');
    const status = document.getElementById('find-in-files-status');
    
    // Reset
    input.value = '';
    results.innerHTML = '';
    status.textContent = '';
    
    // Show
    panel.classList.add('visible');
    findInFilesVisible = true;
    input.focus();
}

function hideFindInFiles() {
    const panel = document.getElementById('find-in-files');
    panel.classList.remove('visible');
    findInFilesVisible = false;
    
    // Cancel any ongoing search
    if (findInFilesAbortController) {
        findInFilesAbortController.abort();
        findInFilesAbortController = null;
    }
}

async function performFindInFiles(query) {
    if (!query || query.length < 2) return;
    
    const resultsDiv = document.getElementById('find-in-files-results');
    const statusDiv = document.getElementById('find-in-files-status');
    const caseSensitive = document.getElementById('find-case-sensitive').checked;
    const useRegex = document.getElementById('find-regex').checked;
    const wholeWord = document.getElementById('find-whole-word').checked;
    
    resultsDiv.innerHTML = '<div class="fuzzy-no-results">Searching...</div>';
    statusDiv.textContent = '';
    
    // Load all files first
    await loadAllFiles();
    
    let totalMatches = 0;
    let filesWithMatches = 0;
    let resultsHtml = '';
    
    // Create regex
    let searchRegex;
    try {
        let pattern = useRegex ? query : escapeRegex(query);
        if (wholeWord) {
            pattern = `\\b${pattern}\\b`;
        }
        searchRegex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
    } catch (error) {
        resultsDiv.innerHTML = `<div class="fuzzy-no-results">Invalid regex: ${error.message}</div>`;
        return;
    }
    
    // Search through files
    for (const file of allFiles) {
        // Skip binary files
        if (isBinaryFile(file.name)) continue;
        
        try {
            const result = await window.electronAPI.readFile(file.path);
            if (!result.success) continue;
            
            const lines = result.content.split('\n');
            const fileMatches = [];
            
            lines.forEach((line, lineIdx) => {
                searchRegex.lastIndex = 0;
                let match;
                while ((match = searchRegex.exec(line)) !== null) {
                    fileMatches.push({
                        lineNumber: lineIdx + 1,
                        line: line,
                        matchStart: match.index,
                        matchEnd: match.index + match[0].length
                    });
                    totalMatches++;
                    
                    // Prevent infinite loop for zero-width matches
                    if (match[0].length === 0) break;
                }
            });
            
            if (fileMatches.length > 0) {
                filesWithMatches++;
                resultsHtml += renderFileMatches(file, fileMatches);
            }
            
        } catch (error) {
            console.error(`Error searching ${file.path}:`, error);
        }
    }
    
    if (totalMatches === 0) {
        resultsDiv.innerHTML = '<div class="fuzzy-no-results">No results found</div>';
    } else {
        resultsDiv.innerHTML = resultsHtml;
        
        // Add click handlers
        resultsDiv.querySelectorAll('.find-result-file').forEach(el => {
            el.addEventListener('click', () => {
                const path = el.dataset.path;
                openFileFromSearch(path);
            });
        });
        
        resultsDiv.querySelectorAll('.find-result-match').forEach(el => {
            el.addEventListener('click', () => {
                const path = el.dataset.path;
                const line = parseInt(el.dataset.line);
                openFileAtLine(path, line);
            });
        });
    }
    
    statusDiv.textContent = `${totalMatches} result${totalMatches !== 1 ? 's' : ''} in ${filesWithMatches} file${filesWithMatches !== 1 ? 's' : ''}`;
}

function renderFileMatches(file, matches) {
    const icon = getFileIcon(file.name);
    let html = `<div class="find-result-file" data-path="${file.path}">${icon} ${file.relativePath} (${matches.length})</div>`;
    
    // Limit matches per file to prevent huge results
    const displayMatches = matches.slice(0, 10);
    
    for (const match of displayMatches) {
        const linePreview = getLinePreview(match.line, match.matchStart, match.matchEnd);
        html += `
            <div class="find-result-match" data-path="${file.path}" data-line="${match.lineNumber}">
                <span class="line-number">${match.lineNumber}</span>${linePreview}
            </div>
        `;
    }
    
    if (matches.length > 10) {
        html += `<div class="find-result-match" style="color: #808080; cursor: default;">... and ${matches.length - 10} more matches</div>`;
    }
    
    return html;
}

function getLinePreview(line, matchStart, matchEnd) {
    // Truncate long lines
    const maxLen = 80;
    let start = Math.max(0, matchStart - 20);
    let end = Math.min(line.length, matchEnd + 40);
    
    let preview = line.slice(start, end);
    let adjustedMatchStart = matchStart - start;
    let adjustedMatchEnd = matchEnd - start;
    
    if (start > 0) {
        preview = '...' + preview;
        adjustedMatchStart += 3;
        adjustedMatchEnd += 3;
    }
    if (end < line.length) {
        preview = preview + '...';
    }
    
    // Highlight the match
    const before = escapeHtml(preview.slice(0, adjustedMatchStart));
    const match = escapeHtml(preview.slice(adjustedMatchStart, adjustedMatchEnd));
    const after = escapeHtml(preview.slice(adjustedMatchEnd));
    
    return `${before}<span class="match-text">${match}</span>${after}`;
}

async function openFileAtLine(filePath, lineNumber) {
    hideFuzzyFinder();
    hideFindInFiles();
    
    if (window.editorAPI && window.editorAPI.createEditorTab) {
        try {
            const result = await window.electronAPI.readFile(filePath);
            if (result.success) {
                const fileName = filePath.split('/').pop();
                window.editorAPI.createEditorTab(filePath, fileName, result.content);
                
                // Set cursor position after a short delay
                setTimeout(() => {
                    if (window.editorAPI.setCursorPosition) {
                        window.editorAPI.setCursorPosition(lineNumber, 1);
                    }
                }, 100);
            }
        } catch (error) {
            console.error('Error opening file:', error);
        }
    }
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isBinaryFile(filename) {
    const binaryExts = ['png', 'jpg', 'jpeg', 'gif', 'ico', 'bmp', 'webp', 
                        'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv',
                        'zip', 'tar', 'gz', 'rar', '7z',
                        'pdf', 'doc', 'docx', 'xls', 'xlsx',
                        'exe', 'dll', 'so', 'o', 'a', 'lib',
                        'woff', 'woff2', 'ttf', 'eot', 'otf'];
    const ext = filename.split('.').pop().toLowerCase();
    return binaryExts.includes(ext);
}

function handleFindInFilesKeydown(e) {
    if (!findInFilesVisible) return;
    
    if (e.key === 'Escape') {
        e.preventDefault();
        hideFindInFiles();
        return;
    }
    
    if (e.key === 'Enter') {
        e.preventDefault();
        const query = document.getElementById('find-in-files-input').value;
        performFindInFiles(query);
        return;
    }
}

// ==================== INITIALIZATION ====================

function initSearch() {
    const fuzzyInput = document.getElementById('fuzzy-finder-input');
    const findInput = document.getElementById('find-in-files-input');
    
    // Fuzzy finder input handler
    if (fuzzyInput) {
        fuzzyInput.addEventListener('input', (e) => {
            updateFuzzyResults(e.target.value);
        });
        
        fuzzyInput.addEventListener('keydown', handleFuzzyKeydown);
    }
    
    // Find in files input handler
    if (findInput) {
        findInput.addEventListener('keydown', handleFindInFilesKeydown);
    }
    
    // Close on click outside
    document.addEventListener('click', (e) => {
        if (fuzzyFinderVisible && !e.target.closest('#fuzzy-finder')) {
            hideFuzzyFinder();
        }
        if (findInFilesVisible && !e.target.closest('#find-in-files')) {
            hideFindInFiles();
        }
    });
}

// Expose API
window.searchAPI = {
    showFuzzyFinder,
    hideFuzzyFinder,
    showFindInFiles,
    hideFindInFiles,
    initSearch
};

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', initSearch);

