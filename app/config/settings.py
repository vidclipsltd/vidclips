"""
app/config/settings.py

Central configuration object for the whole application.

Everything that varies between machines/environments (paths, GPU usage,
batch sizes, which analyzers are enabled, model cache locations) lives
here and nowhere else. Every other module imports `settings` from this
file instead of reading environment variables directly, so there is a
single source of truth and a single place to change defaults.

Uses pydantic-settings so values can be overridden by a `.env` file or
real environment variables without touching code.
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- General ----
    app_name: str = "video_ai_project"
    environment: Literal["dev", "prod", "test"] = "dev"
    log_level: str = "INFO"

    # ---- Paths ----
    project_root: Path = PROJECT_ROOT
    outputs_dir: Path = PROJECT_ROOT / "outputs"
    models_dir: Path = PROJECT_ROOT / "models"
    checkpoints_dir: Path = PROJECT_ROOT / "checkpoints"
    assets_dir: Path = PROJECT_ROOT / "assets"

    # ---- Database ----
    database_url: str = f"sqlite:///{PROJECT_ROOT / 'app.db'}"

    # ---- Compute ----
    device: Literal["cuda", "cpu", "auto"] = "auto"
    num_workers: int = 1
    batch_size: int = 8
    max_frame_dim: int = 1280  # frames are downscaled to this max dimension before heavy models

    # ---- Frame sampling ----
    scene_detect_downscale: int = 2
    frame_sample_stride: int = 10  # analyze every Nth frame for expensive per-frame models

    # ---- Feature toggles ----
    # Each of these maps 1:1 to an analyzer registered in app/analyzers.
    # Turning one off skips it entirely (useful on machines without a GPU).
    enable_scene_detection: bool = True
    enable_camera_motion: bool = True
    enable_optical_flow: bool = True
    enable_object_detection: bool = False  # enable on a machine with more RAM / a GPU
    enable_segmentation: bool = False  # per-frame masks are memory-intensive
    enable_face_pose: bool = False  # MediaPipe models need more memory
    enable_ocr: bool = False
    enable_depth: bool = False  # depth model is too heavy for the 512 MB free host
    enable_color_grading: bool = True
    enable_audio: bool = False  # Whisper/pyannote/librosa exceed the free host memory

    # ---- API ----
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # ---- Model download ----
    auto_download_models: bool = True

    def resolved_device(self) -> str:
        if self.device != "auto":
            return self.device
        try:
            import torch

            return "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            return "cpu"


settings = Settings()

# Ensure runtime directories exist on import.
for _dir in (
    settings.outputs_dir,
    settings.outputs_dir / "videos",
    settings.outputs_dir / "frames",
    settings.outputs_dir / "masks",
    settings.outputs_dir / "audio",
    settings.outputs_dir / "objects",
    settings.outputs_dir / "effects",
    settings.outputs_dir / "metadata",
    settings.outputs_dir / "previews",
    settings.models_dir,
    settings.checkpoints_dir,
):
    _dir.mkdir(parents=True, exist_ok=True)
