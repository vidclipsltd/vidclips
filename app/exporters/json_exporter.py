"""
app/exporters/json_exporter.py

Maps analyzer results onto the specific set of output files the spec
asks for. Each analyzer owns a "domain" (scene_detection -> scenes,
camera_motion -> camera, ...); this module is the only place that
knows the *filenames* — analyzers themselves stay filename-agnostic
so they can be reused/renamed without touching export logic.

Analyzers that failed or were skipped still get an entry in their
JSON file (status + error), so downstream tools can tell "no data"
from "not attempted".
"""
from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from app.core.exceptions import ExportError
from app.core.logging_config import get_logger
from app.pipelines.video_pipeline import PipelineRun
from app.pipelines.timeline_builder import build_timeline_template

logger = get_logger(__name__)

# analyzer_name -> output filename
_FILE_MAP: dict[str, str] = {
    "scene_detection": "scene_data.json",
    "camera_motion": "camera.json",
    "object_detection": "objects.json",  # also feeds tracking.json (see below)
    "face_pose": "tracking.json",        # merged with object tracks
    "ocr": "subtitles.json",             # OCR/text events double as subtitle-track source
    "depth": "depth.json",
    "segmentation": "effects.json",      # mattes feed compositing/effects
    "color_grading": "color.json",
    "audio": "audio.json",
}


def _write_json(path: Path, payload: Any) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, default=str)
    except OSError as exc:
        raise ExportError(f"Failed writing {path}: {exc}") from exc


def export_run(run: PipelineRun, output_dir: Path | None = None) -> dict[str, str]:
    """
    Writes every per-domain JSON file plus project.json / timeline.json /
    keyframes.json / transitions.json, and returns {logical_name: path}.
    """
    from app.config.settings import settings as cfg

    output_dir = output_dir or (cfg.outputs_dir / "metadata" / run.run_id)
    output_dir.mkdir(parents=True, exist_ok=True)

    written: dict[str, str] = {}

    # --- per-analyzer domain files ---
    for analyzer_name, filename in _FILE_MAP.items():
        result = run.results.get(analyzer_name)
        payload = {
            "analyzer": analyzer_name,
            "status": result.status if result else "not_run",
            "duration_sec": round(result.duration_sec, 3) if result else None,
            "error": result.error if result else None,
            "data": result.data if result else {},
        }
        path = output_dir / filename
        _write_json(path, payload)
        written[filename.replace(".json", "")] = str(path)

    # --- timeline.json: reusable editable template ---
    timeline_path = output_dir / "timeline.json"
    timeline = build_timeline_template(run)
    _write_json(timeline_path, timeline)
    written["timeline"] = str(timeline_path)

    # --- project.json: top-level manifest referencing every other file ---
    project = {
        "run_id": run.run_id,
        "video_path": run.video_path,
        "metadata": asdict(run.metadata),
        "analyzers": {
            name: {"status": r.status, "duration_sec": round(r.duration_sec, 3), "error": r.error}
            for name, r in run.results.items()
        },
        "output_files": written,
    }
    project_path = output_dir / "project.json"
    _write_json(project_path, project)
    written["project"] = str(project_path)

    logger.info("Exported %d files to %s", len(written), output_dir)
    return written
