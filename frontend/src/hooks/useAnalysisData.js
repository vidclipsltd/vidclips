/**
 * VidClips - useAnalysisData Hook
 * Loads analysis results from backend when a job completes.
 */
import { useEffect, useCallback } from "react";
import { getJob } from "../services/api";
import { useEditor } from "../context/EditorContext";

export function useAnalysisData() {
  const baseUrl = (import.meta.env.VITE_API_URL || "https://vidclips-xf5z.onrender.com").replace(/\/$/, "");
  const {
    jobId,
    jobStatus,
    setAnalysisData,
    addNotification,
  } = useEditor();

  const loadAnalysisData = useCallback(async (runId) => {
    try {
      const job = await getJob(runId);
      if (job.status === "completed" && job.output_files) {
        // Load the project.json manifest
        const projectFile = job.output_files?.project;
        let projectData = null;
        if (projectFile) {
          // The backend serves static files from outputs directory
          const response = await fetch(`${baseUrl}/outputs/metadata/${runId}/project.json`);
          if (response.ok) {
            projectData = await response.json();
            setAnalysisData(projectData);
          }
        }

        // Load individual analysis files
        const analysisResults = {};

        // Load scenes
        if (job.output_files?.scene_data) {
          try {
            const res = await fetch(`${baseUrl}/outputs/metadata/${runId}/scene_data.json`);
            if (res.ok) {
              const data = await res.json();
              if (data.status === "ok" && data.data?.scenes) {
                analysisResults.scenes = data.data.scenes;
              }
            }
          } catch { /* ignore */ }
        }

        // Load objects
        if (job.output_files?.objects) {
          try {
            const res = await fetch(`${baseUrl}/outputs/metadata/${runId}/objects.json`);
            if (res.ok) {
              const data = await res.json();
              if (data.status === "ok" && data.data?.objects) {
                analysisResults.objects = data.data.objects;
              }
            }
          } catch { /* ignore */ }
        }

        // Load faces/tracking
        if (job.output_files?.tracking) {
          try {
            const res = await fetch(`${baseUrl}/outputs/metadata/${runId}/tracking.json`);
            if (res.ok) {
              const data = await res.json();
              if (data.status === "ok" && data.data?.faces) {
                analysisResults.faces = data.data.faces;
              }
            }
          } catch { /* ignore */ }
        }

        // Load OCR
        if (job.output_files?.subtitles) {
          try {
            const res = await fetch(`${baseUrl}/outputs/metadata/${runId}/subtitles.json`);
            if (res.ok) {
              const data = await res.json();
              if (data.status === "ok" && data.data?.text_items) {
                analysisResults.ocr = data.data.text_items;
              }
            }
          } catch { /* ignore */ }
        }

        // Load audio
        if (job.output_files?.audio) {
          try {
            const res = await fetch(`${baseUrl}/outputs/metadata/${runId}/audio.json`);
            if (res.ok) {
              const data = await res.json();
              if (data.status === "ok" && data.data) {
                analysisResults.audio = data.data;
              }
            }
          } catch { /* ignore */ }
        }

        // Load camera motion
        if (job.output_files?.camera) {
          try {
            const res = await fetch(`${baseUrl}/outputs/metadata/${runId}/camera.json`);
            if (res.ok) {
              const data = await res.json();
              if (data.status === "ok" && data.data) {
                analysisResults.motion = data.data;
              }
            }
          } catch { /* ignore */ }
        }

        // Load colors
        if (job.output_files?.color) {
          try {
            const res = await fetch(`${baseUrl}/outputs/metadata/${runId}/color.json`);
            if (res.ok) {
              const data = await res.json();
              if (data.status === "ok" && data.data) {
                analysisResults.colors = data.data;
              }
            }
          } catch { /* ignore */ }
        }

        // Load metadata from project
        if (projectData?.metadata) {
          analysisResults.metadata = projectData.metadata;
        }

        if (Object.keys(analysisResults).length > 0) {
          setAnalysisData(analysisResults);
        }
      }
    } catch (err) {
      console.error("[useAnalysisData] Failed to load analysis:", err);
    }
  }, [setAnalysisData]);

  useEffect(() => {
    if (jobId && jobStatus === "completed") {
      loadAnalysisData(jobId);
    }
  }, [jobId, jobStatus, loadAnalysisData]);

  return { loadAnalysisData };
}