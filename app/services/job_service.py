"""
app/services/job_service.py

Glue layer between the pipeline/exporter and persistence. The API
(background tasks) and the CLI script both call `run_job` so job
tracking behaves identically regardless of entry point.
"""
from __future__ import annotations

import datetime as dt
import time

from app.core.logging_config import get_logger
from app.database.models import AnalysisJob, get_session
from app.exporters.json_exporter import export_run
from app.pipelines.video_pipeline import run_pipeline

logger = get_logger(__name__)


def run_job(
    video_path: str,
    analyzer_names: list[str] | None = None,
    run_id: str | None = None,
) -> str:
    """Run analysis and persist job status throughout the entire pipeline."""

    session = get_session()
    start = time.perf_counter()
    job = None
    effective_run_id = run_id

    try:
        # The API creates a queued row before scheduling this background task.
        # Mark it running BEFORE expensive analysis, so polling reflects reality.
        if effective_run_id:
            job = session.get(AnalysisJob, effective_run_id)
            if job is not None:
                job.status = "running"
                job.error = None
                session.commit()

        run = run_pipeline(
            video_path,
            analyzer_names=analyzer_names,
            run_id=effective_run_id,
        )
        effective_run_id = run.run_id

        if job is None:
            job = session.get(AnalysisJob, effective_run_id)
        if job is None:
            job = AnalysisJob(
                run_id=effective_run_id,
                video_path=video_path,
                status="running",
            )
            session.add(job)
        job.status = "running"
        session.commit()

        written = export_run(run)
        job.status = "completed"
        job.output_files = written
        job.error = None

    except Exception as exc:  # noqa: BLE001
        logger.exception("Analysis job failed for run %s", effective_run_id)
        # Roll back a failed transaction before attempting to persist the error.
        session.rollback()
        if effective_run_id:
            job = session.get(AnalysisJob, effective_run_id)
            if job is None:
                job = AnalysisJob(
                    run_id=effective_run_id,
                    video_path=video_path,
                    status="failed",
                )
                session.add(job)
            job.status = "failed"
            job.error = str(exc)[:4000]
    finally:
        if job is not None:
            job.completed_at = dt.datetime.utcnow()
            job.duration_sec = time.perf_counter() - start
            try:
                session.commit()
            except Exception:
                session.rollback()
                logger.exception("Could not persist final status for run %s", effective_run_id)
        session.close()

    return effective_run_id or ""
