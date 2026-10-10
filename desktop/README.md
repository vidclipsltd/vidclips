# VidClips Desktop (Windows)

VidClips Desktop is a separate Electron editor in this folder. It does not replace the GitHub Pages website or call the hosted Render backend for local video analysis. Selected video files are passed by local filesystem path to the Python pipeline in the repository root.

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

The installer is generated under `desktop/release/`. GitHub Actions builds the Electron installer and uploads it as an artifact when desktop files change or the workflow is manually run.

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
