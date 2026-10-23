"use strict";

const API_BASE = window.TRAVEL_NEXUS_API_ORIGIN + "/api/authority/face";
const FRAME_INTERVAL_MS = 1800;
const MAX_FRAME_WIDTH = 960;

const video = document.getElementById("cameraVideo");
const panel = document.getElementById("liveCameraPanel");
const placeholder = document.getElementById("cameraPlaceholder");
const cameraStatus = document.getElementById("cameraStatus");
const toggleButton = document.getElementById("toggleCameraBtn");
const reportForm = document.getElementById("faceReportForm");
const formStatus = document.getElementById("faceReportFormStatus");
const createReportCard = document.getElementById("createFaceReportCard");
const casesGrid = document.getElementById("faceCasesGrid");
const casesStatus = document.getElementById("faceCasesStatus");
const detectionsGrid = document.getElementById("faceDetectionsGrid");
const detectionsStatus = document.getElementById("faceDetectionsStatus");

const state = {
  stream: null,
  timer: null,
  request: null,
  isStarting: false,
  isScanning: false,
  csrfToken: "",
  location: null,
  locationRequested: false,
  notifiedMatchId: null
};

toggleButton.addEventListener("click", () => {
  if (state.stream || state.isStarting) stopCamera();
  else startCamera();
});
reportForm.addEventListener("submit", saveFaceReport);
document.getElementById("refreshFaceDataBtn").addEventListener("click", refreshFaceData);

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (options.method && options.method !== "GET") {
    await ensureCsrfToken();
    headers.set("X-CSRFToken", state.csrfToken);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store"
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : {};

  if (!response.ok || data.success === false) {
    throw new Error(data.error || data.message || `Request failed (HTTP ${response.status}).`);
  }
  return data;
}

async function ensureCsrfToken() {
  if (state.csrfToken) return;
  await apiFetch("/cases/", { method: "GET" })
    .then(() => {});
  state.csrfToken = readCookie("csrftoken");
  if (!state.csrfToken) {
    throw new Error("Could not obtain a security token. Reload the page and try again.");
  }
}

function readCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}

async function refreshFaceData() {
  await Promise.all([loadCases(), loadDetections()]);
}

async function loadCases() {
  casesStatus.textContent = "Loading reports...";
  try {
    const data = await apiFetch("/cases/");
    renderCases(data.cases || []);
  } catch (error) {
    casesStatus.textContent = error.message;
    casesGrid.replaceChildren();
    createReportCard.hidden = false;
    toggleButton.disabled = false;
  }
}

function renderCases(cases) {
  casesGrid.replaceChildren();
  toggleButton.disabled = false;
  casesStatus.textContent = cases.length
    ? `${cases.length} active report${cases.length === 1 ? "" : "s"}`
    : "No active reports yet. Create a person report to enable matching.";
  cases.forEach(report => {
    const card = document.createElement("article");
    card.className = "face-record-card";
    const image = document.createElement("img");
    image.src = report.reference_photo;
    image.alt = `Reference photo for ${report.name}`;
    image.loading = "lazy";
    const details = document.createElement("div");
    details.className = "face-record-details";
    const title = document.createElement("h3");
    title.textContent = report.name;
    const type = document.createElement("span");
    type.className = `face-type-badge type-${report.report_type}`;
    type.textContent = report.report_type_label;
    const description = document.createElement("p");
    description.textContent = report.description || "No additional information.";
    details.append(title, type, description);
    card.append(image, details);
    casesGrid.appendChild(card);
  });
}

async function loadDetections() {
  detectionsStatus.textContent = "Loading detections...";
  try {
    const data = await apiFetch("/detections/");
    renderDetections(data.detections || []);
  } catch (error) {
    detectionsStatus.textContent = error.message;
    detectionsGrid.replaceChildren();
  }
}

