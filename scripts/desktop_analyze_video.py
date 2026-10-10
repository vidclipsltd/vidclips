#!/usr/bin/env python
"""Local, machine-readable entry point used by the VidClips Electron desktop app.

The source video is passed as a filesystem path and is never uploaded. The
desktop process reads one final JSON result from stdout; pipeline diagnostics
remain on stdout as plain progress lines for the Electron wrapper to relay.
"""
from __future__ import annotations

import argparse
import contextlib
import json
import sys
import traceback
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def emit(payload: dict[str, Any]) -> None:
    print("VIDCLIPS_RESULT:" + json.dumps(payload, ensure_ascii=False, default=str), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run VidClips local CPU video analysis.")
    parser.add_argument("--video", required=True, help="Path to a local video file")
    parser.add_argument(
        "--analyzers",
        default="scene_detection,camera_motion,color_grading",
        help="Comma-separated analyzer names. Defaults to scene detection, camera motion, and color.",
    )
    parser.add_argument("--device", choices=("cpu",), default="cpu")
    args = parser.parse_args()

    video_path = Path(args.video).expanduser().resolve()
    if not video_path.is_file():
        emit({"ok": False, "error": f"Video file does not exist: {video_path}"})
        return 2

    analyzer_names = [name.strip() for name in args.analyzers.split(",") if name.strip()]
    if not analyzer_names:
        emit({"ok": False, "error": "Choose at least one analyzer."})
        return 2

    try:
        # Keep desktop analysis explicitly CPU-only, even on machines with a GPU.
        from app.config.settings import settings
        settings.device = "cpu"
        feature_flags = {
            "scene_detection": "enable_scene_detection",
            "camera_motion": "enable_camera_motion",
            "object_detection": "enable_object_detection",
            "segmentation": "enable_segmentation",
            "face_pose": "enable_face_pose",
            "ocr": "enable_ocr",
            "depth": "enable_depth",
            "color_grading": "enable_color_grading",
            "audio": "enable_audio",
        }
        for analyzer_name in analyzer_names:
            flag = feature_flags.get(analyzer_name)
            if flag:
                setattr(settings, flag, True)

        from app.exporters.json_exporter import export_run
        from app.pipelines.video_pipeline import run_pipeline

        print("Local CPU analysis started.", flush=True)
        print("Selected analyzers: " + ", ".join(analyzer_names), flush=True)
        # The pipeline emits human-readable progress; keep it on stdout so the
        # Electron UI can display it, while the final structured payload is marked.
        run = run_pipeline(str(video_path), analyzer_names=analyzer_names, cfg=settings, max_workers=1)
        written = export_run(run)
        timeline_path = Path(written["timeline"])
        timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
        statuses = {
            name: {
                "status": result.status,
                "duration_sec": round(result.duration_sec, 3),
                "error": result.error,
            }
            for name, result in run.results.items()
        }
        emit({
            "ok": True,
            "local": True,
            "uploaded": False,
            "device": "cpu",
            "runId": run.run_id,
            "videoPath": str(video_path),
            "metadata": {
                "duration": run.metadata.duration_sec,
                "width": run.metadata.width,
                "height": run.metadata.height,
                "fps": run.metadata.fps,
                "frameCount": run.metadata.frame_count,
            },
            "analyzers": statuses,
            "timeline": timeline,
            "outputDir": str(timeline_path.parent),
            "outputFiles": written,
        })
        return 0
    except Exception as exc:  # noqa: BLE001 - return a user-facing diagnostic to Electron
        traceback.print_exc(file=sys.stderr)
        emit({"ok": False, "error": str(exc), "details": traceback.format_exc(limit=8)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
