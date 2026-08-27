/** Desktop Pet bridge: expose app-originated cursor wipe and pause events to the transparent renderer. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pawDesktop", {
  ready: () => ipcRenderer.send("paw:ready"),
  reportError: (message) => ipcRenderer.send("paw:renderer-error", message),
  onWipeAt: (callback) => ipcRenderer.on("paw:wipe-at", (_event, point) => callback(point)),
  onPaused: (callback) => ipcRenderer.on("paw:paused", (_event, value) => callback(value)),
  onCatCount: (callback) => ipcRenderer.on("paw:set-cat-count", (_event, count) => callback(count)),
  onClearPawprints: (callback) => ipcRenderer.on("paw:clear-pawprints", callback),
  onWipeDiagnostic: (callback) => ipcRenderer.on("paw:wipe-diagnostic", (_event, enabled) => callback(enabled)),
});
