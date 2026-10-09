/**
 * VidClips - API Service
 * Axios-based HTTP client for backend communication.
 */
import axios from "axios";

const API_BASE = (import.meta.env.VITE_API_URL || "https://vidclips-xf5z.onrender.com").replace(/\/$/, "");

const api = axios.create({
  baseURL: API_BASE,
  timeout: 600000, // 10 minutes for long-running analysis
  headers: {
    "Content-Type": "application/json",
  },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      const message = data?.detail || data?.message || `Request failed with status ${status}`;
      console.error(`[API Error] ${status}:`, message);
      return Promise.reject(new Error(message));
    }
    if (error.request) {
      console.error("[API Error] No response received - server may be offline");
      return Promise.reject(new Error("Cannot connect to server. Make sure the backend is running."));
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── Health ───────────────────────────────────────────
export async function checkHealth() {
  const { data } = await api.get("/health");
  return data;
}

// ─── Analyzers ────────────────────────────────────────
export async function listAnalyzers() {
  const { data } = await api.get("/analyzers");
  return data;
}

// ─── Jobs ─────────────────────────────────────────────
export async function uploadVideo(file, onProgress) {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await api.post("/jobs", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
    onUploadProgress: onProgress,
  });
  return data; // { run_id, status }
}

export async function getJob(runId) {
  const { data } = await api.get(`/jobs/${runId}`);
  return data; // { run_id, video_path, status, created_at, completed_at, duration_sec, output_files, error }
}

export async function listJobs(limit = 20) {
  const { data } = await api.get("/jobs", { params: { limit } });
  return data;
}