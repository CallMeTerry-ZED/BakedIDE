// Initialize Monaco Editor using the loader
let editor;

// Configure Monaco loader
require.config({ paths: { vs: '../../node_modules/monaco-editor/min/vs' } });

// Load Monaco Editor
require(['vs/editor/editor.main'], function () {
  window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('editor-container');
    
    if (!container) {
      console.error('Editor container not found!');
      return;
    }

    // Create Monaco editor instance
    editor = monaco.editor.create(container, {
      value: `// Welcome to BakedIDE!
// This is a basic editor setup.
// We'll add more features soon!

function hello() {
    console.log("Hello from BakedIDE!");
}

hello();
`,
      language: 'javascript',
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      minimap: {
        enabled: true
      },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      // Enable rainbow brackets like Kate
      bracketPairColorization: {
        enabled: true
      },
      guides: {
        bracketPairs: 'active'
      }
    });

    console.log('Monaco Editor initialized successfully!');
  });
});

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  if (editor) {
    editor.dispose();
  }
});