function renderDetections(detections) {
  detectionsGrid.replaceChildren();
  detectionsStatus.textContent = detections.length
    ? `${detections.length} detection${detections.length === 1 ? "" : "s"}`
    : "No potential matches have been recorded.";
  detections.forEach(detection => {
    const card = document.createElement("article");
    card.className = "face-record-card detection-record-card";
    const image = document.createElement("img");
    image.src = detection.captured_photo;
    image.alt = `Camera capture of potential match for ${detection.name}`;
    image.loading = "lazy";
    const details = document.createElement("div");
    details.className = "face-record-details";
    const title = document.createElement("h3");
    title.textContent = detection.name;
    const type = document.createElement("span");
    type.className = `face-type-badge type-${detection.report_type}`;
    type.textContent = `${detection.report_type_label} · Potential match`;
    const timestamp = document.createElement("p");
    timestamp.textContent = `Captured: ${formatDate(detection.captured_at)}`;
    const scoreValue = Number(detection.similarity_score);
    const score = document.createElement("p");
    score.textContent = Number.isFinite(scoreValue)
      ? `Embedding similarity (not a probability): ${Math.round(scoreValue * 100)}%`
      : "Embedding similarity unavailable";
    const location = document.createElement("p");
    location.textContent = detection.latitude != null && detection.longitude != null
      ? `Location: ${detection.latitude.toFixed(5)}, ${detection.longitude.toFixed(5)}`
      : "Location unavailable (camera location permission was not granted).";
    const review = document.createElement("p");
    review.className = "face-review-reminder";
    review.textContent = "Automated comparison is not proof of identity. Verify independently.";
    details.append(title, type, timestamp, score, location, review);
    card.append(image, details);
    detectionsGrid.appendChild(card);
  });
}

async function saveFaceReport(event) {
  event.preventDefault();
  const submitButton = document.getElementById("saveFaceReportBtn");
  const formData = new FormData(reportForm);
  submitButton.disabled = true;
  formStatus.textContent = "Saving report...";
  formStatus.className = "face-form-status";
  try {
    const data = await apiFetch("/cases/", {
      method: "POST",
      body: formData
    });
    reportForm.reset();
    formStatus.textContent = data.message || "Person report saved.";
    formStatus.className = "face-form-status success";
    await loadCases();
  } catch (error) {
    formStatus.textContent = error.message;
    formStatus.className = "face-form-status error";
  } finally {
    submitButton.disabled = false;
  }
}

async function startCamera() {
  if (state.isStarting || state.stream) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraStatus("Camera access is unavailable. Open this page on localhost or 127.0.0.1.");
    return;
  }

  state.isStarting = true;
  setButtonState("Opening camera...", true);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    if (!state.isStarting) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }

    state.stream = stream;
    video.srcObject = stream;
    await video.play();
    panel.classList.add("is-live");
    document.body.classList.add("camera-is-live");
    placeholder.hidden = true;
    setButtonState("Stop Camera", false, true);
    requestCameraLocation();
    setCameraStatus("Preparing registered reports for recognition...");

    const data = await apiFetch("/prepare/", { method: "POST" });
    if (!state.stream) return;
    const rejected = Array.isArray(data.rejected_cases) ? data.rejected_cases : [];
    if (data.registered_cases < 1) {
      setCameraStatus(
        rejected.length
          ? `No reference photos could be prepared: ${rejected.map(item => item.reason).join(" ")}`
          : "No valid person reports are registered. Stop the camera and create a report first."
      );
      return;
    }
    state.isScanning = true;
    const rejectedMessage = rejected.length
      ? ` ${rejected.length} reference photo(s) could not be used.`
      : "";
    setCameraStatus(
      `Camera is live. ${data.registered_cases} report(s) ready. ` +
      `A potential match must remain visible for about 3 seconds.${rejectedMessage}`
    );
    scanFrame();
  } catch (error) {
    if (state.stream) stopCamera();
    setCameraStatus(error.message);
    setButtonState("Start Camera", false);
  } finally {
    state.isStarting = false;
  }
}

function stopCamera() {
  state.isStarting = false;
  state.isScanning = false;
  window.clearTimeout(state.timer);
  state.timer = null;
  if (state.request) {
    state.request.abort();
    state.request = null;
  }
  if (state.stream) state.stream.getTracks().forEach(track => track.stop());
  state.stream = null;
  video.pause();
  video.srcObject = null;
  panel.classList.remove("is-live");
  document.body.classList.remove("camera-is-live");
  placeholder.hidden = false;
  setButtonState("Start Camera", false);
  setCameraStatus("Camera is off. No further frames are being sent.");
}

