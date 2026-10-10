# VidClips Desktop (Windows)

VidClips Desktop is a separate Electron application in this folder. It does not replace the GitHub Pages website or change the deployed Render backend.

## Requirements
- Windows 10/11
- Node.js 20 LTS or newer
- npm

## Run in development
Open PowerShell in this `desktop` folder:

```powershell
npm install
npm run dev
```

## Build a Windows installer
```powershell
npm install
npm run dist:win
```

The installer should be generated under `desktop/release/`. A Windows GitHub Actions workflow also builds the installer and uploads it as an artifact when manually run or when desktop files change.

## Current status and limitations
- Native Windows file picker for importing videos.
- HTML video preview for codecs supported by the Electron/Chromium build.
- Basic multitrack timeline, clip selection, splitting, deleting, nudging, and zoom.
- Save/open project JSON through native dialogs. Source media paths are stored, so the original media files must remain at those paths.
- This is still an early editor: the timeline is not yet a complete nonlinear editor. Drag-to-move/trim, reliable cross-clip playback, effects, audio editing, AI-driven timeline generation, and MP4 rendering are not implemented yet. Do not treat a JSON project export as a rendered video.

## Architecture
- Electron main process: `electron/main.cjs`
- Restricted preload bridge: `electron/preload.cjs`
- React UI: `src/main.jsx`
- Styling: `src/styles.css`
- Vite build output: `dist/`
