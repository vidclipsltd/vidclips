const { app, BrowserWindow, dialog, ipcMain, protocol, net } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");

protocol.registerSchemesAsPrivileged([{ scheme: "vidclips-media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
const mediaPaths = new Map();
function registerMediaPath(filePath) { const id = randomUUID(); mediaPaths.set(id, filePath); return "vidclips-media://asset/" + id; }

const videoFilters = [{ name: "Video files", extensions: ["mp4", "m4v", "mov", "webm", "mkv", "avi", "ogv", "mpeg", "mpg"] }, { name: "All files", extensions: ["*"] }];


const BACKEND_URL = "https://vidclips-xf5z.onrender.com";

const { spawn } = require("node:child_process");
const ffmpegPackage = require("ffmpeg-static");
const ffprobePackage = require("ffprobe-static");
function binaryPath(name, developmentPath) {
  return app.isPackaged ? path.join(process.resourcesPath, name + ".exe") : developmentPath;
}
function runBinary(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-12000); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || binary + " exited with code " + code)));
  });
}
ipcMain.handle("vidclips:export-mp4", async (_event, project) => {
  const clips = (Array.isArray(project?.clips) ? project.clips : [])
    .filter((clip) => clip.track === "V1" && clip.mediaPath && Number(clip.duration) > 0)
    .sort((a, b) => Number(a.start) - Number(b.start));
  if (!clips.length) throw new Error("Add at least one imported video clip to track V1 before exporting.");
  const save = await dialog.showSaveDialog({ defaultPath: (project.projectName || "VidClips export").replace(/[<>:"/\\|?*]/g, "-") + ".mp4", filters: [{ name: "MP4 video", extensions: ["mp4"] }] });
  if (save.canceled || !save.filePath) return { canceled: true };
  const ffmpeg = binaryPath("ffmpeg", ffmpegPackage);
  const ffprobe = binaryPath("ffprobe", ffprobePackage.path);
  const args = ["-y"];
  for (const clip of clips) {
    if (!await fs.stat(clip.mediaPath).then(() => true).catch(() => false)) throw new Error("Source file not found: " + clip.mediaPath);
    args.push("-i", clip.mediaPath);
  }
  const filters = [];
  const concatInputs = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const sourceIn = Math.max(0, Number(clip.sourceIn) || 0);
    const duration = Math.max(0.05, Number(clip.duration));
    filters.push("[" + i + ":v:0]trim=start=" + sourceIn + ":duration=" + duration + ",setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v" + i + "]");
    let hasAudio = false;
    try {
      const probeArgs = ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", clip.mediaPath];
      await runBinary(ffprobe, probeArgs);
      const { stdout } = await new Promise((resolve, reject) => {
        const child = spawn(ffprobe, probeArgs, { windowsHide: true });
        let output = ""; child.stdout.on("data", (chunk) => output += chunk.toString());
        child.on("error", reject); child.on("close", (code) => code === 0 ? resolve({ stdout: output }) : resolve({ stdout: "" });
      });
      hasAudio = Boolean(stdout.trim());
    } catch {}
    if (hasAudio) filters.push("[" + i + ":a:0]atrim=start=" + sourceIn + ":duration=" + duration + ",asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a" + i + "]");
    else filters.push("anullsrc=r=48000:cl=stereo,atrim=duration=" + duration + "[a" + i + "]");
    concatInputs.push("[v" + i + "][a" + i + "]");
  }
  filters.push(concatInputs.join("") + "concat=n=" + clips.length + ":v=1:a=1[outv][outa]");
  args.push("-filter_complex", filters.join(";"), "-map", "[outv]", "-map", "[outa]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", save.filePath);
  await runBinary(ffmpeg, args);
  return { canceled: false, filePath: save.filePath, clips: clips.length };
});

ipcMain.handle("vidclips:analyze-video", async (_event, filePath) => {
  const stat = await fs.stat(filePath);
  const maxBytes = 120 * 1024 * 1024;
  if (stat.size > maxBytes) throw new Error("This video is " + (stat.size / 1024 / 1024).toFixed(0) + " MB. The hosted free-tier analyzer is limited to 120 MB per upload; use a shorter/smaller video.");
  const healthResponse = await fetch(BACKEND_URL + "/health", { signal: AbortSignal.timeout(20000) });
  if (!healthResponse.ok) throw new Error("Analysis backend health check failed (HTTP " + healthResponse.status + ").");
  const health = await healthResponse.json();
  if (health.status !== "ok") throw new Error("Analysis backend is not ready.");
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes]), path.basename(filePath));
  let submit;
  try {
    submit = await fetch(BACKEND_URL + "/jobs", { method: "POST", body: form, signal: AbortSignal.timeout(180000) });
  } catch (error) { throw new Error("Could not upload the video to the analysis backend: " + error.message); }
  if (!submit.ok) throw new Error("Analysis job submission failed (HTTP " + submit.status + "): " + (await submit.text()).slice(0, 500));
  const job = await submit.json();
  if (!job.run_id) throw new Error("The backend did not return a run_id.");
  for (let attempt = 0; attempt < 180; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    let response;
    try { response = await fetch(BACKEND_URL + "/jobs/" + encodeURIComponent(job.run_id), { signal: AbortSignal.timeout(20000) }); }
    catch (error) { if (attempt < 179) continue; throw new Error("Could not check analysis status: " + error.message); }
    if (response.status === 404) throw new Error("The analysis job expired or the free service restarted. Please submit the analysis again.");
    if (!response.ok) throw new Error("Analysis status check failed (HTTP " + response.status + ").");
    const status = await response.json();
    if (status.status === "failed") throw new Error(status.error || "The analysis job failed. The free backend may have run out of memory.");
    if (status.status === "completed") {
      const timelineResponse = await fetch(BACKEND_URL + "/outputs/metadata/" + encodeURIComponent(job.run_id) + "/timeline.json", { signal: AbortSignal.timeout(30000) });
      if (!timelineResponse.ok) throw new Error("Analysis completed, but its timeline output could not be downloaded (HTTP " + timelineResponse.status + ").");
      return { runId: job.run_id, timeline: await timelineResponse.json(), job: status };
    }
  }
  throw new Error("Analysis is taking longer than 9 minutes. The job may still be running; check the backend before resubmitting.");
});

ipcMain.handle("vidclips:open-media", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"], filters: videoFilters });
  if (result.canceled) return [];
  return result.filePaths.map((filePath) => ({ path: filePath, name: path.basename(filePath), url: registerMediaPath(filePath) }));
});

ipcMain.handle("vidclips:media-url", async (_event, filePath) => registerMediaPath(filePath));

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
  protocol.handle("vidclips-media", (request) => {
    const id = new URL(request.url).pathname.slice(1);
    const filePath = mediaPaths.get(id);
    if (!filePath) return new Response("Media reference expired. Reopen or re-import the source file.", { status: 404 });
    return net.fetch(pathToFileURL(filePath).href);
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
