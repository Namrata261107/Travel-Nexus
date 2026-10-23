
"use strict";

/* =========================================
   TRAVEL NEXUS - AUTHORITY DASHBOARD
   ========================================= */

const DASHBOARD_API = window.TRAVEL_NEXUS_API_ORIGIN + "/api/authority";
const travelers = [];
const alerts = [];
const geofences = [];
const dashboardStartedAt = Date.now();

/* ---------- Dashboard state ---------- */

const PAGE_SIZE = 5;

let currentPage = 1;
let currentAlertId = null;
let map = null;
let markerLayer = null;
let geofenceLayer = null;
let markerByTravelerId = new Map();
let mapUserInteracted = false;
let autoCenteringMap = false;
let dashboardSummary = null;
let dashboardSummaryLoading = false;
let dashboardRecordsLoading = false;
let dashboardGeofencesLoading = false;
let knownAlertIds = new Set();
let alertHistoryInitialized = false;
let notificationAudioContext = null;
let notificationAudioReady = false;

/* ---------- Helper functions ---------- */

function getElement(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return replacements[character];
  });
}

function initials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join("")
    .toUpperCase();
}

function formatStatus(status) {
  const labels = {
    safe: "Safe",
    attention: "Attention",
    emergency: "Emergency"
  };

  return labels[status] || status || "Unknown";
}

function normalizeTravelerStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["safe", "normal", "active"].includes(status)) return "safe";
  if (["attention", "warning", "at_risk"].includes(status)) return "attention";
  if (["emergency", "sos", "critical"].includes(status)) return "emergency";
  return "unknown";
}

function formatDashboardDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString("en-IN");
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function showInfo(title, message) {
  const titleElement = getElement("infoDialogTitle");
  const contentElement = getElement("infoDialogContent");

  if (!titleElement || !contentElement) {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  titleElement.textContent = title;
  contentElement.innerHTML =
    `<p class="info-message">${escapeHTML(message)}</p>`;

  openDialog("infoDialog");
}

function openDialog(id) {
  const dialog = getElement(id);

  if (!dialog) return;

  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(id) {
  const dialog = getElement(id);

  if (!dialog) return;

  if (typeof dialog.close === "function") {
    if (dialog.open) dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

/* ---------- Dashboard statistics API ---------- */

async function updateStatistics() {
  if (dashboardSummaryLoading) return;
  dashboardSummaryLoading = true;

  const totalTravelersElement = getElement("totalTravelers");
  const openAlertsElement = getElement("openAlerts");
  const monitoredZonesElement = getElement("monitoredZones");

  try {
    const response = await fetch(
      window.TRAVEL_NEXUS_API_ORIGIN + "/api/authority/dashboard-summary/"
    );

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error("Invalid dashboard API response.");
    }

    dashboardSummary = result.data;

    if (totalTravelersElement) {
      totalTravelersElement.textContent =
        Number(result.data.total_travelers).toLocaleString("en-IN");
    }

    if (openAlertsElement) {
      openAlertsElement.textContent =
        Number(result.data.unresolved_alerts).toLocaleString("en-IN");
    }

    if (monitoredZonesElement) {
      monitoredZonesElement.textContent =
        Number(result.data.active_geofences).toLocaleString("en-IN");
    }

    const alertCount = document.querySelector(".nav-count");

    if (alertCount) {
      alertCount.textContent = result.data.unresolved_alerts;
      alertCount.hidden =
        Number(result.data.unresolved_alerts) === 0;
    }
    const notificationCount = document.querySelector(".notification-count");
    if (notificationCount) {
      notificationCount.textContent = result.data.unresolved_alerts;
      notificationCount.hidden =
        Number(result.data.unresolved_alerts) === 0;
    }

    console.log("Dashboard statistics loaded:", result.data);
  } catch (error) {
    console.error("Dashboard statistics error:", error);
  } finally {
    dashboardSummaryLoading = false;
  }
}

async function loadDashboardRecords() {
  if (dashboardRecordsLoading) return;
  dashboardRecordsLoading = true;

  try {
    const [travelerResponse, alertResponse] = await Promise.all([
      fetch(`${DASHBOARD_API}/travelers/`, { cache: "no-store" }),
      fetch(`${DASHBOARD_API}/alerts/`, { cache: "no-store" })
    ]);

    if (!travelerResponse.ok || !alertResponse.ok) {
      throw new Error(
        `Dashboard records request failed (travelers: HTTP ${travelerResponse.status}, alerts: HTTP ${alertResponse.status}).`
      );
    }

    const [travelerResult, alertResult] = await Promise.all([
      travelerResponse.json(),
      alertResponse.json()
    ]);
    if (!travelerResult.success || !Array.isArray(travelerResult.data)) {
      throw new Error("The travelers API returned an invalid response.");
    }
    if (!alertResult.success || !Array.isArray(alertResult.data)) {
      throw new Error("The alerts API returned an invalid response.");
    }

    const incomingAlerts = alertResult.data.map(record => ({
      id: String(record.id),
      title: record.title || record.alert_type || "Emergency alert",
      description: record.description || "No additional details.",
      type: String(record.alert_type || "").toLowerCase(),
      location: record.latitude != null && record.longitude != null
        ? `${Number(record.latitude).toFixed(5)}, ${Number(record.longitude).toFixed(5)}`
        : "Location unavailable",
      severity: String(record.severity || "Low").replace(/\b\w/g, value => value.toUpperCase()),
      status: String(record.status || "open").replace(/_/g, " ")
        .replace(/\b\w/g, value => value.toUpperCase()),
      travelerId: String(record.traveler_id || record.traveler_profile_id || ""),
      time: formatDashboardDate(record.created_at),
      createdAt: Date.parse(record.created_at)
    }));
    const newSosAlerts = incomingAlerts.filter(alert =>
      alert.type === "sos" &&
      !["Resolved", "Closed"].includes(alert.status) &&
      (alertHistoryInitialized
        ? !knownAlertIds.has(alert.id)
        : alert.createdAt >= dashboardStartedAt)
    );
    const newGeofenceAlerts = incomingAlerts.filter(alert =>
      alert.type === "geofence_entry" &&
      !["Resolved", "Closed"].includes(alert.status) &&
      (alertHistoryInitialized
        ? !knownAlertIds.has(alert.id)
        : alert.createdAt >= dashboardStartedAt)
    );

    travelers.splice(0, travelers.length, ...travelerResult.data.map(record => ({
      id: String(record.traveler_id || record.profile_id || ""),
      profileId: String(record.profile_id || ""),
      name: record.traveler_name || "Name unavailable",
      email: record.email || "",
      phone: record.phone || "",
      location: record.destination ||
        (record.latitude != null && record.longitude != null
          ? `${Number(record.latitude).toFixed(5)}, ${Number(record.longitude).toFixed(5)}`
          : "Location unavailable"),
      status: normalizeTravelerStatus(record.emergency_status),
      updated: formatDashboardDate(record.location_recorded_at || record.start_time),
      updatedRaw: record.location_recorded_at || record.start_time || "",
      locationRecordedAt: record.location_recorded_at || "",
      activeNow: Boolean(record.location_recorded_at) &&
        Date.now() - Date.parse(record.location_recorded_at) <= 120000,
      lat: record.latitude == null ? null : Number(record.latitude),
      lng: record.longitude == null ? null : Number(record.longitude)
    })));

    alerts.splice(0, alerts.length, ...incomingAlerts);
    knownAlertIds = new Set(incomingAlerts.map(alert => alert.id));
    alertHistoryInitialized = true;
    const recentLocationCount = travelers.filter(traveler =>
      traveler.activeNow
    ).length;
    const activeTravelersElement = getElement("activeTravelers");
    if (activeTravelersElement) {
      activeTravelersElement.textContent =
        recentLocationCount.toLocaleString("en-IN");
    }
    renderTravelerTable();
    renderAlerts();
    renderRecentNotifications();
    updateMapMarkers();
    newSosAlerts.forEach(notifyAuthorityOfSos);
    if (newGeofenceAlerts.length) {
      const severityRank = { High: 3, Medium: 2, Low: 1 };
      newGeofenceAlerts.sort((a, b) =>
        (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0)
      );
      notifyAuthorityOfGeofence(newGeofenceAlerts[0]);
    }
  } catch (error) {
    console.error("Dashboard records could not be loaded:", error);
    const mapStatus = getElement("mapStatus");
    if (mapStatus) {
      mapStatus.textContent = travelers.length
        ? "Connection delayed · showing last update"
        : "Live traveler data unavailable";
    }
  } finally {
    dashboardRecordsLoading = false;
  }
}

async function loadDashboardGeofences() {
  if (dashboardGeofencesLoading) return;
  dashboardGeofencesLoading = true;

  try {
    const response = await fetch(`${DASHBOARD_API}/geofences/`, {
      cache: "no-store"
    });
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error(
        result.message || `Geofence request failed (HTTP ${response.status}).`
      );
    }

    const activeZones = result.data.filter(zone => zone.is_active === true);
    const previousZones = new Map(geofences.map(zone => [
      String(zone.id),
      `${zone.latitude},${zone.longitude},${zone.radius_meters}`
    ]));
    const zoneSetChanged = activeZones.length !== previousZones.size ||
      activeZones.some(zone =>
        previousZones.get(String(zone.id)) !==
        `${zone.latitude},${zone.longitude},${zone.radius_meters}`
      );
    geofences.splice(0, geofences.length, ...activeZones);
    updateMapGeofences();
    if (zoneSetChanged) resetMapView();
    const status = getElement("geofenceMapStatus");
    if (status) {
      status.textContent =
        `${geofences.length} active safety zone${geofences.length === 1 ? "" : "s"}`;
    }
  } catch (error) {
    console.error("Dashboard safety zones could not be refreshed:", error);
    const status = getElement("geofenceMapStatus");
    if (status) {
      status.textContent = geofences.length
        ? "Safety-zone connection delayed · showing last update"
        : "Safety zones unavailable";
    }
  } finally {
    dashboardGeofencesLoading = false;
  }
}

function unlockNotificationAudio() {
  if (notificationAudioReady) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    console.warn("This browser does not support dashboard notification audio.");
    const button = getElement("enableAlertSoundButton");
    if (button) {
      button.textContent = "Sound unavailable";
      button.disabled = true;
    }
    return;
  }

  try {
    if (
      !notificationAudioContext ||
      notificationAudioContext.state === "closed"
    ) {
      notificationAudioContext = new AudioContextClass();
    }
  } catch (error) {
    console.warn("Dashboard notification audio could not be created:", error);
    const button = getElement("enableAlertSoundButton");
    if (button) button.textContent = "Retry enabling SOS sound";
    return;
  }

  notificationAudioContext.resume()
    .then(() => {
      notificationAudioReady = true;
      const button = getElement("enableAlertSoundButton");
      if (button) {
        button.textContent = "SOS sound enabled";
        button.disabled = true;
      }
    })
    .catch(error => {
      console.warn("Dashboard notification audio could not be enabled:", error);
      const button = getElement("enableAlertSoundButton");
      if (button) button.textContent = "Retry enabling SOS sound";
    });
}

function playSosNotificationSound() {
  if (!notificationAudioReady || !notificationAudioContext ||
      notificationAudioContext.state !== "running") {
    console.warn("SOS sound is unavailable until dashboard audio is enabled by a user interaction.");
    return;
  }

  const now = notificationAudioContext.currentTime;
  [880, 660].forEach((frequency, index) => {
    const start = now + index * 0.24;
    const oscillator = notificationAudioContext.createOscillator();
    const volume = notificationAudioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(0.18, start + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
    oscillator.connect(volume);
    volume.connect(notificationAudioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.2);
  });
}

function notifyAuthorityOfSos(alert) {
  playSosNotificationSound();
  showAlertDetails(alert.id);
}

function notifyAuthorityOfGeofence(alert) {
  showAlertDetails(alert.id);
}

function renderRecentNotifications() {
  const container = getElement("notificationItems");
  if (!container) return;

  const recent = alerts.slice(0, 5);
  if (!recent.length) {
    container.innerHTML = '<p class="notification-empty">No recent notifications.</p>';
    return;
  }

  container.innerHTML = recent.map(alert => `
    <button class="notification-item notification-item-button" type="button" data-notification-alert="${escapeHTML(alert.id)}">
      <span class="notification-icon ${alert.severity === "High" ? "danger" : "warning"}"><i data-lucide="${alert.type === "sos" ? "siren" : "bell"}"></i></span>
      <span><strong>${escapeHTML(alert.title)}</strong><p>${escapeHTML(alert.description)}</p><small>${escapeHTML(alert.time)} · ${escapeHTML(alert.status)}</small></span>
    </button>
  `).join("");
  refreshIcons();
}

/* ---------- Traveler table and pagination ---------- */

function getFilteredTravelers() {
  const searchElement = getElement("travelerSearch");
  const statusElement = getElement("statusFilter");

  const searchText = searchElement
    ? searchElement.value.trim().toLowerCase()
    : "";

  const selectedStatus = statusElement
    ? statusElement.value
    : "all";

  return travelers.filter(traveler => {
    const matchesSearch = [
      traveler.name,
      traveler.id,
      traveler.email,
      traveler.location,
      traveler.phone
    ].some(value =>
      String(value).toLowerCase().includes(searchText)
    );

    const matchesStatus =
      selectedStatus === "all" ||
      traveler.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });
}

function renderTravelerTable() {
  const tbody = getElement("travelerTableBody");
  const emptyState = getElement("emptyState");

  if (!tbody) return;

  const filteredTravelers = getFilteredTravelers();

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTravelers.length / PAGE_SIZE)
  );

  currentPage = Math.min(currentPage, totalPages);

  const startIndex = (currentPage - 1) * PAGE_SIZE;

  const visibleTravelers = filteredTravelers.slice(
    startIndex,
    startIndex + PAGE_SIZE
  );

  tbody.innerHTML = visibleTravelers.map(traveler => `
    <tr>
      <td>
        <div class="traveler-identity">
          <span class="traveler-avatar">
            ${escapeHTML(initials(traveler.name))}
          </span>
          <span>
            <span class="traveler-name">
              ${escapeHTML(traveler.name)}
            </span>
            <span class="traveler-email">
              ${escapeHTML(traveler.email)}
            </span>
            <span class="traveler-presence ${traveler.activeNow ? "is-active" : "is-registered"}">
              ${traveler.activeNow ? "Active now · location shared" : "Registered · no recent location"}
            </span>
          </span>
        </div>
      </td>
      <td>${escapeHTML(traveler.id)}</td>
      <td>${escapeHTML(traveler.location)}</td>
      <td>
        <span class="status-pill ${escapeHTML(traveler.status)}">
          ${escapeHTML(formatStatus(traveler.status))}
        </span>
      </td>
      <td>${escapeHTML(traveler.updated)}</td>
      <td class="align-right">
        <button type="button" class="table-action"
          data-traveler-id="${escapeHTML(traveler.id)}">
          <i data-lucide="eye"></i> View
        </button>
      </td>
    </tr>
  `).join("");

  if (emptyState) {
    emptyState.hidden = filteredTravelers.length > 0;
  }

  const tableSummary = getElement("tableSummary");

  if (tableSummary) {
    if (filteredTravelers.length === 0) {
      tableSummary.textContent = "No matching travelers";
    } else {
      const first = startIndex + 1;
      const last = Math.min(
        startIndex + PAGE_SIZE,
        filteredTravelers.length
      );

      tableSummary.textContent =
        `Showing ${first}–${last} of ${filteredTravelers.length} travelers`;
    }
  }

  renderPagination(totalPages);
  refreshIcons();
}

