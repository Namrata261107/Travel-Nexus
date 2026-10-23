"use strict";

const API_BASE = window.TRAVEL_NEXUS_API_ORIGIN + "/api/authority/face";
const FRAME_INTERVAL_MS = 1800;
const MAX_FRAME_WIDTH = 960;
const MATCH_DISTANCE_THRESHOLD = 0.5;
const MATCH_CONFIRMATION_MS = 3000;
const DETECTION_COOLDOWN_MS = 45000;
const FACE_API_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js";
const FACE_MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

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
  isStarting: false,
  isScanning: false,
  location: null,
  locationRequested: false,
  notifiedMatchId: null,
  reports: [],
  referenceDescriptors: [],
  matchSince: null,
  lastCapturedAt: new Map(),
  faceApiReady: false,
  isRecognizing: false
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
  const token = await window.travelNexusAuth.getAccessToken();
  headers.set("Authorization", `Bearer ${token}`);

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

async function privatePhotoUrl(url) {
  const token = await window.travelNexusAuth.getAccessToken();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Could not load photo (HTTP ${response.status}).`);
  return URL.createObjectURL(await response.blob());
}

async function refreshFaceData() {
  await Promise.all([loadCases(), loadDetections()]);
}

async function loadCases() {
  casesStatus.textContent = "Loading reports...";
  try {
    const data = await apiFetch("/cases/");
    state.reports = data.cases || [];
    await renderCases(state.reports);
  } catch (error) {
    casesStatus.textContent = error.message;
    casesGrid.replaceChildren();
    createReportCard.hidden = false;
    toggleButton.disabled = false;
  }
}

async function renderCases(cases) {
  casesGrid.replaceChildren();
  toggleButton.disabled = false;
  casesStatus.textContent = cases.length
    ? `${cases.length} active report${cases.length === 1 ? "" : "s"}`
    : "No active reports yet. Create a person report to enable matching.";
  for (const report of cases) {
    const card = document.createElement("article");
    card.className = "face-record-card";
    const image = document.createElement("img");
    try { image.src = await privatePhotoUrl(report.reference_photo); }
    catch (error) { image.alt = `${report.name} reference image is unavailable.`; }
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
  }
}

async function loadDetections() {
  detectionsStatus.textContent = "Loading detections...";
  try {
    const data = await apiFetch("/detections/");
    await renderDetections(data.detections || []);
  } catch (error) {
    detectionsStatus.textContent = error.message;
    detectionsGrid.replaceChildren();
  }
}

async function renderDetections(detections) {
  detectionsGrid.replaceChildren();
  detectionsStatus.textContent = detections.length
    ? `${detections.length} detection${detections.length === 1 ? "" : "s"}`
    : "No potential matches have been recorded.";
  for (const detection of detections) {
    const card = document.createElement("article");
    card.className = "face-record-card detection-record-card";
    const image = document.createElement("img");
    try { image.src = await privatePhotoUrl(detection.captured_photo); }
    catch (error) { image.alt = `${detection.name} capture is unavailable.`; }
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
  }
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
    if (!state.reports.length) {
      setCameraStatus("No active person reports. Stop the camera and create a report first.");
      return;
    }
    setCameraStatus("Loading the browser recognition model...");
    await loadFaceApi();
    if (!state.stream) return;
    setCameraStatus("Preparing reference photos in this browser...");
    await prepareReferenceDescriptors();
    if (!state.stream) return;
    if (!state.referenceDescriptors.length) {
      setCameraStatus("No reference photos contain one detectable face. Add clear, front-facing photos and try again.");
      return;
    }
    state.isScanning = true;
    const skipped = state.reports.length - state.referenceDescriptors.length;
    setCameraStatus(
      `Camera is live. ${state.referenceDescriptors.length} reference photo(s) ready. ` +
      (skipped ? `${skipped} photo(s) were skipped. ` : "") +
      "Matching runs in this browser; a potential match must remain visible for about 3 seconds."
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
  state.matchSince = null;
  state.isRecognizing = false;
  window.clearTimeout(state.timer);
  state.timer = null;
  if (state.stream) state.stream.getTracks().forEach(track => track.stop());
  state.stream = null;
  video.pause();
  video.srcObject = null;
  panel.classList.remove("is-live");
  document.body.classList.remove("camera-is-live");
  placeholder.hidden = false;
  setButtonState("Start Camera", false);
  setCameraStatus("Camera is off. Matching has stopped.");
}

async function scanFrame() {
  if (!state.isScanning || !state.stream || state.isRecognizing) return;
  if (!video.videoWidth || !video.videoHeight) {
    state.timer = window.setTimeout(scanFrame, FRAME_INTERVAL_MS);
    return;
  }

  state.isRecognizing = true;
  try {
    const faces = await window.faceapi
      .detectAllFaces(video, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.55 }))
      .withFaceLandmarks(true)
      .withFaceDescriptors();
    if (!state.isScanning) return;
    const match = findBestMatch(faces);
    if (!match) {
      state.matchSince = null;
      state.notifiedMatchId = null;
      setCameraStatus(faces.length ? "No active report matched the face in view." : "Camera is live. No face detected in this frame.");
      return;
    }
    await handleBrowserMatch(match);
  } catch (error) {
    if (state.isScanning) setCameraStatus(`Browser matching error: ${error.message}`);
  } finally {
    state.isRecognizing = false;
    if (state.isScanning) state.timer = window.setTimeout(scanFrame, FRAME_INTERVAL_MS);
  }
}

async function loadFaceApi() {
  if (state.faceApiReady) return;
  if (!window.faceapi) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = FACE_API_URL;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not download the browser recognition library. Check your internet connection."));
      document.head.appendChild(script);
    });
  }
  await Promise.all([
    window.faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
    window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
    window.faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL)
  ]);
  state.faceApiReady = true;
}

async function prepareReferenceDescriptors() {
  state.referenceDescriptors = [];
  for (const report of state.reports) {
    if (!report.is_active) continue;
    let objectUrl;
    try {
      objectUrl = await privatePhotoUrl(report.reference_photo);
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const faces = await window.faceapi
        .detectAllFaces(image, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptors();
      if (faces.length === 1) state.referenceDescriptors.push({ report, descriptor: faces[0].descriptor });
    } catch (error) {
      console.warn(`Could not prepare reference photo for report ${report.id}:`, error);
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }
}

function findBestMatch(faces) {
  let best = null;
  for (const face of faces) {
    for (const reference of state.referenceDescriptors) {
      const distance = window.faceapi.euclideanDistance(face.descriptor, reference.descriptor);
      if (distance <= MATCH_DISTANCE_THRESHOLD && (!best || distance < best.distance)) {
        best = { report: reference.report, distance };
      }
    }
  }
  if (!best) return null;
  best.similarity = Math.max(0, Math.min(1, 1 - best.distance));
  return best;
}

async function handleBrowserMatch(match) {
  const reportId = String(match.report.id);
  const now = Date.now();
  if (!state.matchSince || state.matchSince.reportId !== reportId) {
    state.matchSince = { reportId, since: now };
  }
  if (state.notifiedMatchId !== reportId) {
    state.notifiedMatchId = reportId;
    showRecognitionPopup(
      "Potential match detected",
      `${match.report.name} — ${match.report.report_type_label}. Automated recognition can be wrong; verify independently.`
    );
  }
  const remaining = Math.max(0, MATCH_CONFIRMATION_MS - (now - state.matchSince.since));
  if (remaining > 0) {
    setCameraStatus(`Potential match: ${match.report.name}. Keep the face in view for ${Math.ceil(remaining / 1000)} more second(s).`);
    return;
  }
  const lastCaptured = state.lastCapturedAt.get(reportId) || 0;
  if (now - lastCaptured < DETECTION_COOLDOWN_MS) {
    setCameraStatus(`Potential match: ${match.report.name}. A capture was already saved recently.`);
    return;
  }

  setCameraStatus(`Saving a potential match for ${match.report.name} for human review...`);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to capture a camera image.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Unable to capture a camera image.")), "image/jpeg", 0.82);
  });
  const formData = new FormData();
  formData.append("report_id", match.report.id);
  formData.append("similarity_score", match.similarity.toFixed(4));
  formData.append("image", imageBlob, "browser-capture.jpg");
  if (state.location) {
    formData.append("latitude", state.location.latitude);
    formData.append("longitude", state.location.longitude);
  }
  try {
    await apiFetch("/detections/", { method: "POST", body: formData });
    state.lastCapturedAt.set(reportId, Date.now());
    setCameraStatus(`Potential match captured for ${match.report.name}. Saved for human review; this is not a confirmed identity.`);
    showRecognitionPopup("Potential match captured", `${match.report.name} — saved for human review. Verify independently.`);
    loadDetections();
  } catch (error) {
    state.matchSince = { reportId, since: Date.now() - MATCH_CONFIRMATION_MS };
    setCameraStatus(error.message);
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
