const { app, BrowserWindow, dialog, ipcMain, protocol, net } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");

app.setName("VidClips");
if (process.platform === "win32") app.setAppUserModelId("com.vidclips.desktop");

protocol.registerSchemesAsPrivileged([{ scheme: "vidclips-media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
const mediaPaths = new Map();
function registerMediaPath(filePath) { const id = randomUUID(); mediaPaths.set(id, filePath); return "vidclips-media://asset/" + id; }

const videoFilters = [{ name: "Media files", extensions: ["mp4", "m4v", "mov", "webm", "mkv", "avi", "ogv", "mpeg", "mpg", "wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "wma"] }, { name: "Video files", extensions: ["mp4", "m4v", "mov", "webm", "mkv", "avi", "ogv", "mpeg", "mpg"] }, { name: "Audio files", extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "wma"] }, { name: "All files", extensions: ["*"] }];


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
ipcMain.handle("vidclips:audio-waveform", async (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") throw new Error("Select a valid media file.");
  if (!await fs.stat(filePath).then((info) => info.isFile()).catch(() => false)) throw new Error("The audio source file could not be found.");
  const ffmpeg = binaryPath("ffmpeg", ffmpegPackage);
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-v", "error", "-i", filePath, "-vn", "-ac", "1", "-ar", "1000", "-f", "s16le", "pipe:1"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let bytes = 0;
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) { child.kill(); reject(new Error("Audio waveform extraction exceeded the 64 MB safety limit.")); return; }
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || "This file has no readable audio stream."));
      const pcm = Buffer.concat(chunks);
      const sampleCount = Math.floor(pcm.length / 2);
      if (!sampleCount) return reject(new Error("No audio samples were found in this file."));
      const windowSize = 64;
      const peaks = [];
      for (let start = 0; start < sampleCount; start += windowSize) {
        let peak = 0;
        const end = Math.min(sampleCount, start + windowSize);
        for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)) / 32768);
        peaks.push(Math.max(0.035, Math.min(1, peak)));
      }
      resolve(peaks);
    });
  });
});

