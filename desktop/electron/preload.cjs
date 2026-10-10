const { contextBridge, ipcRenderer } = require("electron");
const { pathToFileURL } = require("node:url");

contextBridge.exposeInMainWorld("vidclips", {
  openMediaFiles: () => ipcRenderer.invoke("vidclips:open-media"),
  saveProject: (project) => ipcRenderer.invoke("vidclips:save-project", project),
  openProject: () => ipcRenderer.invoke("vidclips:open-project"),
  mediaUrlFromPath: (filePath) => pathToFileURL(filePath).href
});
