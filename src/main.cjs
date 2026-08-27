/**
 * Windows desktop-pet shell: a transparent, click-through overlay and a
 * global mouse listener let users clean pawprints without blocking desktop use.
 */
const path = require("path");
const { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain } = require("electron");
const { uIOhook } = require("uiohook-napi");

let overlay;
let tray;
let paused = false;

function virtualDesktopBounds() {
  const displays = screen.getAllDisplays();
  const left = Math.min(...displays.map((display) => display.bounds.x));
  const top = Math.min(...displays.map((display) => display.bounds.y));
  const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
  const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function sendCleanAt(x, y) {
  if (!overlay || paused) return;
  const bounds = virtualDesktopBounds();
  const normalizedX = (x - bounds.x) / bounds.width;
  const normalizedY = (y - bounds.y) / bounds.height;
  if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) return;
  overlay.webContents.send("paw:clean-at", { x: normalizedX, y: normalizedY });
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
    },
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  overlay.on("closed", () => { overlay = undefined; });
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "dist", "tray-icon.png");
  tray = new Tray(nativeImage.createFromPath(iconPath));
  const refreshMenu = () => {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: paused ? "Resume cats" : "Pause cats", click: () => { paused = !paused; overlay?.webContents.send("paw:paused", paused); refreshMenu(); } },
      { type: "separator" },
      { label: "Quit Piece of Niya", click: () => app.quit() },
    ]));
  };
  tray.setToolTip("Piece of Niya — Desktop Pet");
  refreshMenu();
}

app.whenReady().then(() => {
  createOverlay();
  createTray();
  uIOhook.on("mousedown", (event) => sendCleanAt(event.x, event.y));
  uIOhook.start();
  ipcMain.on("paw:ready", () => overlay?.webContents.send("paw:paused", paused));
  screen.on("display-added", () => { const bounds = virtualDesktopBounds(); overlay?.setBounds(bounds); });
  screen.on("display-removed", () => { const bounds = virtualDesktopBounds(); overlay?.setBounds(bounds); });
});

app.on("window-all-closed", (event) => event.preventDefault());
app.on("before-quit", () => uIOhook.stop());
