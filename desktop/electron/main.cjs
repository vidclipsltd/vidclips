const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const videoFilters = [{ name: "Video files", extensions: ["mp4", "m4v", "mov", "webm", "mkv", "avi", "ogv", "mpeg", "mpg"] }, { name: "All files", extensions: ["*"] }];

ipcMain.handle("vidclips:open-media", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"], filters: videoFilters });
  if (result.canceled) return [];
  return result.filePaths.map((filePath) => ({ path: filePath, name: path.basename(filePath), url: require("node:url").pathToFileURL(filePath).href }));
});

ipcMain.handle("vidclips:save-project", async (_event, project) => {
  const result = await dialog.showSaveDialog({ defaultPath: (project?.projectName || "Untitled project").replace(/[<>:"/\\|?*]/g, "-") + ".vidclips.json", filters: [{ name: "VidClips Project", extensions: ["vidclips.json", "json"] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, JSON.stringify(project, null, 2), "utf8");
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle("vidclips:open-project", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "VidClips Project", extensions: ["json"] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return JSON.parse(await fs.readFile(filePath, "utf8"));
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: "#101114",
    title: "VidClips",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (!app.isPackaged) win.loadURL("http://127.0.0.1:5173");
  else win.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
