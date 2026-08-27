/** Desktop Pet bridge: expose only app-originated click and pause events to the transparent renderer. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pawDesktop", {
  ready: () => ipcRenderer.send("paw:ready"),
  reportError: (message) => ipcRenderer.send("paw:renderer-error", message),
  onCleanAt: (callback) => ipcRenderer.on("paw:clean-at", (_event, point) => callback(point)),
  onPaused: (callback) => ipcRenderer.on("paw:paused", (_event, value) => callback(value)),
});
