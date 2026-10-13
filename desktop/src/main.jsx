import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Film, FolderOpen, Plus, Play, Pause, Scissors, Trash2, ChevronLeft,
  ChevronRight, ZoomIn, ZoomOut, Save, MonitorPlay, AudioLines, MousePointer2
} from "lucide-react";
import "./styles.css";

const initialClips = [];

function App() {
  const [clips, setClips] = useState(initialClips);
  const [isSignedIn, setIsSignedIn] = useState(() => window.localStorage.getItem("vidclips:first-run-complete") === "true");
  const [loginName, setLoginName] = useState(() => window.localStorage.getItem("vidclips:profile-name") || "");
  const [loginEmail, setLoginEmail] = useState(() => window.localStorage.getItem("vidclips:profile-email") || "");
  const [selected, setSelected] = useState(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [analysisOptions, setAnalysisOptions] = useState(["scene_detection", "camera_motion", "color_grading"]);
  const [zoom, setZoom] = useState(1);
  const [projectName, setProjectName] = useState("Untitled project");
  const [notice, setNotice] = useState("Desktop workspace ready");
  const [mediaFiles, setMediaFiles] = useState([]);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;
  const audioRefs = useRef(new Map());
  const [audioAnalyzing, setAudioAnalyzing] = useState(false);
  const nextClipIdRef = useRef(1);

  useEffect(() => {
    if (!window.vidclips?.onAnalysisProgress) return undefined;
    return window.vidclips.onAnalysisProgress((message) => {
      setAnalysisProgress(message);
      if (/Starting analyzer:|Collected result:|analysis started|Selected analyzers/i.test(message)) setNotice("AI: " + message);
    });
  }, []);

  const selectedClip = clips.find((clip) => clip.id === selected);
  const previewClip = selectedClip && selectedClip.track.startsWith("V") && !selectedClip.audioOnly
    ? selectedClip
    : clips.find((clip) => clip.track.startsWith("V") && !clip.audioOnly && clip.mediaUrl && playhead >= clip.start && playhead < clip.start + clip.duration);
  const playbackEnd = Math.max(0, ...clips.filter((clip) => !clip.aiGenerated).map((clip) => clip.start + clip.duration));
  const totalDuration = Math.max(20, playbackEnd);
  const pixelsPerSecond = 52 * zoom;
  const ticks = useMemo(() => Array.from({ length: Math.ceil(totalDuration / 2) + 1 }, (_, i) => i * 2), [totalDuration]);

  function importMedia(event) {
    const files = Array.from(event.target.files || []);
    const videoExt = /\.(mp4|m4v|mov|webm|mkv|avi|ogv|mpeg|mpg)$/i;
    const audioExt = /\.(wav|mp3|m4a|aac|flac|ogg|opus|wma)$/i;
    const media = files.filter((file) => (file.type || "").startsWith("video/") || (file.type || "").startsWith("audio/") || videoExt.test(file.name) || audioExt.test(file.name));
    if (!media.length) { setNotice("Choose a video or audio file."); event.target.value = ""; return; }
    media.forEach((file) => {
      const isAudio = (file.type || "").startsWith("audio/") || audioExt.test(file.name);
      const url = URL.createObjectURL(file);
      const probe = document.createElement(isAudio ? "audio" : "video");
      probe.preload = "metadata"; probe.src = url;
      probe.onloadedmetadata = () => {
        const duration = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 4;
        const id = nextClipIdRef.current++;
        const clip = { id, name: file.name.replace(/\.[^.]+$/, ""), fileName: file.name, mediaUrl: url, track: isAudio ? "A1" : "V1", start: Math.max(0, playhead), duration, sourceIn: 0, sourceOut: duration, color: isAudio ? "green" : "blue", audioOnly: isAudio, gain: 1, muted: false };
        setClips((items) => [...items, clip]); setSelected(id); setPlayhead(clip.start);
        setMediaFiles((items) => [...items, { id, url, name: clip.name, fileName: file.name, file }]);
        setNotice("Imported " + file.name + (isAudio ? " as playable audio" : " to V1"));
      };
      probe.onerror = () => { URL.revokeObjectURL(url); setNotice("Could not read metadata for " + file.name); };
    });
    setNotice("Loading media metadata…"); event.target.value = "";
  }

  function addClip(track = "V1") {
    const nextId = Math.max(nextClipIdRef.current++, ...clips.map((clip) => clip.id + 1));
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
    const right = { ...selectedClip, id: nextClipIdRef.current++, name: selectedClip.name + " (split)", start: playhead, duration: selectedClip.duration - leftDuration, sourceIn: (selectedClip.sourceIn || 0) + leftDuration };
    setClips((items) => items.flatMap((clip) => clip.id === selectedClip.id ? [{ ...clip, duration: leftDuration }, right] : [clip]));
    setSelected(right.id);
    setNotice("Clip split at the playhead");
  }

  function deleteSelected() {
    if (!selectedClip) return;
    const deletingVideo = selectedClip.track.startsWith("V") && !selectedClip.audioOnly;
    setClips((items) => items.filter((clip) => clip.id !== selected));
    setSelected(null);
    setNotice(deletingVideo ? "Video deleted; linked audio remains playable on A1." : "Timeline clip deleted; source media was kept.");
  }

  function beginClipDrag(event, clipId) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelected(clipId);
    const originX = event.clientX;
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return;
    const originStart = clip.start;
    const move = (pointerEvent) => {
      const delta = (pointerEvent.clientX - originX) / pixelsPerSecond;
      setClips((items) => items.map((item) => item.id === clipId ? { ...item, start: Math.max(0, originStart + delta) } : item));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      setNotice("Moved " + clip.name + " on the timeline");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  }

  function nudgeSelected(amount) {
    if (!selectedClip) return;
    setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, start: Math.max(0, clip.start + amount) } : clip));
    setNotice(amount < 0 ? "Moved clip earlier" : "Moved clip later");
  }

  async function saveProject() {
    const project = { app: "VidClips", version: 2, projectName, clips: clips.map(({ mediaUrl, ...clip }) => clip), playhead };
    if (window.vidclips?.saveProject) {
      try {
        const result = await window.vidclips.saveProject(project);
        if (!result?.canceled) setNotice("Project saved: " + result.filePath);
      } catch (error) { setNotice("Could not save project: " + error.message); }
      return;
    }
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".vidclips.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Project JSON downloaded (media paths are only reusable in the desktop app)");
  }

  async function importDesktopMedia() {
    if (!window.vidclips?.openMediaFiles) { fileInputRef.current?.click(); return; }
    try {
      const files = await window.vidclips.openMediaFiles();
      for (const file of files || []) {
        const isAudio = file.kind === "audio" || /\.(wav|mp3|m4a|aac|flac|ogg|opus|wma)$/i.test(file.name);
        const probe = document.createElement(isAudio ? "audio" : "video");
        probe.preload = "metadata"; probe.src = file.url;
        probe.onloadedmetadata = () => {
          const duration = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 0;
          if (!duration) { setNotice("Could not read duration for " + file.name); return; }
          const id = nextClipIdRef.current++, start = Math.max(0, playhead);
          const clip = { id, name: file.name.replace(/\.[^.]+$/, ""), fileName: file.name, mediaPath: file.path, mediaUrl: file.url, track: isAudio ? "A1" : "V1", start, duration, sourceIn: 0, sourceOut: duration, color: isAudio ? "green" : "blue", audioOnly: isAudio, gain: 1, muted: false };
          setClips((items) => [...items, clip]); setSelected(id); setPlayhead(start);
          setMediaFiles((items) => [...items, { ...file, id, name: clip.name, url: file.url }]);
          if (window.vidclips?.getAudioWaveform) window.vidclips.getAudioWaveform(file.path).then((waveform) => setClips((items) => items.map((item) => item.id === id ? { ...item, waveform } : item))).catch(() => {});
          if (!isAudio) {
            const audioId = nextClipIdRef.current++;
            const linked = { ...clip, id: audioId, name: clip.name + " audio", track: "A1", color: "green", audioOnly: true, linkedVideoId: id, waveform: null };
            setClips((items) => [...items, linked]);
            if (window.vidclips?.getAudioWaveform) window.vidclips.getAudioWaveform(file.path).then((waveform) => setClips((items) => items.map((item) => item.id === audioId ? { ...item, waveform } : item))).catch(() => {});
          }
          setNotice("Imported " + file.name + (isAudio ? " as playable audio" : " with separate editable audio"));
        };
        probe.onerror = () => setNotice("Cannot read " + file.name + ". Check the media format.");
      }
    } catch (error) { setNotice("Media import failed: " + error.message); }
  }

  async function exportMp4() {
    if (!window.vidclips?.exportMp4) { setNotice("MP4 export is available in the Windows desktop app."); return; }
    setExporting(true);
    setNotice("Preparing timeline for MP4 export…");
    try {
      const result = await window.vidclips.exportMp4({ projectName, clips: clips.map(({ mediaUrl, ...clip }) => clip) });
      if (!result?.canceled) setNotice("MP4 exported: " + result.filePath + " (" + result.clips + " video clips)");
    } catch (error) { setNotice("MP4 export failed: " + (error?.message || String(error))); }
    finally { setExporting(false); }
  }

  async function analyzeSelectedVideo() {
    if (!selectedClip?.mediaPath || selectedClip.audioOnly || !window.vidclips?.analyzeVideo) {
      setNotice("Select an imported desktop video before starting analysis.");
      return;
    }
    setAnalyzing(true);
    setAnalysisProgress("Starting local Python AI pipeline…");
    setNotice("Analyzing locally on this PC using the CPU. Your video is not uploaded…");
    try {
      if (!analysisOptions.length) throw new Error("Select at least one local analyzer.");
      const result = await window.vidclips.analyzeVideo(selectedClip.mediaPath, { analyzers: analysisOptions });
      const template = result?.timeline?.template;
      const sourceTrack = template?.tracks?.find((track) => track.type === "video");
      const sourceCuts = sourceTrack?.clips || [];
      if (!sourceCuts.length) throw new Error("Analysis finished, but no editable scene clips were returned.");
      const original = selectedClip;
      const timelineOffset = Math.max(0, Number(original.start || 0) - Number(original.sourceIn || 0));
      const sceneClips = sourceCuts.map((scene, index) => {
        const sourceIn = Number(scene.source_start ?? scene.start ?? 0);
        const sourceOut = Number(scene.source_end ?? scene.end ?? original.duration);
        const duration = Math.max(0.05, sourceOut - sourceIn);
        return { ...original, id: nextClipIdRef.current++, name: "AI Scene " + (index + 1), track: "V1", start: timelineOffset + sourceIn, duration, sourceIn, sourceOut, color: index % 2 ? "teal" : "blue", aiGenerated: true };
      });
      const templateTracks = template?.tracks || [];
      const effectsTrack = templateTracks.find((track) => track.type === "effects");
      const transitionsTrack = templateTracks.find((track) => track.type === "transitions");
      const effectClips = (effectsTrack?.items || []).filter((item) => Number(item.end) > Number(item.start)).map((item, index) => ({
        id: nextClipIdRef.current++, name: "AI " + String(item.type || "Effect").replace(/_/g, " ") + " " + (index + 1),
        track: "V2", start: timelineOffset + Math.max(0, Number(item.start) || 0), duration: Math.max(0.15, (Number(item.end) || 0) - (Number(item.start) || 0)),
        color: "teal", aiGenerated: true, aiType: item.type, aiData: item
      }));
      const transitionClips = (transitionsTrack?.items || []).map((item, index) => ({
        id: nextClipIdRef.current++, name: "AI " + String(item.type || "Cut") + " " + (index + 1),
        track: "V2", start: timelineOffset + Math.max(0, Number(item.start) || 0), duration: Math.max(0.12, Number(item.duration) || 0.12),
        color: "purple", aiGenerated: true, aiType: "transition", aiData: item
      }));
      const markers = template?.markers || {};
      const beatValues = markers.beats || [];
      const beatClips = beatValues.map((beat, index) => {
        const at = typeof beat === "number" ? beat : Number(beat?.time_sec ?? beat?.timestamp_sec ?? beat?.start_sec ?? beat?.time ?? beat?.start ?? 0);
        return { id: nextClipIdRef.current++, name: "Beat " + (index + 1), track: "A1", start: timelineOffset + Math.max(0, at), duration: 0.12, color: "green", aiGenerated: true, aiType: "beat" };
      }).filter((clip) => Number.isFinite(clip.start));
      const objectClips = (markers.objects || []).map((item, index) => ({
        id: nextClipIdRef.current++, name: "Object: " + (item.label || "Detected") + (item.track_id == null ? "" : " #" + item.track_id),
        track: "V2", start: timelineOffset + Math.max(0, Number(item.start) || 0), duration: Math.max(0.12, (Number(item.end) || 0) - (Number(item.start) || 0)),
        color: "purple", aiGenerated: true, aiType: "object", aiData: item
      }));
      const peopleClips = (markers.people || []).map((item, index) => ({
        id: nextClipIdRef.current++, name: "Person analysis " + (index + 1),
        track: "V2", start: timelineOffset + Math.max(0, Number(item.time) || 0), duration: 0.12,
        color: "teal", aiGenerated: true, aiType: "people", aiData: item
      }));
      const maskClips = (markers.segmentation || []).map((item, index) => ({
        id: nextClipIdRef.current++, name: "Person mask " + (index + 1),
        track: "V2", start: timelineOffset + Math.max(0, Number(item.time) || 0), duration: 0.12,
        color: "teal", aiGenerated: true, aiType: "segmentation", aiData: item
      }));
      const depthClips = (markers.depth || []).map((item, index) => ({
        id: nextClipIdRef.current++, name: "Depth map " + (index + 1),
        track: "V2", start: timelineOffset + Math.max(0, Number(item.time) || 0), duration: 0.12,
        color: "purple", aiGenerated: true, aiType: "depth", aiData: item
      }));
      const transcriptClips = (markers.transcript || []).map((item, index) => ({
        id: nextClipIdRef.current++, name: "Speech: " + String(item.text || "Transcript").slice(0, 48),
        track: "A1", start: timelineOffset + Math.max(0, Number(item.start_sec) || 0), duration: Math.max(0.12, (Number(item.end_sec) || 0) - (Number(item.start_sec) || 0)),
        color: "green", aiGenerated: true, aiType: "transcript", aiData: item
      }));
      const overlayClips = [...effectClips, ...transitionClips, ...beatClips, ...objectClips, ...peopleClips, ...maskClips, ...depthClips, ...transcriptClips];
      setClips((items) => [...items.filter((clip) => clip.id !== original.id && !clip.aiGenerated), ...sceneClips, ...overlayClips]);
      setSelected(sceneClips[0]?.id ?? null);
      setPlayhead(sceneClips[0]?.start ?? 0);
      const timelineMarkers = { ...(template?.markers || {}), scenes: (template?.markers?.scenes || []).map((scene) => ({ ...scene, start_sec: timelineOffset + Number(scene.start_sec ?? scene.start ?? 0) })) };
      setAnalysisResults({ ...template, markers: timelineMarkers });
      const statuses = Object.entries(result.analyzers || {}).map(([name, info]) => name + ": " + info.status + (info.error ? " (" + info.error + ")" : ""));
      setAnalysisStatus(statuses.join(" · "));
      const extraTracks = (template?.tracks || []).filter((track) => track.type !== "video").length;
      setAnalysisProgress("Finished on CPU · " + (result.outputDir || "results saved locally"));
      setNotice("Local Python analysis complete: " + sceneClips.length + " editable scene clips. " + statuses.join(" · ") + (extraTracks ? " · Additional analysis tracks are available in the result JSON." : ""));
    } catch (error) {
      setNotice("Analysis failed: " + (error?.message || String(error)));
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyzeSelectedAudio() {
    if (!selectedClip?.mediaPath || !window.vidclips?.analyzeAudio) { setNotice("Select imported desktop media first."); return; }
    setAudioAnalyzing(true); setAnalysisProgress("Starting local Audio Analyser…");
    try {
      const result = await window.vidclips.analyzeAudio(selectedClip.mediaPath);
      const data = result.analysis || result;
      const offset = Math.max(0, Number(selectedClip.start) || 0);
      const generated = [];
      const add = (name, type, start, end, aiData) => {
        const localStart = Math.max(0, Number(start) || 0);
        const localEnd = Math.max(localStart + 0.05, Number(end) || localStart + 0.12);
        generated.push({ id: nextClipIdRef.current++, name, track: "A1", start: offset + localStart, duration: localEnd - localStart, sourceIn: localStart, sourceOut: localEnd, color: type === "silence" ? "purple" : "green", aiGenerated: true, aiType: type, aiData });
      };
      (data.transcript?.segments || []).forEach((item) => {
        add("Speech: " + String(item.text || "").slice(0, 38), "transcript", item.start_sec, item.end_sec, item);
        (item.words || []).forEach((word) => add("Word: " + word.text, "word", word.start_sec, word.end_sec, word));
      });
      (data.silence_segments || []).forEach((item) => add("Silence", "silence", item.start_sec, item.end_sec, item));
      (data.music?.beat_timestamps_sec || []).forEach((time, index) => add("Beat " + (index + 1), "beat", time, Number(time) + 0.08, { time, bpm: data.music?.estimated_bpm }));
      (data.sound_events || []).forEach((item) => add(item.label || "Sound transient", "sound-event", item.start_sec, item.end_sec, item));
      const stemClips = [];
      for (const stem of data.separation?.stems || []) {
        if (!stem.path || !window.vidclips?.mediaUrlFromPath) continue;
        try {
          const mediaUrl = await window.vidclips.mediaUrlFromPath(stem.path);
          stemClips.push({ id: nextClipIdRef.current++, name: stem.name || (stem.type + " stem"), fileName: stem.name || stem.type, mediaPath: stem.path, mediaUrl, track: "A1", start: offset, duration: Number(data.duration_sec) || selectedClip.duration, sourceIn: 0, sourceOut: Number(data.duration_sec) || selectedClip.duration, color: "teal", audioOnly: true, separatedStem: true, stemType: stem.type, gain: 1, muted: false });
        } catch {}
      }
      setClips((items) => [...items.filter((clip) => !(clip.aiGenerated && ["transcript", "word", "silence", "beat", "sound-event"].includes(clip.aiType)) && !clip.separatedStem), ...generated, ...stemClips]);
      setAnalysisResults((previous) => ({ ...(previous || {}), audio: data }));
      setAnalysisStatus("Audio analysis complete");
      setAnalysisProgress("Saved locally");
      setNotice("Audio analysis complete: " + generated.length + " timeline markers and " + stemClips.length + " playable separated stems.");
    } catch (error) { setNotice("Audio analysis failed: " + (error?.message || String(error))); }
    finally { setAudioAnalyzing(false); }
  }

  async function openProject() {
    if (!window.vidclips?.openProject) { setNotice("Open project is available in the Windows desktop app."); return; }
    try {
      const project = await window.vidclips.openProject();
      if (!project) return;
      if (!Array.isArray(project.clips)) throw new Error("This file is not a valid VidClips project.");
      const restored = await Promise.all(project.clips.map(async (clip) => {
        if (!clip.mediaPath) return { ...clip, mediaUrl: null };
        return { ...clip, mediaUrl: await window.vidclips.mediaUrlFromPath(clip.mediaPath) };
      }));
      setClips(restored);
      setProjectName(project.projectName || "Untitled project");
      setPlayhead(Number(project.playhead) || 0);
      setSelected(restored[0]?.id ?? null);
      setMediaFiles(restored.filter((clip) => clip.mediaPath && !clip.linkedVideoId).map((clip) => ({ ...clip, url: clip.mediaUrl, name: clip.name })));
      nextClipIdRef.current = Math.max(1, ...restored.map((clip) => Number(clip.id) + 1 || 1));
      setNotice("Project opened. If a source file moved, re-import that video.");
    } catch (error) { setNotice("Could not open project: " + error.message); }
  }

  useEffect(() => {
    if (!playing) {
      audioRefs.current.forEach((audio) => audio.pause());
      if (videoRef.current) videoRef.current.pause();
      return undefined;
    }
    let frame;
    let last = performance.now();
    const tick = (now) => {
      const delta = Math.min(0.08, Math.max(0, (now - last) / 1000));
      last = now;
      const time = playheadRef.current;
      const video = clips.find((clip) => clip.track.startsWith("V") && !clip.audioOnly && clip.mediaUrl && time >= clip.start && time < clip.start + clip.duration);
      let next = time + delta;
      if (video && videoRef.current) {
        if (selected !== video.id) setSelected(video.id);
        const wanted = (video.sourceIn || 0) + time - video.start;
        if (Math.abs(videoRef.current.currentTime - wanted) > 0.45) {
          try { videoRef.current.currentTime = wanted; } catch {}
        }
        if (videoRef.current.paused) videoRef.current.play().catch(() => {});
        if (!videoRef.current.paused) next = video.start + videoRef.current.currentTime - (video.sourceIn || 0);
      } else if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      clips.filter((clip) => clip.track.startsWith("A") && clip.mediaUrl && !clip.aiGenerated).forEach((clip) => {
        const audio = audioRefs.current.get(clip.id);
        if (!audio) return;
        const inside = next >= clip.start && next < clip.start + clip.duration;
        audio.volume = Math.max(0, Math.min(1, Number(clip.gain ?? 1)));
        audio.muted = Boolean(clip.muted);
        if (inside) {
          const wanted = (clip.sourceIn || 0) + next - clip.start;
          if (Math.abs(audio.currentTime - wanted) > 0.4) {
            try { audio.currentTime = wanted; } catch {}
          }
          if (audio.paused) audio.play().catch(() => setNotice("Could not play audio clip: " + clip.name));
        } else if (!audio.paused) {
          audio.pause();
        }
      });
      if (next >= playbackEnd) {
        playheadRef.current = playbackEnd;
        setPlayhead(playbackEnd);
        setPlaying(false);
        return;
      }
      next = Math.max(0, next);
      playheadRef.current = next;
      setPlayhead(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, clips, selected, playbackEnd]);

  function completeFirstRun(event) {
    event.preventDefault();
    const name = loginName.trim();
    if (!name) return;
    window.localStorage.setItem("vidclips:first-run-complete", "true");
    window.localStorage.setItem("vidclips:profile-name", name);
    window.localStorage.setItem("vidclips:profile-email", loginEmail.trim());
    setLoginName(name);
    setIsSignedIn(true);
    setNotice("Welcome to VidClips, " + name + ".");
  }

  if (!isSignedIn) {
    return <div className="login-screen"><form className="login-card" onSubmit={completeFirstRun}>
      <div className="brand login-brand"><div className="brand-mark"><Film size={21} /></div><span>VidClips</span></div>
      <div className="login-eyebrow">YOUR CREATIVE WORKSPACE</div>
      <h1>Welcome to VidClips</h1>
      <p>Set up your local profile to get started. This screen appears only on the first launch on this device.</p>
      <label>Your name<input autoFocus required value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="Enter your name" /></label>
      <label>Email (optional)<input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="you@example.com" /></label>
      <button className="button primary login-submit" type="submit">Continue to VidClips <ChevronRight size={17} /></button>
      <small>Profile details stay on this device. Online account authentication is not configured.</small>
    </form></div>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Film size={19} /></div><span>VidClips</span></div>
        <div className="project-title"><input aria-label="Project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} /><span>Saved locally when exported</span></div>
        <div className="top-actions"><button className="button quiet" onClick={openProject}><FolderOpen size={16} /> Open project</button><button className="button quiet" disabled={audioAnalyzing || !selectedClip?.mediaPath} onClick={analyzeSelectedAudio}>{audioAnalyzing ? "Audio…" : "Audio Analyse"}</button><button className="button quiet" disabled={analyzing || !selectedClip?.mediaPath} onClick={analyzeSelectedVideo}>{analyzing ? "Analyzing…" : "AI Analyze"}</button><button className="button quiet" onClick={() => addClip("V1")}><Plus size={16} /> Add clip</button><button className="button quiet" disabled={exporting || clips.every((clip) => clip.track !== "V1" || !clip.mediaPath)} onClick={exportMp4}>{exporting ? "Exporting…" : "Export MP4"}</button><button className="button primary" onClick={saveProject}><Save size={16} /> Save project</button></div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <button className="nav-item active"><FolderOpen size={17} /> Media</button>
          <button className="nav-item" onClick={() => setNotice("Effects panel will be added after core timeline editing")}><MonitorPlay size={17} /> Effects</button>
          <div className="side-section"><div className="section-label">PROJECT MEDIA</div>{mediaFiles.map((item, index) => <button className="media-card imported-media" key={item.url + index} onClick={() => { const clip = clips.find((c) => c.mediaUrl === item.url); if (clip) { setSelected(clip.id); setPlayhead(clip.start); } }}><div className="media-thumb"><Film size={22} /></div><div><strong>{item.name}</strong><small>{item.fileName}</small></div></button>)}<button className="import-button" onClick={importDesktopMedia}><Plus size={15} /> Import media</button><input ref={fileInputRef} type="file" accept="video/*,audio/*,.mp4,.mov,.webm,.mkv,.wav,.mp3,.m4a,.flac,.aac,.ogg" multiple hidden onChange={importMedia} />
          <div className="ai-options">
            <div className="section-label">LOCAL AI ANALYZERS</div>
            {[
              ["scene_detection", "Scene cuts"],
              ["camera_motion", "Camera motion"],
              ["color_grading", "Color analysis"],
              ["object_detection", "Object detection (YOLO)"],
              ["face_pose", "Face / pose / hands"],
              ["segmentation", "Person segmentation"],
              ["depth", "Depth estimation (MiDaS)"],
              ["audio", "Audio / beats / speech"]
            ].map(([key, label]) => <label key={key} className="ai-option"><input type="checkbox" checked={analysisOptions.includes(key)} onChange={(event) => setAnalysisOptions((items) => event.target.checked ? [...items, key] : items.filter((item) => item !== key))} /><span>{label}</span></label>)}
            <p>Runs on this PC's CPU. First use may download large AI models; advanced analyzers can be slow.</p>
          </div></div>
          <div className="sidebar-bottom"><span className="status-dot" /> Local workspace ready</div>
        </aside>

        <main className="main-area">
          <div className="upper-workspace">
            <section className="preview-panel">
              <div className="panel-heading"><span>PREVIEW</span><span className="muted">Program monitor</span></div>
              <div className="preview-screen">\n                {clips.filter((clip) => clip.track.startsWith("A") && clip.mediaUrl && !clip.aiGenerated).map((clip) => <audio key={clip.id} ref={(element) => { if (element) audioRefs.current.set(clip.id, element); else audioRefs.current.delete(clip.id); }} src={clip.mediaUrl} preload="auto" />)}
                {previewClip?.mediaUrl ? (
                  <video
                    key={previewClip.id}
                    ref={videoRef}
                    className="video-preview"
                    style={{ filter: "brightness(" + (previewClip.brightness ?? 1) + ") contrast(" + (previewClip.contrast ?? 1) + ") saturate(" + (previewClip.saturation ?? 1) + ") hue-rotate(" + (previewClip.hue ?? 0) + "deg) blur(" + (previewClip.blur ?? 0) + "px)" }}
                    src={previewClip.mediaUrl}
                    controls={false}
                    muted={Boolean(clips.some((clip) => clip.linkedVideoId === previewClip.id && clip.track === "A1"))}
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const localTime = Math.max(0, Math.min(previewClip.duration, (previewClip.sourceIn || 0) + playhead - previewClip.start));
                      if (Number.isFinite(localTime)) e.currentTarget.currentTime = localTime;
                    }}
                    onPlay={() => setPlaying(true)}
                    onTimeUpdate={(e) => {
                      const nextTime = previewClip.start + e.currentTarget.currentTime - (previewClip.sourceIn || 0);
                      playheadRef.current = Math.min(previewClip.start + previewClip.duration, nextTime);
                      setPlayhead(playheadRef.current);
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
              <div className="transport"><span className="timecode">{formatTime(playhead)} <span>/</span> {formatTime(totalDuration)}</span><div className="transport-controls"><button title="Previous second" onClick={() => setPlayhead(Math.max(0, playhead - 1))}><ChevronLeft size={18} /></button><button className="play-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button><button title="Next second" onClick={() => setPlayhead(Math.min(totalDuration, playhead + 1))}><ChevronRight size={18} /></button></div><span className="preview-quality">FIT · 100%</span></div>
            </section>

            <section className="inspector-panel">
              <div className="panel-heading"><span>INSPECTOR</span><span className="muted">Clip properties</span></div>
              {selectedClip ? <div className="inspector-content"><div className={"inspector-color " + selectedClip.color}><Film size={22} /></div><label>Clip name<input value={selectedClip.name} onChange={(e) => setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, name: e.target.value } : clip))} /></label><div className="property-grid"><label>Track<select value={selectedClip.track} onChange={(e) => setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, track: e.target.value } : clip))}><option value="V1">V1 · Video 1</option><option value="V2">V2 · Video 2</option><option value="A1">A1 · Audio 1</option></select></label><label>Duration (s)<input type="number" min="0.05" step="0.1" value={Number(selectedClip.duration.toFixed(2))} onChange={(e) => { const duration = Math.max(0.05, Number(e.target.value) || 0.05); setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, duration, sourceOut: (clip.sourceIn || 0) + duration } : clip)); }} /></label><label>Timeline start (s)<input type="number" min="0" step="0.1" value={Number(selectedClip.start.toFixed(2))} onChange={(e) => { const start = Math.max(0, Number(e.target.value) || 0); setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, start } : clip)); }} /></label><label>Source in (s)<input type="number" min="0" step="0.1" value={Number((selectedClip.sourceIn || 0).toFixed(2))} onChange={(e) => { const sourceIn = Math.max(0, Number(e.target.value) || 0); setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, sourceIn, sourceOut: sourceIn + clip.duration } : clip)); }} /></label></div><div className="effect-controls">{selectedClip.track.startsWith("A") ? <><strong>Audio controls</strong><label>Volume <input type="range" min="0" max="1" step="0.05" value={selectedClip.gain ?? 1} onChange={(e) => setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, gain: Number(e.target.value) } : clip))} /></label><label className="ai-option"><input type="checkbox" checked={Boolean(selectedClip.muted)} onChange={(e) => setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, muted: e.target.checked } : clip))} />Mute this audio clip</label></> : <><strong>Color effects</strong><label>Brightness <input type="range" min="0" max="2" step="0.05" value={selectedClip.brightness ?? 1} onChange={(e) => setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, brightness: Number(e.target.value) } : clip))} /></label><label>Contrast <input type="range" min="0" max="2" step="0.05" value={selectedClip.contrast ?? 1} onChange={(e) => setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, contrast: Number(e.target.value) } : clip))} /></label><label>Saturation <input type="range" min="0" max="2" step="0.05" value={selectedClip.saturation ?? 1} onChange={(e) => setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, saturation: Number(e.target.value) } : clip))} /></label><label>Hue <input type="range" min="-180" max="180" step="5" value={selectedClip.hue ?? 0} onChange={(e) => setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, hue: Number(e.target.value) } : clip))} /></label><label>Blur <input type="range" min="0" max="10" step="0.5" value={selectedClip.blur ?? 0} onChange={(e) => setClips((items) => items.map((clip) => clip.id === selected ? { ...clip, blur: Number(e.target.value) } : clip))} /></label></>}</div><div className="inspector-hint">{selectedClip.fileName ? "Imported media: " + selectedClip.fileName : "Select a clip on the timeline to edit its properties."}</div></div> : <div className="empty-inspector">Select a clip to inspect it.</div>}
            </section>
          </div>

          <section className="timeline-panel">
            <div className="timeline-toolbar"><div className="timeline-title"><span>TIMELINE</span><span className="muted">{clips.length} clips{analysisResults ? " · AI template loaded" : ""}</span></div><div className="edit-tools"><button title="Split selected clip at playhead" onClick={splitSelected}><Scissors size={16} /> Split</button><button title="Move clip earlier" onClick={() => nudgeSelected(-0.5)}><ChevronLeft size={16} /></button><button title="Move clip later" onClick={() => nudgeSelected(0.5)}><ChevronRight size={16} /></button><button title="Delete selected clip" onClick={deleteSelected}><Trash2 size={16} /></button><span className="tool-divider" /><button title="Zoom out" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}><ZoomOut size={16} /></button><span className="zoom-label">{Math.round(zoom * 100)}%</span><button title="Zoom in" onClick={() => setZoom(Math.min(2, zoom + 0.25))}><ZoomIn size={16} /></button></div></div>
            <div className="timeline-scroll"><div className="timeline-inner" style={{ width: 176 + totalDuration * pixelsPerSecond }}>
              <div className="ruler-row"><div className="track-label ruler-label"><MousePointer2 size={14} /> Time</div><div className="ruler" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const nextTime = Math.max(0, Math.min(totalDuration, (e.clientX - rect.left) / pixelsPerSecond)); setPlayhead(nextTime); const active = clips.find((clip) => clip.mediaUrl && nextTime >= clip.start && nextTime < clip.start + clip.duration); if (active) { if (selected !== active.id) setSelected(active.id); if (videoRef.current) videoRef.current.currentTime = Math.max(0, (active.sourceIn || 0) + nextTime - active.start); } }}>{ticks.map((tick) => <div key={tick} className="tick" style={{ left: tick * pixelsPerSecond }}><span>{formatTime(tick)}</span></div>)}</div></div>
              {["V1", "V2", "A1"].map((track) => <div className="track-row" key={track}><div className="track-label"><strong>{track}</strong><span>{track.startsWith("A") ? <AudioLines size={15} /> : <Film size={15} />}</span></div><div className={"track-lane " + (track.startsWith("A") ? "audio-lane" : "")}>{clips.filter((clip) => clip.track === track).map((clip) => <button key={clip.id} className={"clip-block " + clip.color + (selected === clip.id ? " selected" : "")} style={{ left: clip.start * pixelsPerSecond, width: Math.max(38, clip.duration * pixelsPerSecond) }} onPointerDown={(e) => beginClipDrag(e, clip.id)} onClick={() => { setSelected(clip.id); setNotice(clip.audioOnly ? "Selected audio waveform: " + clip.name : "Selected " + clip.name); }} title={clip.name + " · " + clip.duration.toFixed(2) + " sec"}>{clip.waveform?.length > 0 && <span className="waveform-bars" aria-hidden="true">{clip.waveform.map((peak, index) => <i key={index} style={{ height: Math.max(5, Math.round(peak * 100)) + "%" }} />)}</span>}<span className="clip-icon">{track.startsWith("A") ? <AudioLines size={13} /> : <Film size={13} />}</span><span className="clip-name">{clip.name}</span><span className="clip-duration">{clip.duration.toFixed(1)}s</span></button>)}{track === "V1" && analysisResults?.markers?.scenes?.slice(1).map((scene, index) => { const cutTime = Number(scene.start_sec ?? scene.start ?? 0); return Number.isFinite(cutTime) ? <span key={"scene-cut-" + index} className="scene-cut-marker" style={{ left: cutTime * pixelsPerSecond }} title={"Detected scene cut at " + cutTime.toFixed(2) + " s"} /> : null; })}</div></div>)}
              <div className="playhead-line" style={{ left: 176 + playhead * pixelsPerSecond }}><div className="playhead-cap" /></div>
            </div></div>
            <div className="timeline-footer"><span className="notice">{notice}</span><span>Playhead <strong>{formatTime(playhead)}</strong></span><button onClick={() => addClip("A1")}><Plus size={14} /> Add audio track clip</button></div>
            {analysisResults && <div className="analysis-results" aria-live="polite">
              <strong>Local AI results</strong>
              <span>{analysisResults.markers?.scenes?.length || clips.filter((clip) => clip.aiGenerated && clip.track === "V1").length} scene markers</span>
              <span>{analysisResults.markers?.beats?.length || 0} beat markers</span>
              <span>{analysisResults.markers?.objects?.length || 0} object tracks</span>
              <span>{analysisResults.markers?.transcript?.length || 0} speech segments</span>
              <span>{(analysisResults.tracks || []).filter((track) => track.type === "effects").flatMap((track) => track.items || []).length} effects</span>
              <span className="analysis-path" title={analysisStatus}>{analysisStatus || analysisProgress}</span>
            </div>}
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