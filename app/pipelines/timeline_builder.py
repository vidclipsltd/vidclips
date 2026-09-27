"""
Builds a reusable edit template from analyzer results.

The important distinction is that analyzer output describes what is in the
reference video, while this module turns those observations into editable
timeline instructions that the frontend and renderer can consume.
"""
from __future__ import annotations

from typing import Any


def _merge_ranges(ranges: list[dict[str, Any]], gap: float = 0.12) -> list[dict[str, Any]]:
    if not ranges:
        return []
    ordered = sorted(ranges, key=lambda x: float(x["start"]))
    merged = [dict(ordered[0])]
    for item in ordered[1:]:
        current = merged[-1]
        if float(item["start"]) <= float(current["end"]) + gap:
            current["end"] = max(float(current["end"]), float(item["end"]))
        else:
            merged.append(dict(item))
    return merged


def _scene_clips(scenes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    clips = []
    for index, scene in enumerate(scenes):
        start = float(scene.get("start_sec", 0))
        end = float(scene.get("end_sec", start))
        if end <= start:
            continue
        clips.append({
            "id": f"clip-{index + 1}",
            "type": "video",
            "source_slot": f"slot-{index + 1}",
            "start": round(start, 3),
            "end": round(end, 3),
            "source_start": round(start, 3),
            "source_end": round(end, 3),
            "scene_index": scene.get("scene_index", index),
        })
    return clips


def _transitions(scenes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # Scene detection establishes edit boundaries. We represent those boundaries
    # as real transition objects; cuts are renderable immediately and can later
    # be changed by the user to dissolve/flash/slide/etc.
    transitions = []
    for index in range(1, len(scenes)):
        at = float(scenes[index].get("start_sec", 0))
        transitions.append({
            "id": f"transition-{index}",
            "type": "cut",
            "start": round(at, 3),
            "end": round(at, 3),
            "duration": 0.0,
            "enabled": True,
        })
    return transitions


def _camera_effects(camera: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not camera:
        return []
    frames = camera.get("frames", [])
    if not frames:
        return []

    effects = []
    active = None

    for frame in frames:
        tags = set(frame.get("motion_tags", []))
        ts = float(frame.get("timestamp_sec", 0))
        scale = float(frame.get("scale", 1.0))
        if "zoom_in" in tags or "zoom_out" in tags:
            kind = "zoom"
        else:
            kind = None

        if kind and active is None:
            active = {"kind": kind, "start": ts, "from": 1.0, "to": scale}
        elif kind and active is not None and active["kind"] == kind:
            active["to"] = scale
        elif active is not None:
            if active["to"] != active["from"]:
                effects.append({
                    "id": f"effect-zoom-{len(effects) + 1}",
                    "type": "zoom",
                    "start": round(active["start"], 3),
                    "end": round(ts, 3),
                    "from": round(active["from"], 4),
                    "to": round(active["to"], 4),
                    "enabled": True,
                })
            active = None

    if active is not None and active["to"] != active["from"]:
        end = float(frames[-1].get("timestamp_sec", active["start"]))
        effects.append({
            "id": f"effect-zoom-{len(effects) + 1}",
            "type": "zoom",
            "start": round(active["start"], 3),
            "end": round(end, 3),
            "from": round(active["from"], 4),
            "to": round(active["to"], 4),
            "enabled": True,
        })

    return effects


def _color_effects(color: dict[str, Any] | None, duration: float) -> list[dict[str, Any]]:
    if not color:
        return []
    samples = color.get("samples", [])
    if not samples:
        return []

    # Store a renderable approximation of the reference look. It is deliberately
    # editable rather than pretending to be an exact LUT.
    mean_sat = sum(float(s.get("mean_saturation", 0)) for s in samples) / len(samples)
    mean_contrast = sum(float(s.get("contrast_luma_std", 0)) for s in samples) / len(samples)
    saturation = max(0.5, min(1.8, mean_sat / 64.0))
    contrast = max(0.7, min(1.6, mean_contrast / 45.0))

    return [{
        "id": "effect-color-1",
        "type": "color_grade",
        "start": 0.0,
        "end": round(duration, 3),
        "parameters": {
            "saturation": round(saturation, 3),
            "contrast": round(contrast, 3),
        },
        "enabled": True,
    }]


def build_timeline_template(run: Any) -> dict[str, Any]:
    scene_result = run.results.get("scene_detection")
    camera_result = run.results.get("camera_motion")
    color_result = run.results.get("color_grading")
    audio_result = run.results.get("audio")

    scenes = scene_result.data.get("scenes", []) if scene_result and scene_result.status == "ok" else []
    duration = float(getattr(run.metadata, "duration_sec", 0) or 0)

    video_clips = _scene_clips(scenes)
    if not video_clips and duration > 0:
        video_clips = [{
            "id": "clip-1", "type": "video", "source_slot": "slot-1",
            "start": 0.0, "end": round(duration, 3),
            "source_start": 0.0, "source_end": round(duration, 3),
            "scene_index": 0,
        }]

    transitions = _transitions(scenes)
    effects = []
    if camera_result and camera_result.status == "ok":
        effects.extend(_camera_effects(camera_result.data))
    if color_result and color_result.status == "ok":
        effects.extend(_color_effects(color_result.data, duration))

    beats = []
    if audio_result and audio_result.status == "ok":
        beats = audio_result.data.get("beats", []) or audio_result.data.get("beat_times", []) or []

    return {
        "version": 1,
        "template": {
            "name": "AI Extracted Template",
            "duration": round(duration, 3),
            "fps": getattr(run.metadata, "fps", None),
            "source_video": run.video_path,
            "replaceable": True,
            "tracks": [
                {"id": "video-main", "type": "video", "clips": video_clips},
                {"id": "audio-main", "type": "audio", "clips": []},
                {"id": "effects-main", "type": "effects", "items": effects},
                {"id": "transitions-main", "type": "transitions", "items": transitions},
            ],
            "markers": {
                "beats": beats,
                "scenes": scenes,
            },
        },
    }
