"""Local AudioSet-based semantic sound-event classification."""
from __future__ import annotations

from typing import Any

MODEL_ID = "MIT/ast-finetuned-audioset-10-10-0.4593"

def classify_sound_events(signal, sample_rate: int, chunk_seconds: int = 10) -> dict[str, Any]:
    """Classify short audio windows with a pretrained AudioSet AST model on CPU."""
    try:
        from transformers import pipeline
        classifier = pipeline("audio-classification", model=MODEL_ID, device=-1)
        events = []
        chunk_size = max(1, int(sample_rate * chunk_seconds))
        for offset in range(0, len(signal), chunk_size):
            chunk = signal[offset:offset + chunk_size]
            if len(chunk) == 0:
                continue
            predictions = classifier({"raw": chunk, "sampling_rate": sample_rate}, top_k=8)
            if predictions and isinstance(predictions[0], list):
                predictions = predictions[0]
            for item in predictions or []:
                label = str(item.get("label", "")).strip()
                if label:
                    events.append({
                        "label": label,
                        "start_sec": round(offset / sample_rate, 3),
                        "end_sec": round(min(len(signal), offset + len(chunk)) / sample_rate, 3),
                        "confidence": round(float(item.get("score", 0)), 4),
                        "method": "AudioSet AST classifier",
                    })
        return {"status": "complete", "model": MODEL_ID, "labels": sorted({e["label"] for e in events}), "events": events, "note": "Predictions are estimates; labels cover each analysis window rather than exact event boundaries."}
    except Exception as exc:
        return {"status": "unavailable", "model": MODEL_ID, "events": [], "labels": [], "note": str(exc)}
