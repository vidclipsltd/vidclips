"""
app/analyzers/__init__.py

Importing this package registers every built-in analyzer (each module
below calls @register_analyzer on import). `video_pipeline.run_pipeline`
does `import app.analyzers` specifically to trigger this side effect.

To add a new analyzer, create the module and import it here.
"""
from app.analyzers import (  # noqa: F401
    scene_detection,
    camera_motion,
    object_detection,
    face_pose_hands,
    # ocr_text,
    depth_estimation,
    segmentation,
    color_grading,
    audio_analysis,
)
