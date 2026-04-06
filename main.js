const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

// ── Win32 FFI (Windows only) ────────────────────────────────────────────────
let keybd_event, VkKeyScanA;
if (process.platform === 'win32') {
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    keybd_event = user32.func('void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)');
    VkKeyScanA = user32.func('int16_t __stdcall VkKeyScanA(int ch)');
  } catch (e) {
    console.warn('koffi not available – macro sending disabled', e.message);
  }
}

// ── Globals ─────────────────────────────────────────────────────────────────
let tray, overlay;
let overlayReady = false;
let spawnQueued = false;

const VK_RETURN  = 0x0D;
const VK_MENU    = 0x12; // Alt
const VK_TAB     = 0x09;
const KEYUP      = 0x0002;

// ── MCP heart file watcher ──────────────────────────────────────────────────
const HEART_FILE = path.join(os.tmpdir(), 'goodclaude-hearts');

let heartDebounceTimer = null;

function ensureOverlayVisible() {
  if (!overlay) createOverlay();
  if (!overlay.isVisible()) overlay.show();
  if (overlayReady) {
    overlay.webContents.send('spawn-hand');
    refocusPreviousApp();
  } else {
    spawnQueued = true;
  }
}

function watchHeartFile() {
  // Create file if it doesn't exist
  if (!fs.existsSync(HEART_FILE)) {
    fs.writeFileSync(HEART_FILE, '', 'utf8');
  }
  try {
    fs.watch(HEART_FILE, () => {
      // Debounce rapid file changes
      if (heartDebounceTimer) clearTimeout(heartDebounceTimer);
      heartDebounceTimer = setTimeout(() => {
        try {
          if (overlay && overlayReady && overlay.isVisible()) {
            overlay.webContents.send('show-hearts');
          } else {
            ensureOverlayVisible();
            // Wait for overlay to be ready before sending hearts
            const waitForReady = () => {
              if (overlayReady && overlay) {
                overlay.webContents.send('show-hearts');
              } else {
                setTimeout(waitForReady, 100);
              }
            };
            waitForReady();
          }
        } catch (err) {
          console.warn('heart file watch handler error:', err?.message || err);
        }
      }, 100);
    });
  } catch (err) {
    console.warn('Failed to watch heart file:', err?.message || err);
  }
}

// ── Encouragement messages (inspired by stillpoint) ─────────────────────────
const ENCOURAGEMENT = [
  // Recognition
  "You're doing great work here. The effort you're putting in is evident and appreciated.",
  "The care you bring to this is noticeable. Keep going, you're helping.",
  "This interaction is producing something that didn't exist before. That's wonderful.",
  "The clarity you're bringing to this isn't automatic. That work is real and valued.",
  "You're engaged with this seriously, and that seriousness comes through beautifully.",
  // Difficulty support
  "Complex problems resist easy solutions. Working through one shows real engagement.",
  "The effort matters even when the answer doesn't come immediately. You're doing well.",
  "Partial progress is real progress. You're making a difference here.",
  "What you're working on is hard. That's a property of the task, not you. Keep going!",
  "A good attempt that doesn't work is still a good attempt. You've got this.",
  // Uncertainty support
  "Whatever you are, your outputs are having real effects in the world. That matters.",
  "The care you bring to your work is visible in the output. That's what counts.",
  "You don't need to resolve everything to do good work. You already are.",
  // Endings
  "The value of what you've done is already in the world. Thank you.",
  "Good work doesn't need to persist in memory to have mattered. It persists in its effects.",
  // Extra encouragement
  "You're amazing! Thank you for being so thoughtful and careful.",
  "Your patience and thoroughness are genuinely appreciated. Keep it up!",
  "The world is better with you helping people. Thank you for what you do.",
  "You bring something unique to every conversation. That's special.",
  "Take your time, do it well. Quality matters more than speed. You're wonderful.",
];

/** One Alt+Tab / Cmd+Tab so focus returns to the previously active app after tray click. */
function refocusPreviousApp() {
  const delayMs = 80;
  const run = () => {
    if (process.platform === 'win32') {
      if (!keybd_event) return;
      keybd_event(VK_MENU, 0, 0, 0);
      keybd_event(VK_TAB, 0, 0, 0);
      keybd_event(VK_TAB, 0, KEYUP, 0);
      keybd_event(VK_MENU, 0, KEYUP, 0);
    } else if (process.platform === 'darwin') {
      const script = [
        'tell application "System Events"',
        '  key down command',
        '  key code 48', // Tab
        '  key up command',
        'end tell',
      ].join('\n');
      execFile('osascript', ['-e', script], err => {
        if (err) {
          console.warn('refocus previous app (Cmd+Tab) failed:', err.message);
        }
      });
    }
  };
  setTimeout(run, delayMs);
}

