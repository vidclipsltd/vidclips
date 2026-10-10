const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vidclips", {
  openMediaFiles: () => ipcRenderer.invoke("vidclips:open-media"),
  saveProject: (project) => ipcRenderer.invoke("vidclips:save-project", project),
  openProject: () => ipcRenderer.invoke("vidclips:open-project"),
  mediaUrlFromPath: (filePath) => ipcRenderer.invoke("vidclips:media-url", filePath)
});
