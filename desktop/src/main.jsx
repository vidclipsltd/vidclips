import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Film, FolderOpen, Plus, Play, Pause, Scissors, Trash2, ChevronLeft,
  ChevronRight, ZoomIn, ZoomOut, Save, MonitorPlay, AudioLines, MousePointer2
} from "lucide-react";
import "./styles.css";

const initialClips = [
  { id: 1, name: "Opening shot", track: "V1", start: 0, duration: 5.2, color: "purple" },
  { id: 2, name: "City B-roll", track: "V1", start: 5.4, duration: 6.8, color: "blue" },
  { id: 3, name: "Close-up", track: "V1", start: 12.5, duration: 4.4, color: "teal" },
  { id: 4, name: "Music bed", track: "A1", start: 0, duration: 17, color: "green" }
];

function App() {
  const [clips, setClips] = useState(initialClips);
  const [selected, setSelected] = useState(2);
  const [playhead, setPlayhead] = useState(5.4);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [projectName, setProjectName] = useState("Untitled project");
  const [notice, setNotice] = useState("Desktop workspace ready");
  const [mediaFiles, setMediaFiles] = useState([]);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  const selectedClip = clips.find((clip) => clip.id === selected);
  const totalDuration = Math.max(20, ...clips.map((clip) => clip.start + clip.duration));
  const pixelsPerSecond = 52 * zoom;
  const ticks = useMemo(() => Array.from({ length: Math.ceil(totalDuration / 2) + 1 }, (_, i) => i * 2), [totalDuration]);

  function importMedia(event) {
    const files = Array.from(event.target.files || []);
    const videos = files.filter((file) => file.type.startsWith("video/"));
    if (!videos.length) {
      setNotice("Choose a video file such as MP4, MOV, or WebM");
      event.target.value = "";
      return;
    }
    const imported = videos.map((file) => ({
      id: null,
      name: file.name.replace(/\\.[^.]+$/, ""),
      fileName: file.name,
      url: URL.createObjectURL(file),
      file
    }));
    setMediaFiles((items) => [...items, ...imported]);
    imported.forEach((item) => {
      const file = item.file;
      const url = item.url;
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.src = url;
      probe.onloadedmetadata = () => {
        const duration = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 4;
        const nextId = Math.max(0, ...clips.map((clip) => clip.id)) + 1;
        const clip = { id: nextId, name: file.name, fileName: file.name, mediaUrl: url, track: "V1", start: Math.max(0, playhead), duration, color: "blue" };
        setClips((items) => [...items, clip]);
        setSelected(nextId);
        setPlayhead(clip.start);
        setNotice("Imported " + file.name + " to the timeline");
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        setNotice("Could not read " + file.name + ". Try an MP4 video.");
      };
    });
    setNotice("Loading video metadata…");
    event.target.value = "";
  }

  function addClip(track = "V1") {
    const nextId = Math.max(0, ...clips.map((clip) => clip.id)) + 1;
    const nextStart = track === "A1" ? 0 : Math.max(0, playhead);
    const clip = { id: nextId, name: track === "A1" ? "Audio clip" : "New video clip", track, start: nextStart, duration: 4, color: track === "A1" ? "green" : "blue" };
    setClips((items) => [...items, clip]);
    setSelected(nextId);
    setNotice("Added a new timeline clip");
  }

  function splitSelected() {
    if (!selectedClip || playhead <= selectedClip.start + 0.15 || playhead >= selectedClip.start + selectedClip.duration - 0.15) {
      setNotice("Move the playhead inside the selected clip to split it");
      return;
    }
    const leftDuration = playhead - selectedClip.start;
    const right = { ...selectedClip, id: Math.max(0, ...clips.map((c) => c.id)) + 1, name: selectedClip.name + " (split)", start: playhead, duration: selectedClip.duration - leftDuration };
    setClips((items) => items.flatMap((clip) => clip.id === selectedClip.id ? [{ ...clip, duration: leftDuration }, right] : [clip]));
    setSelected(right.id);
    setNotice("Clip split at the playhead");
  }

  function deleteSelected() {
    if (!selectedClip) return;
    setClips((items) => items.filter((clip) => clip.id !== selected));
    setSelected(null);
    setNotice("Selected clip deleted");
  }

  function nudgeSelected(amount) {
    if (!selectedClip) return;
    setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, start: Math.max(0, clip.start + amount) } : clip));
    setNotice(amount < 0 ? "Moved clip earlier" : "Moved clip later");
  }

  function saveProject() {
    const project = { app: "VidClips Desktop", version: 1, projectName, clips, playhead };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".vidclips.json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Project file downloaded");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Film size={19} /></div><span>VidClips</span><span className="desktop-tag">DESKTOP</span></div>
        <div className="project-title"><input aria-label="Project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} /><span>Saved locally when exported</span></div>
        <div className="top-actions"><button className="button quiet" onClick={() => addClip("V1")}><Plus size={16} /> Add clip</button><button className="button primary" onClick={saveProject}><Save size={16} /> Save project</button></div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <button className="nav-item active"><FolderOpen size={17} /> Media</button>
          <button className="nav-item" onClick={() => setNotice("Effects panel will be added after core timeline editing")}><MonitorPlay size={17} /> Effects</button>
          <div className="side-section"><div className="section-label">PROJECT MEDIA</div><div className="media-card"><div className="media-thumb"><Film size={22} /></div><div><strong>Sample sequence</strong><small>Timeline demo · 17 sec</small></div></div>{mediaFiles.map((item, index) => <button className="media-card imported-media" key={item.url + index} onClick={() => { const clip = clips.find((c) => c.mediaUrl === item.url); if (clip) { setSelected(clip.id); setPlayhead(clip.start); } }}><div className="media-thumb"><Film size={22} /></div><div><strong>{item.name}</strong><small>{item.fileName}</small></div></button>)}<button className="import-button" onClick={() => fileInputRef.current?.click()}><Plus size={15} /> Import video</button><input ref={fileInputRef} type="file" accept="video/*,.mp4,.mov,.webm,.mkv" multiple hidden onChange={importMedia} /></div>
          <div className="sidebar-bottom"><span className="status-dot" /> Desktop app prototype</div>
        </aside>

        <main className="main-area">
          <div className="upper-workspace">
            <section className="preview-panel">
              <div className="panel-heading"><span>PREVIEW</span><span className="muted">Program monitor</span></div>
              <div className="preview-screen">
                {selectedClip?.mediaUrl ? (
                  <video
                    key={selectedClip.id}
                    ref={videoRef}
                    className="video-preview"
                    src={selectedClip.mediaUrl}
                    controls
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const localTime = Math.max(0, Math.min(selectedClip.duration, playhead - selectedClip.start));
                      if (Number.isFinite(localTime)) e.currentTarget.currentTime = localTime;
                    }}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                    onTimeUpdate={(e) => {
                      const nextTime = selectedClip.start + e.currentTarget.currentTime;
                      setPlayhead(Math.min(selectedClip.start + selectedClip.duration, nextTime));
                    }}
                    onError={() => setNotice("This video format/codec could not be played. Try an MP4 encoded with H.264 video and AAC audio.")}
                  />
                ) : (
                  <>
                    <div className="preview-art"><div className="sun" /><div className="mountain mountain-back" /><div className="mountain mountain-front" /><div className="preview-caption">YOUR STORY STARTS HERE</div></div>
                    <div className="preview-overlay">Import a video, then select its timeline clip</div>
                  </>
                )}
              </div>
              <div className="transport"><span className="timecode">{formatTime(playhead)} <span>/</span> {formatTime(totalDuration)}</span><div className="transport-controls"><button title="Previous second" onClick={() => setPlayhead(Math.max(0, playhead - 1))}><ChevronLeft size={18} /></button><button className="play-button" onClick={() => { if (selectedClip?.mediaUrl && videoRef.current) { if (videoRef.current.paused) { videoRef.current.play().catch(() => setNotice("Playback failed. Try an MP4 encoded with H.264 video and AAC audio.")); } else { videoRef.current.pause(); } } else { setNotice("Select an imported video clip to play it"); } }} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button><button title="Next second" onClick={() => setPlayhead(Math.min(totalDuration, playhead + 1))}><ChevronRight size={18} /></button></div><span className="preview-quality">FIT · 100%</span></div>
            </section>

            <section className="inspector-panel">
              <div className="panel-heading"><span>INSPECTOR</span><span className="muted">Clip properties</span></div>
              {selectedClip ? <div className="inspector-content"><div className={"inspector-color " + selectedClip.color}><Film size={22} /></div><label>Clip name<input value={selectedClip.name} onChange={(e) => setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, name: e.target.value } : clip))} /></label><div className="property-grid"><label>Track<input value={selectedClip.track} readOnly /></label><label>Duration<input value={selectedClip.duration.toFixed(2) + " s"} readOnly /></label><label>Start<input value={selectedClip.start.toFixed(2) + " s"} readOnly /></label><label>End<input value={(selectedClip.start + selectedClip.duration).toFixed(2) + " s"} readOnly /></label></div><div className="inspector-hint">{selectedClip.fileName ? "Imported media: " + selectedClip.fileName : "Select a clip on the timeline to edit its properties."}</div></div> : <div className="empty-inspector">Select a clip to inspect it.</div>}
            </section>
          </div>

          <section className="timeline-panel">
            <div className="timeline-toolbar"><div className="timeline-title"><span>TIMELINE</span><span className="muted">{clips.length} clips</span></div><div className="edit-tools"><button title="Split selected clip at playhead" onClick={splitSelected}><Scissors size={16} /> Split</button><button title="Move clip earlier" onClick={() => nudgeSelected(-0.5)}><ChevronLeft size={16} /></button><button title="Move clip later" onClick={() => nudgeSelected(0.5)}><ChevronRight size={16} /></button><button title="Delete selected clip" onClick={deleteSelected}><Trash2 size={16} /></button><span className="tool-divider" /><button title="Zoom out" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}><ZoomOut size={16} /></button><span className="zoom-label">{Math.round(zoom * 100)}%</span><button title="Zoom in" onClick={() => setZoom(Math.min(2, zoom + 0.25))}><ZoomIn size={16} /></button></div></div>
            <div className="timeline-scroll"><div className="timeline-inner" style={{ width: 176 + totalDuration * pixelsPerSecond }}>
              <div className="ruler-row"><div className="track-label ruler-label"><MousePointer2 size={14} /> Time</div><div className="ruler" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setPlayhead(Math.max(0, Math.min(totalDuration, (e.clientX - rect.left) / pixelsPerSecond))); }}>{ticks.map((tick) => <div key={tick} className="tick" style={{ left: tick * pixelsPerSecond }}><span>{formatTime(tick)}</span></div>)}</div></div>
              {["V1", "V2", "A1"].map((track) => <div className="track-row" key={track}><div className="track-label"><strong>{track}</strong><span>{track.startsWith("A") ? <AudioLines size={15} /> : <Film size={15} />}</span></div><div className={"track-lane " + (track.startsWith("A") ? "audio-lane" : "")}>{clips.filter((clip) => clip.track === track).map((clip) => <button key={clip.id} className={"clip-block " + clip.color + (selected === clip.id ? " selected" : "")} style={{ left: clip.start * pixelsPerSecond, width: Math.max(38, clip.duration * pixelsPerSecond) }} onClick={() => { setSelected(clip.id); setNotice("Selected " + clip.name); }} title={clip.name + " · " + clip.duration.toFixed(2) + " sec"}><span className="clip-icon">{track.startsWith("A") ? <AudioLines size={13} /> : <Film size={13} />}</span><span className="clip-name">{clip.name}</span><span className="clip-duration">{clip.duration.toFixed(1)}s</span></button>)}</div></div>)}
              <div className="playhead-line" style={{ left: 176 + playhead * pixelsPerSecond }}><div className="playhead-cap" /></div>
            </div></div>
            <div className="timeline-footer"><span className="notice">{notice}</span><span>Playhead <strong>{formatTime(playhead)}</strong></span><button onClick={() => addClip("A1")}><Plus size={14} /> Add audio track clip</button></div>
          </section>
        </main>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds || 0);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * 30);
  return String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0") + ":" + String(frames).padStart(2, "0");
}

createRoot(document.getElementById("root")).render(<App />);