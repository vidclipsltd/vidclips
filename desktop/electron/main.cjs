const { app, BrowserWindow, dialog, ipcMain, protocol, net } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");

protocol.registerSchemesAsPrivileged([{ scheme: "vidclips-media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
const mediaPaths = new Map();
function registerMediaPath(filePath) { const id = randomUUID(); mediaPaths.set(id, filePath); return "vidclips-media://asset/" + id; }

const videoFilters = [{ name: "Video files", extensions: ["mp4", "m4v", "mov", "webm", "mkv", "avi", "ogv", "mpeg", "mpg"] }, { name: "All files", extensions: ["*"] }];


const { spawn } = require("node:child_process");
const ffmpegPackage = require("ffmpeg-static");
const ffprobePackage = require("ffprobe-static");
function binaryPath(name, developmentPath) {
  return app.isPackaged ? path.join(process.resourcesPath, name + ".exe") : developmentPath;
}
function runBinary(binary, args) {
  return runBinaryOutput(binary, args).then(() => undefined);
}
function runBinaryOutput(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stderr = "";
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk.toString()).slice(-12000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-20000); });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve({ stdout, stderr })
      : reject(new Error(stderr || binary + " exited with code " + code)));
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
    const brightness = Math.max(0, Math.min(2, Number(clip.brightness ?? 1)));
    const contrast = Math.max(0, Math.min(2, Number(clip.contrast ?? 1)));
    const saturation = Math.max(0, Math.min(2, Number(clip.saturation ?? 1)));
    filters.push("[" + i + ":v:0]trim=start=" + sourceIn + ":duration=" + duration + ",setpts=PTS-STARTPTS,eq=brightness=" + (brightness - 1) + ":contrast=" + contrast + ":saturation=" + saturation + ",scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v" + i + "]");
    let hasAudio = false;
    try {
      const probeArgs = ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", clip.mediaPath];
      const probe = await runBinaryOutput(ffprobe, probeArgs);
      hasAudio = Boolean(probe.stdout.trim());
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
  if (!filePath || typeof filePath !== "string") throw new Error("Select a valid local video file first.");
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error("The selected video file could not be found.");
  const ffmpeg = binaryPath("ffmpeg", ffmpegPackage);
  const ffprobe = binaryPath("ffprobe", ffprobePackage.path);

  // All analysis happens on this PC. FFmpeg's scene-change detector is CPU-based
  // and does not upload, transmit, or otherwise send the source video anywhere.
  const probe = await runBinaryOutput(ffprobe, [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
    "-of", "json", filePath
  ]);
  let mediaInfo;
  try { mediaInfo = JSON.parse(probe.stdout); }
  catch { throw new Error("Could not read this video's metadata. Try an MP4 or MOV file."); }
  const duration = Number(mediaInfo?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("The video has no readable duration.");
  const videoStream = (mediaInfo.streams || []).find((stream) => stream.codec_type === "video");
  if (!videoStream) throw new Error("The selected file does not contain a video stream.");

  const detection = await runBinaryOutput(ffmpeg, [
    "-hide_banner", "-i", filePath, "-an",
    "-vf", "select='gt(scene,0.30)',showinfo",
    "-vsync", "vfr", "-f", "null", "-"
  ]);
  const timestamps = [];
  const pattern = /pts_time:\s*([0-9]+(?:\.[0-9]+)?)/g;
  let match;
  while ((match = pattern.exec(detection.stderr)) !== null) {
    const time = Number(match[1]);
    if (Number.isFinite(time) && time > 0.15 && time < duration - 0.15) timestamps.push(time);
  }
  const boundaries = [0, ...[...new Set(timestamps.map((time) => Number(time.toFixed(3))))].sort((a, b) => a - b), duration];
  const sceneClips = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const sourceStart = boundaries[i];
    const sourceEnd = boundaries[i + 1];
    if (sourceEnd - sourceStart < 0.08) continue;
    sceneClips.push({
      id: "local-scene-" + (i + 1),
      name: "Scene " + (sceneClips.length + 1),
      start: sourceStart,
      source_start: sourceStart,
      source_end: sourceEnd,
      duration: sourceEnd - sourceStart,
      confidence: i === 0 ? 1 : 0.7
    });
  }
  if (!sceneClips.length) sceneClips.push({
    id: "local-scene-1", name: "Scene 1", start: 0, source_start: 0,
    source_end: duration, duration, confidence: 1
  });
  return {
    local: true,
    runId: "local-" + Date.now(),
    analysis: {
      duration,
      width: Number(videoStream.width) || null,
      height: Number(videoStream.height) || null,
      sceneCount: sceneClips.length,
      method: "FFmpeg CPU scene-change detection",
      uploaded: false
    },
    timeline: {
      template: {
        name: "Local AI Scene Analysis",
        tracks: [{ type: "video", clips: sceneClips }]
      }
    }
  };
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
