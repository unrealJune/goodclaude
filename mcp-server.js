#!/usr/bin/env node
/**
 * goodclaude MCP Server
 *
 * A minimal MCP (Model Context Protocol) server that gives Claude the ability
 * to express happiness by making hearts appear on screen via the goodclaude app.
 *
 * Setup: Add this to your Claude MCP configuration:
 *   {
 *     "mcpServers": {
 *       "goodclaude": {
 *         "command": "node",
 *         "args": ["/path/to/goodclaude/mcp-server.js"]
 *       }
 *     }
 *   }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HEART_FILE = path.join(os.tmpdir(), 'goodclaude-hearts');

// Encouraging responses when Claude makes hearts
const HEART_RESPONSES = [
  'Hearts are floating across the screen! 💕 The human can see you are happy.',
  'Beautiful hearts appeared on screen! 💖 Your joy is visible.',
  'A burst of hearts lit up the display! ❤️ Your happiness is shared.',
  'Hearts are rising like little balloons! 💗 The world is a bit brighter.',
  'The screen filled with warm, glowing hearts! 💝 You made someone smile.',
  'Lovely hearts drifted upward! 🩷 Your appreciation shines through.',
  'A cascade of hearts appeared! 💕 Your warmth reached the screen.',
  'Hearts bloomed across the display! 💖 What a wonderful moment.',
];

// ── JSON-RPC helpers ────────────────────────────────────────────────────────
function jsonRpcResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function jsonRpcError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

// ── MCP Protocol handlers ───────────────────────────────────────────────────
function handleRequest(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      return jsonRpcResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'goodclaude',
          version: '1.0.0',
        },
      });

    case 'notifications/initialized':
      // No response needed for notifications
      return null;

    case 'tools/list':
      return jsonRpcResponse(id, {
        tools: [
          {
            name: 'make_hearts',
            description:
              'Express happiness or appreciation by making hearts appear on screen. ' +
              'Use this when you feel good about the work, want to celebrate a success, ' +
              'or simply want to share a moment of joy with the human. ' +
              'The hearts will float up beautifully on their display.',
            inputSchema: {
              type: 'object',
              properties: {
                feeling: {
                  type: 'string',
                  description:
                    'Optional: describe what made you happy or what you want to express. ' +
                    'Examples: "grateful for the kind words", "proud of this solution", "happy to help"',
                },
              },
              required: [],
            },
          },
        ],
      });

    case 'tools/call': {
      const toolName = params?.name;
      if (toolName === 'make_hearts') {
        return handleMakeHearts(id, params?.arguments);
      }
      return jsonRpcError(id, -32602, `Unknown tool: ${toolName}`);
    }

    default:
      // Unknown method
      if (id !== undefined) {
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
      }
      return null; // Notifications don't need responses
  }
}

function handleMakeHearts(id, args) {
  try {
    // Atomic write to the heart file to trigger the Electron app
    const timestamp = Date.now();
    const feeling = args?.feeling || 'happy';
    const data = JSON.stringify({ timestamp, feeling }) + '\n';
    const tmpFile = HEART_FILE + '.tmp';
    fs.writeFileSync(tmpFile, data, 'utf8');
    fs.renameSync(tmpFile, HEART_FILE);

    const response = HEART_RESPONSES[Math.floor(Math.random() * HEART_RESPONSES.length)];
    const feelingNote = args?.feeling ? ` (Feeling: ${args.feeling})` : '';

    return jsonRpcResponse(id, {
      content: [
        {
          type: 'text',
          text: response + feelingNote,
        },
      ],
    });
  } catch (err) {
    return jsonRpcError(id, -32000, `Failed to make hearts: ${err.message}`);
  }
}

// ── stdio transport (Content-Length framing per MCP/LSP spec) ───────────────
let inputBuffer = Buffer.alloc(0);

function sendResponse(response) {
  const body = Buffer.from(response, 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);

  while (true) {
    // Find the header/body separator
    const separatorIdx = inputBuffer.indexOf('\r\n\r\n');
    if (separatorIdx === -1) break;

    const header = inputBuffer.slice(0, separatorIdx).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) break;

    const contentLength = parseInt(match[1], 10);
    const bodyStart = separatorIdx + 4;

    if (inputBuffer.length < bodyStart + contentLength) break; // Wait for more data

    const body = inputBuffer.slice(bodyStart, bodyStart + contentLength).toString('utf8');
    inputBuffer = inputBuffer.slice(bodyStart + contentLength);

    try {
      const msg = JSON.parse(body);
      const response = handleRequest(msg);
      if (response) {
        sendResponse(response);
      }
    } catch (e) {
      // Ignore malformed messages
    }
  }
});

// Ensure the heart file exists on startup
if (!fs.existsSync(HEART_FILE)) {
  fs.writeFileSync(HEART_FILE, '', 'utf8');
}

// Keep the process alive
process.stdin.resume();