function renderPagination(totalPages) {
  const pagination = getElement("pagination");

  if (!pagination) return;

  let html = `
    <button type="button" class="page-button"
      data-page="${currentPage - 1}"
      aria-label="Previous page"
      ${currentPage === 1 ? "disabled" : ""}>
      <i data-lucide="chevron-left"></i>
    </button>
  `;

  for (let page = 1; page <= totalPages; page++) {
    html += `
      <button type="button"
        class="page-button ${page === currentPage ? "active" : ""}"
        data-page="${page}"
        ${page === currentPage ? 'aria-current="page"' : ""}>
        ${page}
      </button>
    `;
  }

  html += `
    <button type="button" class="page-button"
      data-page="${currentPage + 1}"
      aria-label="Next page"
      ${currentPage === totalPages ? "disabled" : ""}>
      <i data-lucide="chevron-right"></i>
    </button>
  `;

  pagination.innerHTML = html;
  refreshIcons();
}

function showTravelerDetails(travelerId) {
  const traveler = travelers.find(item => item.id === travelerId);

  if (!traveler) return;

  const content = getElement("travelerDialogContent");

  if (!content) {
    showInfo(
      "Traveler details",
      `${traveler.name} (${traveler.id}) — ${traveler.location}`
    );
    return;
  }

  content.innerHTML = `
    <div class="detail-grid">
      <div class="detail-field">
        <small>Full name</small>
        <strong>${escapeHTML(traveler.name)}</strong>
      </div>
      <div class="detail-field">
        <small>Traveler ID</small>
        <strong>${escapeHTML(traveler.id)}</strong>
      </div>
      <div class="detail-field">
        <small>Email address</small>
        <span>${escapeHTML(traveler.email)}</span>
      </div>
      <div class="detail-field">
        <small>Contact number</small>
        <span>${escapeHTML(traveler.phone)}</span>
      </div>
      <div class="detail-field full">
        <small>Current location</small>
        <strong>${escapeHTML(traveler.location)}</strong>
      </div>
      <div class="detail-field">
        <small>Current status</small>
        <span class="status-pill ${escapeHTML(traveler.status)}">
          ${escapeHTML(formatStatus(traveler.status))}
        </span>
      </div>
      <div class="detail-field">
        <small>Last update</small>
        <span>${escapeHTML(traveler.updated)}</span>
      </div>
    </div>
  `;

  openDialog("travelerDialog");
}

