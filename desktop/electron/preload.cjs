const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vidclips", {
  openMediaFiles: () => ipcRenderer.invoke("vidclips:open-media"),
  saveProject: (project) => ipcRenderer.invoke("vidclips:save-project", project),
  openProject: () => ipcRenderer.invoke("vidclips:open-project"),
  mediaUrlFromPath: (filePath) => ipcRenderer.invoke("vidclips:media-url", filePath),
  analyzeVideo: (filePath) => ipcRenderer.invoke("vidclips:analyze-video", filePath),
  exportMp4: (project) => ipcRenderer.invoke("vidclips:export-mp4", project)
});