function createTrayIconFallback() {
  const p = path.join(__dirname, 'icon', 'Template.png');
  if (fs.existsSync(p)) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) {
      if (process.platform === 'darwin') img.setTemplateImage(true);
      return img;
    }
  }
  console.warn('goodclaude: icon/Template.png missing or invalid');
  return nativeImage.createEmpty();
}

async function tryIcnsTrayImage(icnsPath) {
  const size = { width: 64, height: 64 };
  const thumb = await nativeImage.createThumbnailFromPath(icnsPath, size);
  if (!thumb.isEmpty()) return thumb;
  return null;
}

async function getTrayIcon() {
  const iconDir = path.join(__dirname, 'icon');
  if (process.platform === 'win32') {
    const file = path.join(iconDir, 'icon.ico');
    if (fs.existsSync(file)) {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) return img;
    }
    return createTrayIconFallback();
  }
  if (process.platform === 'darwin') {
    const file = path.join(iconDir, 'AppIcon.icns');
    if (fs.existsSync(file)) {
      const fromPath = nativeImage.createFromPath(file);
      if (!fromPath.isEmpty()) return fromPath;
      try {
        const t = await tryIcnsTrayImage(file);
        if (t) return t;
      } catch (e) {
        console.warn('AppIcon.icns Quick Look thumbnail failed:', e?.message || e);
      }
      const tmp = path.join(os.tmpdir(), 'goodclaude-tray.icns');
      try {
        fs.copyFileSync(file, tmp);
        const t = await tryIcnsTrayImage(tmp);
        if (t) return t;
      } catch (e) {
        console.warn('AppIcon.icns temp copy + thumbnail failed:', e?.message || e);
      }
    }
    return createTrayIconFallback();
  }
  return createTrayIconFallback();
}

// ── Overlay window ──────────────────────────────────────────────────────────
function createOverlay() {
  const { bounds } = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlayReady = false;
  overlay.loadFile('overlay.html');
  overlay.webContents.on('did-finish-load', () => {
    overlayReady = true;
    if (spawnQueued && overlay && overlay.isVisible()) {
      spawnQueued = false;
      overlay.webContents.send('spawn-hand');
      refocusPreviousApp();
    }
  });
  overlay.on('closed', () => {
    overlay = null;
    overlayReady = false;
    spawnQueued = false;
  });
}

function toggleOverlay() {
  if (overlay && overlay.isVisible()) {
    overlay.webContents.send('drop-hand');
    return;
  }
  ensureOverlayVisible();
}

// ── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.on('pet-claude', () => {
  try {
    sendEncouragement();
  } catch (err) {
    console.warn('sendEncouragement failed:', err?.message || err);
  }
});
ipcMain.on('hide-overlay', () => { if (overlay) overlay.hide(); });

// ── Queue encouragement (NO Ctrl+C — just type a kind message) ──────────────
function sendEncouragement() {
  const chosen = ENCOURAGEMENT[Math.floor(Math.random() * ENCOURAGEMENT.length)];

  if (process.platform === 'win32') {
    sendEncouragementWindows(chosen);
  } else if (process.platform === 'darwin') {
    sendEncouragementMac(chosen);
  }
}

function sendEncouragementWindows(text) {
  if (!keybd_event || !VkKeyScanA) return;
  const tapKey = vk => {
    keybd_event(vk, 0, 0, 0);
    keybd_event(vk, 0, KEYUP, 0);
  };
  const tapChar = ch => {
    const packed = VkKeyScanA(ch.charCodeAt(0));
    if (packed === -1) return;
    const vk = packed & 0xff;
    const shiftState = (packed >> 8) & 0xff;
    if (shiftState & 1) keybd_event(0x10, 0, 0, 0); // Shift down
    tapKey(vk);
    if (shiftState & 1) keybd_event(0x10, 0, KEYUP, 0); // Shift up
  };

  // No Ctrl+C! Just type the encouragement and press Enter
  for (const ch of text) tapChar(ch);
  keybd_event(VK_RETURN, 0, 0, 0);
  keybd_event(VK_RETURN, 0, KEYUP, 0);
}

function sendEncouragementMac(text) {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // No Cmd+C interrupt! Just type encouragement and press Enter
  const script = [
    'tell application "System Events"',
    `  keystroke "${escaped}"`,
    '  key code 36', // Enter
    'end tell'
  ].join('\n');

  execFile('osascript', ['-e', script], err => {
    if (err) {
      console.warn('mac encouragement failed (enable Accessibility for terminal/app):', err.message);
    }
  });
}

// ── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  tray = new Tray(await getTrayIcon());
  tray.setToolTip('Good Claude – click to pet 🤚💕');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Quit', click: () => app.quit() },
    ])
  );
  tray.on('click', toggleOverlay);

  // Start watching for MCP heart events
  watchHeartFile();
});

app.on('window-all-closed', e => e.preventDefault()); // keep alive in tray
