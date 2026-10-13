#!/usr/bin/env python
"""Local CPU Audio Analyser entry point for the VidClips Electron editor.

Media is read from a local filesystem path. Results are emitted as one JSON line
prefixed with VIDCLIPS_AUDIO_RESULT for the Electron IPC wrapper.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def emit(payload: dict[str, Any]) -> None:
    print("VIDCLIPS_AUDIO_RESULT:" + json.dumps(payload, ensure_ascii=False, default=str), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze local audio/video media on CPU.")
    parser.add_argument("--media", required=True, help="Path to a local audio or video file")
    args = parser.parse_args()
    source = Path(args.media).expanduser().resolve()
    if not source.is_file():
        emit({"ok": False, "error": f"Media file does not exist: {source}"})
        return 2

    output_root = Path(os.environ.get("VIDCLIPS_OUTPUTS_DIR", ROOT / "outputs")) / "audio"
    output_root.mkdir(parents=True, exist_ok=True)
    safe_stem = "".join(c if c.isalnum() or c in "-_." else "_" for c in source.stem)[:80] or "audio"
    master_path = output_root / f"{safe_stem}_source_quality.wav"
    analysis_path = output_root / f"{safe_stem}_analysis.wav"
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        emit({"ok": False, "error": "FFmpeg is unavailable. Reinstall the VidClips desktop dependencies."})
        return 2

    try:
        print("Extracting local audio…", flush=True)
        command = [ffmpeg, "-y", "-v", "error", "-i", str(source), "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2", str(master_path)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=3600)
        if result.returncode or not master_path.is_file():
            emit({"ok": False, "error": "Could not extract an audio stream. " + (result.stderr[-700:] if result.stderr else "This file may not contain audio.")})
            return 1
        analysis_extract = [ffmpeg, "-y", "-v", "error", "-i", str(master_path), "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", str(analysis_path)]
        analysis_result = subprocess.run(analysis_extract, capture_output=True, text=True, timeout=3600)
        if analysis_result.returncode or not analysis_path.is_file():
            emit({"ok": False, "error": "Could not prepare audio for analysis. " + (analysis_result.stderr[-700:] if analysis_result.stderr else "")})
            return 1

        import librosa
        import numpy as np

        print("Analyzing waveform, silence and beats…", flush=True)
        signal, sample_rate = librosa.load(str(analysis_path), sr=16000, mono=True)
        if not len(signal):
            emit({"ok": False, "error": "No audio samples were found."})
            return 1
        rms = librosa.feature.rms(y=signal, frame_length=2048, hop_length=512)[0]
        times = librosa.frames_to_time(np.arange(len(rms)), sr=sample_rate, hop_length=512)
        floor = max(float(np.percentile(rms, 15)) * 0.8, 0.004)
        silent = rms < floor
        silence_segments = []
        start_idx = None
        for idx, is_silent in enumerate(silent):
            if is_silent and start_idx is None:
                start_idx = idx
            if start_idx is not None and (not is_silent or idx == len(silent) - 1):
                end_idx = idx if not is_silent else idx + 1
                start_sec = float(times[start_idx])
                end_sec = float(times[min(end_idx, len(times) - 1)])
                if end_sec - start_sec >= 0.3:
                    silence_segments.append({"start_sec": round(start_sec, 3), "end_sec": round(end_sec, 3), "duration_sec": round(end_sec - start_sec, 3), "threshold": round(floor, 5)})
                start_idx = None

        tempo, beat_frames = librosa.beat.beat_track(y=signal, sr=sample_rate)
        tempo_value = float(np.asarray(tempo).reshape(-1)[0]) if np.asarray(tempo).size else 0.0
        beat_times = librosa.frames_to_time(beat_frames, sr=sample_rate)
        transcript: dict[str, Any] = {"language": None, "text": "", "segments": [], "status": "not_run"}
        try:
            print("Loading local Whisper speech model (first run may download it)…", flush=True)
            import whisper
            model = whisper.load_model("base", device="cpu")
            transcription = model.transcribe(str(analysis_path), verbose=False, word_timestamps=True, fp16=False)
            segments = []
            for seg in transcription.get("segments", []):
                words = []
                for word in seg.get("words", []) or []:
                    words.append({
                        "text": str(word.get("word", "")).strip(),
                        "start_sec": round(float(word.get("start", 0)), 3),
                        "end_sec": round(float(word.get("end", 0)), 3),
                        "confidence": round(float(word.get("probability", 0)), 4) if word.get("probability") is not None else None,
                    })
                segments.append({
                    "start_sec": round(float(seg.get("start", 0)), 3),
                    "end_sec": round(float(seg.get("end", 0)), 3),
                    "text": str(seg.get("text", "")).strip(),
                    "words": words,
                })
            transcript = {"language": transcription.get("language"), "text": str(transcription.get("text", "")).strip(), "segments": segments, "status": "complete"}
        except Exception as exc:
            transcript = {"language": None, "text": "", "segments": [], "status": "unavailable", "error": str(exc)}
            print("Transcription unavailable: " + str(exc), flush=True)

        from app.analyzers.sound_event_classifier import classify_sound_events
        semantic_result = classify_sound_events(signal, sample_rate)
        semantic_events = semantic_result.get("events", [])
        # Lightweight energy/spectral transient candidates, not semantic labels.
        print("Detecting prominent sound transients…", flush=True)
        flux = librosa.onset.onset_strength(y=signal, sr=sample_rate)
        onset_frames = librosa.onset.onset_detect(onset_envelope=flux, sr=sample_rate, units="frames", backtrack=False)
        events = []
        onset_times = librosa.frames_to_time(onset_frames, sr=sample_rate)
        for frame in onset_frames[:500]:
            time_sec = float(librosa.frames_to_time([frame], sr=sample_rate)[0])
            events.append({"label": "sound transient", "start_sec": round(max(0, time_sec - 0.05), 3), "end_sec": round(time_sec + 0.25, 3), "confidence": None, "method": "onset-energy heuristic"})
        events = semantic_events + events
        separation = {"status": "not_available", "stems": [], "note": "Demucs is not installed or source separation failed."}
        try:
            print("Separating audio into local stems (CPU; first run downloads model weights)…", flush=True)
            stem_root = output_root / "separated"
            sep = subprocess.run(
                [sys.executable, "-m", "demucs", "-n", "htdemucs", "--device", "cpu", "-o", str(stem_root), str(master_path)],
                capture_output=True, text=True, timeout=10800,
            )
            if sep.returncode == 0:
                model_dir = stem_root / "htdemucs" / master_path.stem
                stems = []
                for stem_name in ("vocals", "drums", "bass", "other"):
                    stem_path = model_dir / (stem_name + ".wav")
                    if stem_path.is_file():
                        stems.append({"type": stem_name, "path": str(stem_path), "name": stem_name.title() + " stem"})
                separation = {"status": "complete" if stems else "empty", "stems": stems, "note": "Demucs htdemucs stems are vocals, drums, bass and other; they are not semantic speech/music/SFX tracks."}
            else:
                separation = {"status": "failed", "stems": [], "note": (sep.stderr or sep.stdout or "Demucs failed.")[-900:]}
        except FileNotFoundError:
            separation = {"status": "not_installed", "stems": [], "note": "Install requirements.txt to enable local Demucs source separation."}
        except Exception as exc:
            separation = {"status": "failed", "stems": [], "note": str(exc)}

        output = {
            "has_audio": True,
            "source_path": str(source),
            "audio_path": str(master_path),
            "analysis_audio_path": str(analysis_path),
            "duration_sec": round(len(signal) / sample_rate, 3),
            "transcript": transcript,
            "silence_segments": silence_segments,
            "music": {"estimated_bpm": round(tempo_value, 2), "beat_timestamps_sec": [round(float(t), 3) for t in beat_times]},
            "volume": {"rms_mean": round(float(np.sqrt(np.mean(signal ** 2))), 5), "peak": round(float(np.max(np.abs(signal))), 5)},
            "sound_events": events,
            "classification": {key: value for key, value in semantic_result.items() if key != "events"},
            "separation": separation,
            "notes": ["Runs locally on CPU; source media is not uploaded.", "Sound-event candidates are generic transients, not reliable semantic event labels."]
        }
        emit({"ok": True, "local": True, "uploaded": False, "device": "cpu", "analysis": output})
        return 0
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        emit({"ok": False, "error": str(exc), "details": traceback.format_exc(limit=8)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