ipcMain.handle("vidclips:export-mp4", async (_event, project) => {
  const all = (Array.isArray(project?.clips) ? project.clips : []).filter((clip) => clip.mediaPath && Number(clip.duration) > 0 && !clip.aiGenerated);
  const videos = all.filter((clip) => clip.track === "V1" && !clip.audioOnly).sort((a, b) => Number(a.start) - Number(b.start));
  if (!videos.length) throw new Error("Add at least one video clip to V1 before exporting an MP4.");
  const save = await dialog.showSaveDialog({ defaultPath: (project.projectName || "VidClips export").replace(/[<>:"/\\|?*]/g, "-") + ".mp4", filters: [{ name: "MP4 video", extensions: ["mp4"] }] });
  if (save.canceled || !save.filePath) return { canceled: true };
  const ffmpeg = binaryPath("ffmpeg", ffmpegPackage);
  const args = ["-y"];
  const sources = [];
  for (const clip of all) {
    if (!await fs.stat(clip.mediaPath).then(() => true).catch(() => false)) throw new Error("Source file not found: " + clip.mediaPath);
    const index = sources.length;
    sources.push(clip);
    args.push("-i", clip.mediaPath);
  }
  const filters = [];
  const videoSegments = [];
  let cursor = 0;
  for (let i = 0; i < videos.length; i++) {
    const clip = videos[i], input = sources.findIndex((source) => source === clip);
    const start = Math.max(cursor, Number(clip.start) || 0);
    const gap = start - cursor;
    if (gap > 0.001) {
      filters.push("color=c=black:s=1280x720:r=30:d=" + gap + ",format=yuv420p,setpts=PTS-STARTPTS[vblank" + i + "]");
      videoSegments.push("[vblank" + i + "]");
    }
    const duration = Math.max(0.05, Number(clip.duration));
    const sourceIn = Math.max(0, Number(clip.sourceIn) || 0);
    const brightness = Math.max(0, Math.min(2, Number(clip.brightness ?? 1))) - 1;
    const contrast = Math.max(0, Math.min(2, Number(clip.contrast ?? 1)));
    const saturation = Math.max(0, Math.min(2, Number(clip.saturation ?? 1)));
    const hue = Math.max(-180, Math.min(180, Number(clip.hue ?? 0)));
    const blur = Math.max(0, Math.min(10, Number(clip.blur ?? 0)));
    const colorFilters = "eq=brightness=" + brightness + ":contrast=" + contrast + ":saturation=" + saturation + ",hue=h=" + hue + ",gblur=sigma=" + blur;
    filters.push("[" + input + ":v:0]trim=start=" + sourceIn + ":duration=" + duration + ",setpts=PTS-STARTPTS," + colorFilters + ",scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[vclip" + i + "]");
    videoSegments.push("[vclip" + i + "]");
    cursor = start + duration;
  }
  const totalDuration = Math.max(cursor, ...all.map((clip) => (Number(clip.start) || 0) + Number(clip.duration)));
  filters.push(videoSegments.join("") + "concat=n=" + videoSegments.length + ":v=1:a=0[outv]");
  const audioInputs = [];
  const linkedVideoIds = new Set(all.filter((clip) => clip.linkedVideoId != null && clip.track.startsWith("A")).map((clip) => clip.linkedVideoId));
  for (let i = 0; i < all.length; i++) {
    const clip = all[i];
    const isAudio = clip.track.startsWith("A") || clip.audioOnly || clip.separatedStem;
    if (!isAudio) {
      if (!linkedVideoIds.has(clip.id)) {
        const probe = await runBinaryOutput(binaryPath("ffprobe", ffprobePackage.path), ["-v","error","-select_streams","a:0","-show_entries","stream=index","-of","csv=p=0",clip.mediaPath]).catch(() => ({stdout:""}));
        if (probe.stdout.trim()) {
          const label = "audsrc" + i;
          filters.push("[" + i + ":a:0]atrim=start=" + Math.max(0, Number(clip.sourceIn) || 0) + ":duration=" + Number(clip.duration) + ",asetpts=PTS-STARTPTS,adelay=" + Math.round(Math.max(0, Number(clip.start) || 0) * 1000) + "|" + Math.round(Math.max(0, Number(clip.start) || 0) * 1000) + ",volume=" + Math.max(0, Math.min(1, Number(clip.gain ?? 1))) + (clip.muted ? ",volume=0" : "") + "[ " + label + " ]".replace(/ /g,""));
          audioInputs.push("[" + label + "]");
        }
      }
      continue;
    }
    const label = "audsrc" + i;
    const sourceIn = Math.max(0, Number(clip.sourceIn) || 0);
    const duration = Math.max(0.05, Number(clip.duration));
    const delay = Math.round(Math.max(0, Number(clip.start) || 0) * 1000);
    const gain = clip.muted ? 0 : Math.max(0, Math.min(4, Number(clip.gain ?? 1)));
    const stream = await runBinaryOutput(binaryPath("ffprobe", ffprobePackage.path), ["-v","error","-select_streams","a:0","-show_entries","stream=index","-of","csv=p=0",clip.mediaPath]).catch(() => ({stdout:""}));
    if (!stream.stdout.trim()) continue;
    filters.push("[" + i + ":a:0]atrim=start=" + sourceIn + ":duration=" + duration + ",asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=" + gain + ",adelay=" + delay + "|" + delay + "[" + label + "]");
    audioInputs.push("[" + label + "]");
  }
  if (audioInputs.length) {
    filters.push(audioInputs.join("") + "amix=inputs=" + audioInputs.length + ":duration=longest:dropout_transition=0,apad,atrim=duration=" + totalDuration + ",asetpts=PTS-STARTPTS[outa]");
  } else {
    filters.push("anullsrc=r=48000:cl=stereo,atrim=duration=" + totalDuration + "[outa]");
  }
  args.push("-filter_complex", filters.join(";"), "-map", "[outv]", "-map", "[outa]", "-t", String(totalDuration), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", save.filePath);
  await runBinary(ffmpeg, args);
  return { canceled: false, filePath: save.filePath, clips: videos.length, audioClips: audioInputs.length };
});

ipcMain.handle("vidclips:analyze-video", async (event, filePath, options = {}) => {
  if (!filePath || typeof filePath !== "string") throw new Error("Select a valid local video file first.");
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error("The selected video file could not be found.");

  // The desktop invokes the root repository's Python pipeline with a local
  // filesystem path. It never calls the hosted website/backend or uploads media.
  const repoRoot = app.isPackaged
    ? path.join(process.resourcesPath, "vidclips-ai")
    : path.resolve(__dirname, "../..");
  const script = path.join(repoRoot, "scripts", "desktop_analyze_video.py");
  const pythonCandidates = process.platform === "win32"
    ? [process.env.VIDCLIPS_PYTHON, ...(!app.isPackaged ? [path.join(repoRoot, ".venv", "Scripts", "python.exe")] : []), "python", "py"]
    : [process.env.VIDCLIPS_PYTHON, ...(!app.isPackaged ? [path.join(repoRoot, ".venv", "bin", "python")] : []), "python3", "python"];
  let python = null;
  for (const candidate of pythonCandidates) {
    if (!candidate) continue;
    if (!candidate.includes(path.sep) && !candidate.includes("/")) { python = candidate; break; }
    if (await fs.stat(candidate).then((info) => info.isFile()).catch(() => false)) { python = candidate; break; }
  }
  if (!python) throw new Error("Python 3.11+ was not found. Install Python and the repository requirements, or set VIDCLIPS_PYTHON to your Python executable.");
  if (!await fs.stat(script).then(() => true).catch(() => false)) {
    throw new Error("The local AI pipeline files are missing. In the source checkout, keep the scripts and app folders beside desktop.");
  }

  const analyzerNames = Array.isArray(options?.analyzers) && options.analyzers.length
    ? options.analyzers.join(",")
    : "scene_detection,camera_motion,color_grading";
  const args = python === "py"
    ? ["-3", script, "--video", filePath, "--device", "cpu", "--analyzers", analyzerNames]
    : [script, "--video", filePath, "--device", "cpu", "--analyzers", analyzerNames];

  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { cwd: repoRoot, windowsHide: true, env: { ...process.env, PYTHONUNBUFFERED: "1", VIDCLIPS_DEVICE: "cpu", PYTHONPATH: repoRoot, PATH: [path.dirname(binaryPath("ffmpeg", ffmpegPackage)), path.dirname(binaryPath("ffprobe", ffprobePackage.path)), process.env.PATH || ""].join(path.delimiter), VIDCLIPS_OUTPUTS_DIR: path.join(app.getPath("userData"), "outputs"), VIDCLIPS_MODELS_DIR: path.join(app.getPath("userData"), "models"), VIDCLIPS_CHECKPOINTS_DIR: path.join(app.getPath("userData"), "checkpoints") } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout = (stdout + text).slice(-2_000_000);
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) event.sender.send("vidclips:analysis-progress", line.trim());
      }
    });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-100_000); });
    child.on("error", (error) => reject(new Error("Could not start local Python analysis. Install Python 3.11+ and project requirements. " + error.message)));
    child.on("close", (code) => {
      const resultLine = stdout.split(/\r?\n/).reverse().find((line) => line.startsWith("VIDCLIPS_RESULT:"));
      if (resultLine) {
        try {
          const result = JSON.parse(resultLine.slice("VIDCLIPS_RESULT:".length));
          if (result.ok) return resolve(result);
          return reject(new Error(result.error || "Local AI analysis failed."));
        } catch (error) {
          return reject(new Error("Could not read the local AI analysis result: " + error.message));
        }
      }
      if (code === 0) return reject(new Error("Python analysis finished without returning a timeline."));
      const diagnostic = stderr.trim() || stdout.trim() || ("Python exited with code " + code);
      if (/No module named|ModuleNotFoundError|ImportError/i.test(diagnostic)) {
        return reject(new Error("The local AI dependencies are not installed. Open a terminal in the repository root and run: python -m pip install -r requirements.txt. Details: " + diagnostic.slice(-1400)));
      }
      return reject(new Error(diagnostic.slice(-2500)));
    });
  });
});

