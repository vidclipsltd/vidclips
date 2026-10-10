# VidClips Desktop (Windows)

This is a **separate Electron desktop app**. It lives in `desktop/` and does not replace or change the existing website deployment.

## Requirements
- Windows 10 or Windows 11
- Node.js 20 LTS or newer
- npm (included with Node.js)

## Run in development
Open PowerShell in the repository's `desktop` folder:

```powershell
npm install
npm run dev
```

## Build a Windows installer
Run in the same folder:

```powershell
npm install
npm run dist:win
```

The installer will be created in `desktop/release/`.

## Current prototype
The desktop shell includes a selectable multi-track timeline, playhead/ruler seeking, add clip, split selected clip at the playhead, delete, nudge clips earlier/later, editable clip names, zoom, and export of the timeline structure as a JSON project file.

The preview is currently a placeholder. Local media import, real video playback, project reopening, drag-to-trim, and MP4 rendering are follow-up milestones. This prototype does not yet claim to render an edited video.

## Architecture
- Electron main process: `electron/main.cjs`
- React UI: `src/main.jsx`
- Styling: `src/styles.css`
- Vite build output: `dist/`

The app is packaged independently from the existing GitHub Pages website and Render backend.