async function scanFrame() {
  if (!state.isScanning || !state.stream || state.request) return;
  if (!video.videoWidth || !video.videoHeight) {
    state.timer = window.setTimeout(scanFrame, FRAME_INTERVAL_MS);
    return;
  }

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    setCameraStatus("Unable to prepare a camera frame.");
    state.timer = window.setTimeout(scanFrame, FRAME_INTERVAL_MS);
    return;
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  try {
    const frame = await new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("Unable to capture a camera frame."));
      }, "image/jpeg", 0.82);
    });
    if (!state.isScanning) return;

    const controller = new AbortController();
    state.request = controller;
    const formData = new FormData();
    formData.append("image", frame, "camera-frame.jpg");
    if (state.location) {
      formData.append("latitude", state.location.latitude);
      formData.append("longitude", state.location.longitude);
    }

    const data = await apiFetch("/recognize/", {
      method: "POST",
      body: formData,
      signal: controller.signal
    });
    if (!state.isScanning) return;
    handleRecognitionResult(data);
  } catch (error) {
    if (error.name !== "AbortError" && state.isScanning) {
      setCameraStatus(error.message);
    }
  } finally {
    state.request = null;
    if (state.isScanning) {
      state.timer = window.setTimeout(scanFrame, FRAME_INTERVAL_MS);
    }
  }
}

function handleRecognitionResult(data) {
  if (!data.match) {
    state.notifiedMatchId = null;
    setCameraStatus(data.message || "Camera is live. No potential match in this frame.");
    return;
  }
  const reportId = String(data.match.id);
  const score = Number(data.similarity_score);
  const similarity = Number.isFinite(score)
    ? ` Embedding similarity: ${Math.round(score * 100)}%.`
    : "";
  if (data.detection) {
    setCameraStatus(
      `Potential match captured for ${data.match.name} (${data.match.report_type_label}).` +
      `${similarity} Saved for human review.`
    );
    showRecognitionPopup(
      "Potential match captured",
      `${data.match.name} — ${data.match.report_type_label}. Saved to detections for review. This is not a confirmed identity.`
    );
    state.notifiedMatchId = reportId;
    loadDetections();
  } else {
    setCameraStatus(
      `Potential match: ${data.match.name} (${data.match.report_type_label}).` +
      `${similarity} Keep the person in view for about 3 seconds.`
    );
    if (state.notifiedMatchId !== reportId) {
      showRecognitionPopup(
        "Potential match detected",
        `${data.match.name} — ${data.match.report_type_label}. Keep the person in view to save a capture. Please verify the result; automated recognition can be wrong.`
      );
      state.notifiedMatchId = reportId;
    }
  }
}

function showRecognitionPopup(title, message) {
  let container = document.getElementById("faceRecognitionToasts");
  if (!container) {
    container = document.createElement("div");
    container.id = "faceRecognitionToasts";
    container.className = "face-recognition-toasts";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "assertive");
    document.body.appendChild(container);
  }

  const popup = document.createElement("section");
  popup.className = "face-recognition-toast";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const content = document.createElement("p");
  content.textContent = message;
  popup.append(heading, content);
  container.replaceChildren(popup);
  window.setTimeout(() => popup.remove(), 7000);
}

function requestCameraLocation() {
  if (state.locationRequested) return;
  state.locationRequested = true;
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    position => {
      state.location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
    },
    error => {
      console.info("Camera location unavailable:", error.message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

function setButtonState(label, disabled, isStop = false) {
  toggleButton.disabled = disabled;
  toggleButton.classList.toggle("button-stop", isStop);
  toggleButton.innerHTML = isStop
    ? '<i class="fa-solid fa-stop"></i><span>Stop Camera</span>'
    : `<i class="fa-solid fa-video"></i><span>${label}</span>`;
}

function setCameraStatus(message) {
  cameraStatus.textContent = message;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

window.addEventListener("pagehide", stopCamera);
refreshFaceData();
