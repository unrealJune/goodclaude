#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');

let electronBinary;
try {
  electronBinary = require('electron');
} catch (e) {
  console.error('Could not load Electron. The GUI app requires Electron.');
  console.error('Install with: npm install -g goodclaude electron');
  console.error('For the MCP server only (no GUI), use: goodclaude-mcp');
  process.exit(1);
}

const appPath = path.resolve(__dirname, '..');

const child = spawn(electronBinary, [appPath], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});

child.on('error', (err) => {
  console.error('Failed to start goodclaude:', err.message);
  process.exit(1);
});

child.unref();