/* ---------- Recent alerts ---------- */

function renderAlerts() {
  const container = getElement("recentAlerts");

  if (!container) return;

  const visibleAlerts = alerts.slice(0, 5);

  if (visibleAlerts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>No alerts available</strong>
        <p>There are currently no recorded alerts.</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  container.innerHTML = visibleAlerts.map(alert => {
    const severityClass = {
      High: "high",
      Medium: "medium",
      Low: "low"
    }[alert.severity] || "low";

    const iconClass = {
      High: "danger",
      Medium: "warning",
      Low: "info"
    }[alert.severity] || "info";

    const iconName = {
      High: "alert-triangle",
      Medium: "map-pin",
      Low: "user-round-search"
    }[alert.severity] || "bell";

    return `
      <div class="alert-row">
        <span class="alert-symbol ${iconClass}">
          <i data-lucide="${iconName}"></i>
        </span>
        <div class="alert-content">
          <div class="alert-title-row">
            <strong>${escapeHTML(alert.title)}</strong>
            <span class="severity ${severityClass}">
              ${escapeHTML(alert.severity)}
            </span>
          </div>
          <p>${escapeHTML(alert.description)}</p>
          <small>
            <i data-lucide="map-pin"></i>
            ${escapeHTML(alert.location)} · ${escapeHTML(alert.time)}
          </small>
          <small>
            Alert ID: ${escapeHTML(alert.id)} · ${escapeHTML(alert.status)}
          </small>
        </div>
        <button type="button" class="icon-button small alert-view-button"
          data-alert-id="${escapeHTML(alert.id)}"
          aria-label="View alert ${escapeHTML(alert.id)}">
          <i data-lucide="chevron-right"></i>
        </button>
      </div>
    `;
  }).join("");

  refreshIcons();
}

function showAlertDetails(alertId) {
  const alert = alerts.find(item => item.id === alertId);

  if (!alert) return;

  currentAlertId = alert.id;

  const traveler = travelers.find(
    item => item.id === alert.travelerId
  );

  const content = getElement("alertDialogContent");

  if (content) {
    content.innerHTML = `
      <div class="detail-grid">
        <div class="detail-field">
          <small>Alert ID</small>
          <strong>${escapeHTML(alert.id)}</strong>
        </div>
        <div class="detail-field">
          <small>Severity</small>
          <strong>${escapeHTML(alert.severity)}</strong>
        </div>
        <div class="detail-field full">
          <small>Alert title</small>
          <strong>${escapeHTML(alert.title)}</strong>
        </div>
        <div class="detail-field full">
          <small>Description</small>
          <span>${escapeHTML(alert.description)}</span>
        </div>
        <div class="detail-field full">
          <small>Location</small>
          <span>${escapeHTML(alert.location)}</span>
        </div>
        <div class="detail-field">
          <small>Related traveler</small>
          <span>${escapeHTML(traveler ? traveler.name : "Not available")}</span>
        </div>
        <div class="detail-field">
          <small>Alert status</small>
          <strong>${escapeHTML(alert.status)}</strong>
        </div>
        <div class="detail-field">
          <small>Reported</small>
          <span>${escapeHTML(alert.time)}</span>
        </div>
      </div>
    `;
  }

  const resolveButton = getElement("resolveAlertButton");

  if (resolveButton) {
    resolveButton.disabled = alert.status === "Resolved";
    resolveButton.textContent =
      alert.status === "Resolved"
        ? "Already resolved"
        : "Mark as resolved";
  }

  openDialog("alertDialog");
}

function resolveCurrentAlert() {
  if (!currentAlertId) return;

  const alert = alerts.find(item => item.id === currentAlertId);

  if (!alert || alert.status === "Resolved") return;

  fetch(`${DASHBOARD_API}/alerts/${encodeURIComponent(alert.id)}/status/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "resolved" })
  })
    .then(async response => {
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || `Alert update failed (HTTP ${response.status}).`);
      }
      alert.status = "Resolved";
      renderAlerts();
      closeDialog("alertDialog");
      showInfo("Alert updated", "The alert was marked as resolved in the database.");
      updateStatistics();
    })
    .catch(error => {
      console.error("Could not resolve alert:", error);
      showInfo("Alert update failed", error.message);
    });
}

/* ---------- Leaflet map ---------- */

function initMap() {
  const mapContainer = getElement("realMap");

  if (!mapContainer) {
    console.warn("Map container #realMap was not found.");
    return;
  }

  if (!window.L) {
    mapContainer.innerHTML = `
      <div class="empty-state">
        <strong>Map could not be loaded</strong>
        <p>Check your internet connection and Leaflet scripts.</p>
      </div>
    `;
    return;
  }

  try {
    map = L.map(mapContainer, {
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      minZoom: 3,
      maxZoom: 19
    }).setView([20.5937, 78.9629], 5);

    const streetLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri, TomTom, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors, and the GIS User Community"
      }
    ).addTo(map);
    const satelliteLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community"
      }
    );
    const satelliteLabelsLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Labels &copy; Esri"
      }
    );
    const satellitePreviewLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community"
      }
    );
    geofenceLayer = L.layerGroup().addTo(map);
    L.control.layers(
      { Streets: streetLayer, Satellite: satelliteLayer },
      { "Active safety zones": geofenceLayer },
      { position: "topright", collapsed: true }
    ).addTo(map);
    map.on("baselayerchange", event => {
      if (event.layer === satelliteLayer) {
        satelliteLabelsLayer.addTo(map);
      } else if (map.hasLayer(satelliteLabelsLayer)) {
        map.removeLayer(satelliteLabelsLayer);
      }
    });
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    if (L.control && typeof L.control.fullscreen === "function") {
      L.control.fullscreen({ position: "topright" }).addTo(map);
    }
    if (L.control && typeof L.control.locate === "function") {
      L.control.locate({
        position: "topright",
        flyTo: true,
        keepCurrentZoomLevel: true
      }).addTo(map);
    }
    if (L.Control && typeof L.Control.geocoder === "function") {
      L.Control.geocoder({ defaultMarkGeocode: false, position: "topleft" })
        .on("markgeocode", event => map.fitBounds(event.geocode.bbox))
        .addTo(map);
    }
    if (L.Control && typeof L.Control.MiniMap === "function") {
      new L.Control.MiniMap(satellitePreviewLayer, {
        position: "bottomright",
        toggleDisplay: true,
        minimized: false,
        zoomLevelOffset: -5,
        aimingRectOptions: {
          color: "#5365ed",
          weight: 2,
          fillOpacity: 0.1
        }
      }).addTo(map);
    }

    markerLayer = L.layerGroup().addTo(map);
    map.on("zoomstart", () => {
      if (!autoCenteringMap) mapUserInteracted = true;
    });
    map.on("zoomend", () => {
      updateTravelerMapLabels();
    });
    map.on("dragstart", () => {
      if (!autoCenteringMap) mapUserInteracted = true;
    });

    updateMapMarkers();

    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 300);
  } catch (error) {
    console.error("Map initialization error:", error);
  }
}

function getTravelerGeofenceStatus(latitude, longitude) {
  const priorities = { restricted: 4, protected: 4, danger: 4, prohibited: 4, caution: 3, high_risk: 3, safe: 2, tourist: 1 };
  const matches = geofences.filter(zone => {
    const zoneLat = Number(zone.latitude);
    const zoneLng = Number(zone.longitude);
    const radius = Number(zone.radius_meters);
    if (![zoneLat, zoneLng, radius].every(Number.isFinite) || radius <= 0) return false;
    const radians = degrees => degrees * Math.PI / 180;
    const dLat = radians(zoneLat - latitude);
    const dLng = radians(zoneLng - longitude);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(radians(latitude)) * Math.cos(radians(zoneLat)) * Math.sin(dLng / 2) ** 2;
    const distance = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return zone.is_active === true && distance <= radius;
  });
  matches.sort((a, b) =>
    (priorities[String(b.zone_type || "safe").toLowerCase()] || 0) -
    (priorities[String(a.zone_type || "safe").toLowerCase()] || 0)
  );
  return matches[0] || null;
}

function updateMapMarkers() {
  if (!map || !markerLayer || !window.L) return;

  const locatedTravelers = travelers.filter(traveler =>
    Number.isFinite(traveler.lat) && Number.isFinite(traveler.lng)
  );
  const newlyLocated = locatedTravelers.filter(traveler =>
    !markerByTravelerId.has(traveler.id)
  );
  const locatedTravelerIds = new Set(locatedTravelers.map(traveler => traveler.id));

  let trackedLocationOutsideView = false;
  locatedTravelers.forEach(traveler => {
    let marker = markerByTravelerId.get(traveler.id);
    const zone = getTravelerGeofenceStatus(traveler.lat, traveler.lng);
    const zoneType = String(zone?.zone_type || "safe").toLowerCase().replace(/_/g, " ");
    const zoneStatus = zone
      ? `Entered ${zoneType} zone: ${zone.name || "Safety zone"}`
      : "Outside active geofences";
    const zoneColor = {
      restricted: "#ef4444", protected: "#ef4444",
      danger: "#ef4444", prohibited: "#ef4444",
      caution: "#f59e0b", high_risk: "#f59e0b",
      safe: "#22c55e", tourist: "#3b82f6"
    }[String(zone?.zone_type || "safe").toLowerCase()] || "#22c55e";
    const popupContent = `
      <div class="map-popup-title">${escapeHTML(traveler.name)}</div>
      <div class="map-popup-detail">${escapeHTML(traveler.id)}</div>
      <div class="map-popup-detail">Coordinates: ${traveler.lat.toFixed(6)}, ${traveler.lng.toFixed(6)}</div>
      <div class="map-popup-detail">Last shared: ${escapeHTML(traveler.updated)}</div>
      <div class="map-popup-detail" style="color:${zoneColor};font-weight:700">${escapeHTML(zoneStatus)}</div>
    `;

    if (!marker) {
      marker = L.marker([traveler.lat, traveler.lng], {
        title: `${traveler.name} · ${formatStatus(traveler.status)}`
      }).addTo(markerLayer);
      marker.bindPopup(popupContent);
      marker.bindTooltip(escapeHTML(traveler.name), {
        permanent: false,
        direction: "top",
        offset: [0, -10],
        opacity: 0.95,
        className: "traveler-map-tooltip"
      });
      markerByTravelerId.set(traveler.id, marker);
    } else {
      marker.setLatLng([traveler.lat, traveler.lng]);
      if (map && !map.getBounds().contains(marker.getLatLng())) {
        trackedLocationOutsideView = true;
      }
      marker.options.title = `${traveler.name} · ${formatStatus(traveler.status)}`;
      marker.setPopupContent(popupContent);
      marker.setTooltipContent(escapeHTML(traveler.name));
    }
  });
  if ((newlyLocated.length || trackedLocationOutsideView) && !mapUserInteracted) {
    autoCenteringMap = true;
    map.once("moveend", () => {
      autoCenteringMap = false;
    });
    const safetyBounds = L.latLngBounds([]);
    geofenceLayer?.eachLayer(layer => {
      if (typeof layer.getBounds === "function") safetyBounds.extend(layer.getBounds());
    });
    locatedTravelers.forEach(traveler => safetyBounds.extend([traveler.lat, traveler.lng]));
    if (safetyBounds.isValid()) {
      map.fitBounds(safetyBounds, { padding: [48, 48], maxZoom: 13 });
    }
  }
  markerByTravelerId.forEach((marker, travelerId) => {
    if (!locatedTravelerIds.has(travelerId)) {
      markerLayer.removeLayer(marker);
      markerByTravelerId.delete(travelerId);
    }
  });
  updateTravelerMapLabels();

  const mapStatus = getElement("mapStatus");
  const travelerSummary = getElement("mapTravelerSummary");
  if (travelerSummary) {
    const counts = travelers.reduce((summary, traveler) => {
      if (traveler.status in summary) summary[traveler.status] += 1;
      else summary.unknown += 1;
      return summary;
    }, { safe: 0, attention: 0, emergency: 0, unknown: 0 });
    travelerSummary.textContent =
      `${counts.safe} safe · ${counts.attention} attention · ${counts.emergency} emergency` +
      (counts.unknown ? ` · ${counts.unknown} unclassified` : "");
  }
  if (mapStatus) {
    const totalTravelers = travelers.length;
    const profileLabel = `${totalTravelers} traveler${totalTravelers === 1 ? "" : "s"} registered`;
    mapStatus.textContent = locatedTravelers.length
      ? `${profileLabel} · ${locatedTravelers.length} location${locatedTravelers.length === 1 ? "" : "s"} on map`
      : `${profileLabel} · no saved locations yet`;
  }
  const geofenceStatus = getElement("geofenceMapStatus");
  if (geofenceStatus) {
    geofenceStatus.textContent =
      `${geofences.length} active safety zone${geofences.length === 1 ? "" : "s"}`;
  }
}

function updateMapGeofences() {
  if (!map || !geofenceLayer || !window.L) return;

  geofenceLayer.clearLayers();
  geofences.forEach(zone => {
    const latitude = Number(zone.latitude);
    const longitude = Number(zone.longitude);
    const radius = Number(zone.radius_meters);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(radius) ||
      radius <= 0
    ) {
      console.warn("Skipping invalid geofence map record:", zone.id);
      return;
    }

    const zoneType = String(zone.zone_type || "safe").toLowerCase();
    const color = {
      restricted: "#ef4444",
      protected: "#ef4444",
      danger: "#ef4444",
      prohibited: "#ef4444",
      caution: "#f59e0b",
      high_risk: "#f59e0b",
      tourist: "#3b82f6",
      safe: "#22c55e"
    }[zoneType] || "#22c55e";
    const circle = L.circle([latitude, longitude], {
      radius,
      color,
      fillColor: color,
      fillOpacity: 0.16,
      weight: 2
    });
    circle.bindPopup(`
      <div class="map-popup-title">${escapeHTML(zone.name || "Safety zone")}</div>
      <div class="map-popup-detail">${escapeHTML(zone.zone_type || "Zone")} · ${Math.round(radius).toLocaleString("en-IN")} m radius</div>
      ${zone.description ? `<div class="map-popup-detail">${escapeHTML(zone.description)}</div>` : ""}
    `);
    circle.addTo(geofenceLayer);
  });
  map.invalidateSize();
  if (!mapUserInteracted && (geofenceLayer.getLayers().length || markerByTravelerId.size)) {
    const bounds = L.latLngBounds([]);
    geofenceLayer.eachLayer(layer => {
      if (typeof layer.getBounds === "function") bounds.extend(layer.getBounds());
    });
    markerByTravelerId.forEach(marker => bounds.extend(marker.getLatLng()));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
  }
}

function updateTravelerMapLabels() {
  if (!map) return;

  markerByTravelerId.forEach(marker => {
    if (map.getZoom() >= 11) {
      marker.openTooltip();
    } else {
      marker.closeTooltip();
    }
  });
}

function resetMapView() {
  if (!map) return;
  mapUserInteracted = false;
  const bounds = L.latLngBounds([]);
  geofenceLayer?.eachLayer(layer => {
    if (typeof layer.getBounds === "function") bounds.extend(layer.getBounds());
  });
  markerByTravelerId.forEach(marker => bounds.extend(marker.getLatLng()));
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
  else map.setView([20.5937, 78.9629], 5);
  map.invalidateSize();
}

/* ---------- Header dropdowns ---------- */

function closeFloatingPanels(exceptId = "") {
  ["notificationPanel", "profilePanel"].forEach(id => {
    const panel = getElement(id);

    if (panel && id !== exceptId) {
      panel.hidden = true;
    }
  });

  const notificationPanel = getElement("notificationPanel");
  const profilePanel = getElement("profilePanel");
  const notificationButton = getElement("notificationButton");
  const profileButton = getElement("profileButton");

  if (notificationButton && notificationPanel) {
    notificationButton.setAttribute(
      "aria-expanded",
      String(!notificationPanel.hidden)
    );
  }

  if (profileButton && profilePanel) {
    profileButton.setAttribute(
      "aria-expanded",
      String(!profilePanel.hidden)
    );
  }
}

function togglePanel(panelId) {
  const panel = getElement(panelId);

  if (!panel) return;

  const shouldOpen = panel.hidden;

  closeFloatingPanels();
  panel.hidden = !shouldOpen;

  const buttonId = panelId === "notificationPanel"
    ? "notificationButton"
    : "profileButton";

  const button = getElement(buttonId);

  if (button) {
    button.setAttribute("aria-expanded", String(shouldOpen));
  }
}

/* ---------- Refresh dashboard ---------- */

function refreshDashboard() {
  updateStatistics();
  loadDashboardRecords();
  loadDashboardGeofences();

  const lastUpdated = getElement("lastUpdated");

  if (lastUpdated) {
    lastUpdated.textContent =
      "Updated at " +
      new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
  }

  const refreshButton = getElement("refreshButton");
  const enableAlertSoundButton = getElement("enableAlertSoundButton");

  if (refreshButton) {
    const originalText = refreshButton.innerHTML;

    refreshButton.innerHTML =
      '<i data-lucide="check-circle"></i> Refreshed';

    refreshIcons();

    setTimeout(() => {
      if (!refreshButton.isConnected) return;

      refreshButton.innerHTML = originalText;
      refreshIcons();
    }, 1200);
  }
}

/* ---------- Event listeners ---------- */

function setupEventListeners() {
  const travelerSearch = getElement("travelerSearch");
  const statusFilter = getElement("statusFilter");
  const pagination = getElement("pagination");
  const travelerTableBody = getElement("travelerTableBody");
  const recentAlerts = getElement("recentAlerts");

  const refreshButton = getElement("refreshButton");
  const locateButton = getElement("locateButton");

  const notificationButton = getElement("notificationButton");
  const profileButton = getElement("profileButton");
  const markAllRead = getElement("markAllRead");

  const profileDetailsButton = getElement("profileDetailsButton");
  const settingsButton = getElement("settingsButton");
  const signOutButton = getElement("signOutButton");
  const resolveAlertButton = getElement("resolveAlertButton");

  if (enableAlertSoundButton) {
    enableAlertSoundButton.addEventListener("click", unlockNotificationAudio);
  }

  if (travelerSearch) {
    travelerSearch.addEventListener("input", () => {
      currentPage = 1;
      renderTravelerTable();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener("change", () => {
      currentPage = 1;
      renderTravelerTable();
    });
  }

  if (pagination) {
    pagination.addEventListener("click", event => {
      const button = event.target.closest("[data-page]");

      if (!button || button.disabled) return;

      const nextPage = Number(button.dataset.page);

      if (!Number.isInteger(nextPage) || nextPage < 1) return;

      currentPage = nextPage;
      renderTravelerTable();
    });
  }

  if (travelerTableBody) {
    travelerTableBody.addEventListener("click", event => {
      const button = event.target.closest("[data-traveler-id]");

      if (button) {
        showTravelerDetails(button.dataset.travelerId);
      }
    });
  }

  if (recentAlerts) {
    recentAlerts.addEventListener("click", event => {
      const button = event.target.closest("[data-alert-id]");

      if (button) {
        showAlertDetails(button.dataset.alertId);
      }
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", refreshDashboard);
  }

  if (locateButton) {
    locateButton.addEventListener("click", resetMapView);
  }

  if (notificationButton) {
    notificationButton.addEventListener("click", () => {
      togglePanel("notificationPanel");
    });
  }

  getElement("notificationItems")?.addEventListener("click", event => {
    const item = event.target.closest("[data-notification-alert]");
    if (!item) return;
    showAlertDetails(item.dataset.notificationAlert);
    const panel = getElement("notificationPanel");
    if (panel) panel.hidden = true;
    notificationButton?.setAttribute("aria-expanded", "false");
  });

  if (profileButton) {
    profileButton.addEventListener("click", () => {
      togglePanel("profilePanel");
    });
  }

  if (markAllRead) {
    markAllRead.addEventListener("click", () => {
      const notificationCount = getElement("notificationCount");

      if (notificationCount) {
        notificationCount.hidden = true;
        notificationCount.textContent = "0";
      }

      markAllRead.textContent = "All read";
    });
  }

  if (profileDetailsButton) {
    profileDetailsButton.type = "button";

    profileDetailsButton.addEventListener("click", () => {
      closeFloatingPanels();

      showInfo(
        "Administrator profile",
        "Administrator account details are managed by the configured account provider."
      );
    });
  }

  if (settingsButton) {
    settingsButton.type = "button";

    settingsButton.addEventListener("click", () => {
      closeFloatingPanels();
      window.location.href = "settings.html";
    });
  }

  if (signOutButton) {
    signOutButton.type = "button";

    signOutButton.addEventListener("click", async () => {
      try {
        const { error } = await window.travelNexusSupabase.auth.signOut();
        if (error) throw error;
        window.location.replace("login.html");
      } catch (error) {
        console.error("Sign-out failed:", error);
        showInfo("Sign-out failed", error.message || "Unable to sign out.");
      }
    });
  }

  if (resolveAlertButton) {
    resolveAlertButton.addEventListener(
      "click",
      resolveCurrentAlert
    );
  }

  document.querySelectorAll("[data-close-dialog]").forEach(button => {
    button.addEventListener("click", () => {
      closeDialog(button.dataset.closeDialog);
    });
  });

  document.addEventListener("click", event => {
    const target = event.target;

    if (!(target instanceof Element)) return;

    if (!target.closest(".header-action-wrap")) {
      closeFloatingPanels();
    }
  });

  document.querySelectorAll("dialog.app-dialog").forEach(dialog => {
    dialog.addEventListener("click", event => {
      if (event.target === dialog) {
        closeDialog(dialog.id);
      }
    });
  });

  window.addEventListener("resize", () => {
    if (map) map.invalidateSize();
  });
}

/* ---------- Initialize dashboard ---------- */

async function initDashboard() {
  if (
    window.travelNexusAuthReady &&
    !(await window.travelNexusAuthReady)
  ) {
    return;
  }

  const currentYear = getElement("currentYear");

  if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
  }

  initMap();
  updateStatistics();
  loadDashboardRecords();
  loadDashboardGeofences();
  setupEventListeners();
  refreshIcons();
  const refreshDashboardData = () => {
    if (document.visibilityState !== "visible") return;
    updateStatistics();
    loadDashboardRecords();
    loadDashboardGeofences();
  };

  // Poll frequently so newly submitted SOS alerts appear without a page reload.
  window.setInterval(refreshDashboardData, 2000);
  document.addEventListener("visibilitychange", refreshDashboardData);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}
