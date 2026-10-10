const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vidclips", {
  openMediaFiles: () => ipcRenderer.invoke("vidclips:open-media"),
  saveProject: (project) => ipcRenderer.invoke("vidclips:save-project", project),
  openProject: () => ipcRenderer.invoke("vidclips:open-project"),
  mediaUrlFromPath: (filePath) => ipcRenderer.invoke("vidclips:media-url", filePath),
  analyzeVideo: (filePath, options) => ipcRenderer.invoke("vidclips:analyze-video", filePath, options),
  onAnalysisProgress: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("vidclips:analysis-progress", listener);
    return () => ipcRenderer.removeListener("vidclips:analysis-progress", listener);
  },
  exportMp4: (project) => ipcRenderer.invoke("vidclips:export-mp4", project)
});
