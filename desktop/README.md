# VidClips (Windows)

VidClips is the Windows Electron editor in this folder. It does not replace the GitHub Pages website or call the hosted Render backend for local video analysis. Selected video files are passed by local filesystem path to the Python pipeline in the repository root.

## Requirements

- Windows 10/11, 64-bit
- Node.js 20 LTS or newer
- Python 3.11 x64 (recommended) or Python 3.12
- Several GB of free disk space for the Python environment and model caches
- Internet access for the initial Python package/model downloads only; source videos remain local

## First-time setup for local AI

From PowerShell in the repository's `desktop` folder:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup-ai.ps1
npm install
npm run dev
```

The setup script creates a repository-local `.venv` and installs the root `requirements.txt`. It can take a long time and use several GB. If the script cannot find Python 3.11, install 64-bit Python 3.11 and select **Add python.exe to PATH**.

For manual setup, from the repository root:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The app defaults to CPU analysis: scene cuts, camera motion, and color analysis. The sidebar lets you select optional local analyzers for object detection (YOLO), face/pose/hands, person segmentation, depth (MiDaS), and audio/beat/speech analysis. OCR is intentionally not included. Heavy analyzers may be slow on CPU; first use may download model weights. Audio diarization may require a Hugging Face account/token and model-license acceptance; it can fail independently while the rest of the results are still returned.

Analysis JSON and model caches are saved under Electron's writable user-data folder (in development and packaged runs), so the installed app does not try to write inside Program Files. The root Python CLI, when run manually outside Electron, uses the repository's configured outputs directory.

## Run in development

```powershell
npm install
npm run dev
```

## Build a Windows installer

```powershell
npm install
npm run dist:win
```

The installer is generated under `desktop/release/`. The Windows installer workflow is **manual-only**: it does not build on every push. Trigger it from GitHub Actions with **Run workflow**, or use the Colab notebook at `tools/VidClips_Windows_Build.ipynb` to request a build and download the installer artifact. The notebook needs a GitHub token with Actions read/write and repository contents read permissions.

## Audio playback and Audio Analyser

The desktop timeline supports importing local audio-only media and plays A1 audio clips against the shared timeline playhead. Imported video receives a separate linked A1 audio clip so its audio can remain on the timeline when the video clip is deleted. Audio clips have independent volume and mute controls, and overlapping clips can play together.

Use **Audio Analyse** on an imported desktop media clip to run the local CPU analysis entry point. It extracts audio with FFmpeg, estimates waveform volume/silence/tempo/beats, runs Whisper transcription with word timestamps, and creates generic sound-transient candidates. When Demucs is installed, the analyser also attempts local vocals/drums/bass/other stem separation; first use can download a large model and be slow on CPU.

Important limits: transient candidates are not reliable semantic labels such as footsteps or explosions. The current Demucs output is four music/vocal-oriented stems, not dedicated speech/music/SFX tracks. Timeline audio playback is implemented, but MP4 export still needs a full timeline-aware audio mix to reproduce all independent clips and overlaps exactly.

## Current capabilities and honest limitations

- Native Windows file picker and HTML video preview for codecs supported by Electron/Chromium.
- Editable multitrack timeline with scene clips plus visible AI effect, transition, and beat markers where the analyzers return them.
- Existing root Python analyzers are invoked locally on CPU; results include analyzer statuses and saved JSON output paths.
- Save/open project JSON, clip split/move, and basic FFmpeg MP4 export.
- The installer bundles the Python **source** and FFmpeg binaries, but it does not yet embed a complete Python interpreter or all third-party Python packages. The local AI pipeline therefore requires Python 3.11/3.12 and the requirements installed on the machine. A fully self-contained installer remains future packaging work.
- The timeline/exporter is still an early editor, not a full nonlinear editor: MP4 export currently concatenates V1 clips and applies basic color controls; it does not yet reproduce every timeline gap, overlap, AI marker, or effect as a rendered transition.
- Model-backed features can fail individually when packages, weights, disk space, or required external model access are missing. Check the analyzer status in the results JSON rather than assuming every selected model succeeded.

## Architecture

- Electron main process: `electron/main.cjs`
- Restricted preload bridge: `electron/preload.cjs`
- React UI: `src/main.jsx`
- Local AI CLI bridge: root `scripts/desktop_analyze_video.py`
- Existing Python pipeline: root `app/pipelines/`, `app/analyzers/`, and `app/exporters/`
- Vite build output: `dist/`


## Branding and build-on-demand

The app's native Windows icon is generated from `assets/vidclips.svg` by `scripts/generate-icon.cjs` before development and production builds. The installer product name is `VidClips`. Windows installers are only built when the GitHub Actions workflow is manually triggered; pushes do not create installers automatically.

Google Colab runs Linux, so it should trigger the repository's Windows GitHub Actions runner rather than attempt to build a native Windows installer directly. Open `tools/VidClips_Windows_Build.ipynb` in Colab, run its cells, and paste a short-lived GitHub token only when prompted. The notebook requests a Windows build, waits for completion, then downloads the installer artifact.