ipcMain.handle("vidclips:analyze-audio", async (event, filePath) => {
  if (!filePath || typeof filePath !== "string") throw new Error("Select a local audio or video file first.");
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error("The selected media file could not be found.");
  const repoRoot = app.isPackaged ? path.join(process.resourcesPath, "vidclips-ai") : path.resolve(__dirname, "../..");
  const script = path.join(repoRoot, "scripts", "desktop_analyze_audio.py");
  if (!await fs.stat(script).then((info) => info.isFile()).catch(() => false)) throw new Error("The local Audio Analyser script is missing.");
  const pythonCandidates = process.platform === "win32"
    ? [process.env.VIDCLIPS_PYTHON, ...(!app.isPackaged ? [path.join(repoRoot, ".venv", "Scripts", "python.exe")] : []), "python", "py"]
    : [process.env.VIDCLIPS_PYTHON, ...(!app.isPackaged ? [path.join(repoRoot, ".venv", "bin", "python")] : []), "python3", "python"];
  let python = null;
  for (const candidate of pythonCandidates) {
    if (!candidate) continue;
    if (!candidate.includes(path.sep) && !candidate.includes("/")) { python = candidate; break; }
    if (await fs.stat(candidate).then((info) => info.isFile()).catch(() => false)) { python = candidate; break; }
  }
  if (!python) throw new Error("Python 3.11+ was not found. Install the local VidClips AI requirements.");
  const args = python === "py" ? ["-3", script, "--media", filePath] : [script, "--media", filePath];
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { cwd: repoRoot, windowsHide: true, env: {
      ...process.env, PYTHONUNBUFFERED: "1", VIDCLIPS_DEVICE: "cpu", PYTHONPATH: repoRoot,
      VIDCLIPS_OUTPUTS_DIR: path.join(app.getPath("userData"), "outputs"),
      VIDCLIPS_MODELS_DIR: path.join(app.getPath("userData"), "models"),
      PATH: [path.dirname(binaryPath("ffmpeg", ffmpegPackage)), process.env.PATH || ""].join(path.delimiter)
    }});
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => {
      const value = chunk.toString(); stdout = (stdout + value).slice(-2_000_000);
      for (const line of value.split(/\r?\n/)) if (line.trim()) event.sender.send("vidclips:analysis-progress", line.trim());
    });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-100_000); });
    child.on("error", (error) => reject(new Error("Could not start local Audio Analyser: " + error.message)));
    child.on("close", (code) => {
      const line = stdout.split(/\r?\n/).reverse().find((value) => value.startsWith("VIDCLIPS_AUDIO_RESULT:"));
      if (line) {
        try { const result = JSON.parse(line.slice("VIDCLIPS_AUDIO_RESULT:".length)); if (result.ok) return resolve(result); return reject(new Error(result.error || "Audio analysis failed.")); }
        catch (error) { return reject(new Error("Could not read audio analysis result: " + error.message)); }
      }
      reject(new Error((stderr || stdout || "Audio analysis exited with code " + code).slice(-2200)));
    });
  });
});

ipcMain.handle("vidclips:open-media", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"], filters: videoFilters });
  if (result.canceled) return [];
  return result.filePaths.map((filePath) => ({ path: filePath, name: path.basename(filePath), kind: /\.(wav|mp3|m4a|aac|flac|ogg|opus|wma)$/i.test(filePath) ? "audio" : "video", url: registerMediaPath(filePath) }));
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
    icon: path.join(__dirname, "../assets/vidclips.ico"),
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
