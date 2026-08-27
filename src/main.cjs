/**
 * Windows desktop-pet shell: a transparent, click-through overlay and a
 * Electron cursor polling lets users soften pawprints without blocking desktop use.
 */
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain } = require("electron");

let overlay;
let tray;
let paused = false;
let rendererReady = false;
let recordedWipeEvents = 0;
let lastWipeAt = 0;
let adoptedCatCount = 3;
let cursorPoller;
let lastCursorPoint;

function settingsPath() {
  return path.join(app.getPath("userData"), "piece-of-niya-settings.json");
}

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    if ([1, 2, 3].includes(saved.adoptedCatCount)) adoptedCatCount = saved.adoptedCatCount;
  } catch {
    // First run has no settings file; three adopted cats are the default.
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify({ adoptedCatCount }, null, 2));
  } catch (error) {
    console.error("Could not save desktop pet settings", error);
  }
}

function setAdoptedCatCount(count) {
  adoptedCatCount = count;
  saveSettings();
  overlay?.webContents.send("paw:set-cat-count", count);
  refreshTrayMenu();
}

function virtualDesktopBounds() {
  const displays = screen.getAllDisplays();
  const left = Math.min(...displays.map((display) => display.bounds.x));
  const top = Math.min(...displays.map((display) => display.bounds.y));
  const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
  const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function sendWipeAt() {
  if (!overlay || overlay.isDestroyed() || paused || !rendererReady) return;
  const now = Date.now();
  // Prevent a high-frequency native event stream from overwhelming the renderer.
  if (now - lastWipeAt < 28) return;
  lastWipeAt = now;
  const bounds = virtualDesktopBounds();
  // Electron returns device-independent screen coordinates, matching BrowserWindow bounds.
  // This avoids high-DPI coordinate drift from a native global mouse event.
  const cursor = screen.getCursorScreenPoint();
  const normalizedX = (cursor.x - bounds.x) / bounds.width;
  const normalizedY = (cursor.y - bounds.y) / bounds.height;
  if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) return;
  if (lastCursorPoint && Math.hypot(normalizedX - lastCursorPoint.x, normalizedY - lastCursorPoint.y) < 0.0012) return;
  lastCursorPoint = { x: normalizedX, y: normalizedY };
  overlay.webContents.send("paw:wipe-at", { x: normalizedX, y: normalizedY });
  if (recordedWipeEvents++ < 8) {
    console.info(`Paw wipe at ${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)}`);
  }
}

function startCursorPolling() {
  if (cursorPoller) clearInterval(cursorPoller);
  // Uses Electron's own DPI-aware cursor API instead of a packaged native input hook.
  cursorPoller = setInterval(sendWipeAt, 33);
}

function createOverlay() {
  const bounds = virtualDesktopBounds();
  overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  overlay.on("closed", () => { overlay = undefined; rendererReady = false; });
}

function refreshTrayMenu() {
  if (!tray) return;
  const adoptMenu = [1, 2, 3].map((count) => ({
    label: `${count} ${count === 1 ? "cat" : "cats"}`,
    type: "radio",
    checked: adoptedCatCount === count,
    click: () => setAdoptedCatCount(count),
  }));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Piece of Niya", enabled: false },
    { type: "separator" },
    { label: "Adopted cats", submenu: adoptMenu },
    { type: "separator" },
    { label: paused ? "Resume cats" : "Pause cats", click: () => { paused = !paused; overlay?.webContents.send("paw:paused", paused); refreshTrayMenu(); } },
    { label: "Clear pawprints", click: () => overlay?.webContents.send("paw:clear-pawprints") },
    { type: "separator" },
    { label: "Quit Piece of Niya", click: () => app.quit() },
  ]));
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "dist", "tray-icon.png");
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip("Piece of Niya — Desktop Pet");
  refreshTrayMenu();
}

app.whenReady().then(() => {
  loadSettings();
  createOverlay();
  createTray();
  startCursorPolling();
  ipcMain.on("paw:ready", () => {
    rendererReady = true;
    overlay?.webContents.send("paw:paused", paused);
    overlay?.webContents.send("paw:set-cat-count", adoptedCatCount);
  });
  ipcMain.on("paw:renderer-error", (_event, message) => {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    console.error(line.trim());
    try {
      fs.appendFileSync(path.join(app.getPath("userData"), "renderer-errors.log"), line);
    } catch (error) {
      console.error("Could not write renderer diagnostic", error);
    }
  });
  screen.on("display-added", () => { const bounds = virtualDesktopBounds(); overlay?.setBounds(bounds); });
  screen.on("display-removed", () => { const bounds = virtualDesktopBounds(); overlay?.setBounds(bounds); });
});

app.on("window-all-closed", (event) => event.preventDefault());
app.on("before-quit", () => {
  if (cursorPoller) clearInterval(cursorPoller);
});
