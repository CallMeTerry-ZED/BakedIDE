# BakedIDE

Advanced text editor inspired by Kate and VS Code.

An IDE built with Electron and Monaco Editor, featuring native support for C++, C, C#, Lua/Luau, JavaScript, TypeScript, and Python. Includes built-in support for CMake, Premake, and Make build systems.

## Building

This project uses Electron and requires Node.js to build and run.

### Prerequisites

- Node.js (v16 or higher recommended)
- npm (comes with Node.js)

### Installation

Install all dependencies:

npm install

### Build Commands

**Development Mode:**

npm run dev    # Run with DevTools enabled

or

NODE_ENV=development electron .

**Production Mode:**

npm start      # Run in production mode

or

electron .