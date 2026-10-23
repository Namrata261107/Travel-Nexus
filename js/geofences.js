
"use strict";

/* =========================================================
   TRAVEL NEXUS - GEOFENCES
   ========================================================= */

const GEOFENCES_API_URL =
    window.TRAVEL_NEXUS_API_ORIGIN + "/api/authority/geofences/";

const ACTIVITY_STORAGE_KEY = "travelNexusGeofenceActivity";
const RULES_STORAGE_KEY = "travelNexusGeofenceRules";

const TYPE_COLORS = {
    safe: "#20ad7b",
    caution: "#efa13a",
    restricted: "#e45c65",
    tourist: "#3b82f6"
};

let map = null;
let zoneLayer = null;
let markerLayer = null;
let zones = [];
let selectedZoneId = null;
let activityItems = [];
let toastTimer = null;

/* =========================================================
   HELPER FUNCTIONS
   ========================================================= */

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function colorFor(type) {
    return TYPE_COLORS[String(type || "safe").toLowerCase()]
        || TYPE_COLORS.safe;
}

function typeLabel(type) {
    const labels = {
        safe: "Safe Zone",
        caution: "Caution Zone",
        restricted: "Restricted Zone",
        tourist: "Tourist Zone"
    };

    return labels[String(type || "safe").toLowerCase()]
        || "Safe Zone";
}

function radiusLabel(radius) {
    const value = Number(radius);

    if (!Number.isFinite(value)) return "200 m";

    return value >= 1000
        ? `${(value / 1000).toFixed(2)} km`
        : `${value} m`;
}

function normalizeBoolean(value) {
    if (typeof value === "string") {
        return value.toLowerCase() === "true" || value === "1";
    }

    return value === true || value === 1;
}

function normalizeZone(zone) {
    const latitude = Number(zone.latitude ?? zone.lat);
    const longitude = Number(
        zone.longitude ?? zone.lng ?? zone.lon
    );

    return {
        ...zone,
        id: String(zone.id ?? zone.geofence_id ?? ""),
        name: zone.name || "Unnamed Geofence",
        description: zone.description || "",
        zone_type: String(zone.zone_type || "safe").toLowerCase(),
        latitude,
        longitude,
        radius_meters: Number(
            zone.radius_meters ?? zone.radius ?? 200
        ),
        is_active: zone.is_active === undefined
            ? true
            : normalizeBoolean(zone.is_active)
    };
}

function validCoordinates(lat, lng) {
    return Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180;
}

function getZoneById(id) {
    return zones.find(zone => String(zone.id) === String(id));
}

function showToast(message, isError = false) {
    const toast = $("toast");
    const toastMessage = $("toastMessage");

    if (!toast || !toastMessage) {
        console[isError ? "error" : "log"](message);
        return;
    }

    toastMessage.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("show");

    if (toastTimer) clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        cache: "no-store",
        headers: {
            Accept: "application/json",
            ...(options.body
                ? { "Content-Type": "application/json" }
                : {}),
            ...(options.headers || {})
        }
    });

    const responseText = await response.text();
    let result = null;

    if (responseText) {
        try {
            result = JSON.parse(responseText);
        } catch {
            result = { message: responseText };
        }
    }

    if (!response.ok) {
        const message =
            result?.detail ||
            result?.message ||
            result?.error ||
            `Request failed with status ${response.status}`;

        throw new Error(message);
    }

    return result;
}

/* =========================================================
   MAP INITIALIZATION
   ========================================================= */

function initMap() {
    const mapElement = $("geofenceMap");

    // The management page intentionally has no map. The Authority dashboard
    // is the single map for geofences and live traveller tracks.
    if (!mapElement) return;

    if (typeof L === "undefined") {
        console.error("Leaflet is not loaded.");
        showToast("Map library did not load. Check Leaflet scripts.", true);
        return;
    }

    if (map) {
        map.remove();
        map = null;
    }

    map = L.map(mapElement).setView([20.5937, 78.9629], 5);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors"
        }
    ).addTo(map);

    zoneLayer = L.featureGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);

    map.on("click", event => {
        const latitude = $("zoneLatInput");
        const longitude = $("zoneLngInput");

        if (latitude && longitude && isModalOpen()) {
            latitude.value = event.latlng.lat.toFixed(6);
            longitude.value = event.latlng.lng.toFixed(6);
        }
    });

    setTimeout(() => map.invalidateSize(), 300);

    console.log("Geofence map initialized.");
}

function isModalOpen() {
    const modal = $("geofenceModal");

    return Boolean(
        modal &&
        (
            modal.classList.contains("active") ||
            modal.classList.contains("show") ||
            modal.style.display === "flex" ||
            modal.style.display === "block"
        )
    );
}

/* =========================================================
   DRAW GEOFENCE CIRCLES
   ========================================================= */

function drawZones() {
    if (!map || !zoneLayer || !markerLayer) return;

    zoneLayer.clearLayers();
    markerLayer.clearLayers();

    const filteredZones = getFilteredZones();

    console.log("Zones available:", zones);
    console.log("Zones to draw:", filteredZones.length);

    let circlesDrawn = 0;

    filteredZones.forEach(zone => {
        const lat = Number(zone.latitude);
        const lng = Number(zone.longitude);
        const radius = Number(zone.radius_meters);

        if (
            !validCoordinates(lat, lng) ||
            !Number.isFinite(radius) ||
            radius <= 0
        ) {
            console.error("Invalid geofence data:", zone);
            return;
        }

        const color = colorFor(zone.zone_type);

        // Draw the geofence boundary.
        const circle = L.circle([lat, lng], {
            radius: radius,
            color: color,
            fillColor: color,
            fillOpacity: zone.is_active ? 0.25 : 0.08,
            opacity: 1,
            weight: String(zone.id) === String(selectedZoneId) ? 4 : 3,
            dashArray: zone.is_active ? null : "6 6"
        });

        circle.bindPopup(`
            <div>
                <strong>${escapeHTML(zone.name)}</strong>
                <hr>
                Type: ${escapeHTML(typeLabel(zone.zone_type))}<br>
                Radius: ${escapeHTML(radiusLabel(radius))}<br>
                Status: ${zone.is_active ? "Active" : "Inactive"}<br>
                Latitude: ${lat.toFixed(6)}<br>
                Longitude: ${lng.toFixed(6)}<br><br>
                <button type="button"
                    class="map-popup-button"
                    data-zone-id="${escapeHTML(zone.id)}">
                    View Details
                </button>
            </div>
        `);

        circle.on("popupopen", event => {
            const button = event.popup.getElement()?.querySelector(
                "[data-zone-id]"
            );

            button?.addEventListener("click", () => {
                openDetailsModal(button.dataset.zoneId);
            });
        });

        zoneLayer.addLayer(circle);

        // Add a visible center point.
        const marker = L.circleMarker([lat, lng], {
            radius: 7,
            color: "#ffffff",
            weight: 2,
            fillColor: color,
            fillOpacity: 1
        });

        marker.bindTooltip(escapeHTML(zone.name));
        marker.on("click", () => selectZone(zone.id));

        markerLayer.addLayer(marker);

        circlesDrawn++;
    });

    console.log("Geofence circles drawn:", circlesDrawn);
}

/* =========================================================
   FILTERING
   ========================================================= */

function getFilteredZones() {
    const tableSearch = ($("zoneSearch")?.value || "")
        .trim()
        .toLowerCase();

    const mapSearch = ($("mapSearch")?.value || "")
        .trim()
        .toLowerCase();

    const selectedType =
        ($("typeFilter")?.value || "all").toLowerCase();

    const selectedStatus =
        ($("statusFilter")?.value || "all").toLowerCase();

    return zones.filter(zone => {
        const text = [
            zone.name,
            zone.description,
            zone.zone_type,
            typeLabel(zone.zone_type),
            zone.latitude,
            zone.longitude
        ].join(" ").toLowerCase();

        const matchesSearch =
            (!tableSearch || text.includes(tableSearch)) &&
            (!mapSearch || text.includes(mapSearch));

        const matchesType =
            selectedType === "all" ||
            selectedType === zone.zone_type;

        let matchesStatus = true;

        if (["active", "enabled", "running"].includes(selectedStatus)) {
            matchesStatus = zone.is_active;
        }

        if (["inactive", "disabled", "paused"].includes(selectedStatus)) {
            matchesStatus = !zone.is_active;
        }

        return matchesSearch && matchesType && matchesStatus;
    });
}

/* =========================================================
   ZOOM TO ZONES
   ========================================================= */

function zoomToZones() {
    if (!map || !zoneLayer) return;

    const layers = zoneLayer.getLayers();

    if (layers.length === 1) {
        const circle = layers[0];
        map.fitBounds(circle.getBounds(), {
            padding: [35, 35],
            maxZoom: 16
        });
    } else if (layers.length > 1) {
        map.fitBounds(zoneLayer.getBounds(), {
            padding: [35, 35],
            maxZoom: 15
        });
    }
}

/* =========================================================
   LOAD ZONES FROM DATABASE
   ========================================================= */

async function loadZones() {
    try {
        const result = await apiRequest(GEOFENCES_API_URL);

        const records = Array.isArray(result)
            ? result
            : result?.data ?? result?.results ?? result?.geofences;

        if (!Array.isArray(records)) {
            console.error("Unexpected geofence API response:", result);
            throw new Error("The API did not return a geofence array.");
        }

        zones = records
            .map(normalizeZone)
            .filter(zone => {
                const valid =
                    zone.id &&
                    validCoordinates(zone.latitude, zone.longitude) &&
                    Number.isFinite(zone.radius_meters) &&
                    zone.radius_meters > 0;

                if (!valid) {
                    console.error("Skipping invalid zone:", zone);
                }

                return valid;
            });

        if (
            selectedZoneId &&
            !zones.some(zone => String(zone.id) === String(selectedZoneId))
        ) {
            selectedZoneId = null;
        }

        updateStats();
        renderZones();

        // Redraw all map circles after the database reload.
        drawZones();

        // Zoom the map to the actual circles.
        zoomToZones();

        setTimeout(() => map?.invalidateSize(), 150);

        return zones;
    } catch (error) {
        console.error("Could not load geofences:", error);
        showToast(`Could not load geofences: ${error.message}`, true);
        throw error;
    }
}

/* =========================================================
   STATISTICS
   ========================================================= */

function updateStats() {
    const active = zones.filter(zone => zone.is_active);

    const values = {
        totalZones: zones.length,
        activeZones: active.length,
        safeCount: zones.filter(zone => zone.zone_type === "safe").length,
        cautionCount: zones.filter(zone => zone.zone_type === "caution").length,
        restrictedCount: zones.filter(zone => zone.zone_type === "restricted").length
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = $(id);
        if (element) element.textContent = value;
    });

    const todayEvents = $("todayEvents");
    if (todayEvents) todayEvents.textContent = activityItems.length;

    const travelersInside = $("travelersInside");
    if (travelersInside && !travelersInside.dataset.externalValue) {
        travelersInside.textContent = "—";
    }
}

/* =========================================================
   ZONE TABLE
   ========================================================= */

function renderZones() {
    const tbody = $("zoneTableBody");
    if (!tbody) {
        drawZones();
        return;
    }

    const filtered = getFilteredZones();

    tbody.innerHTML = filtered.map(zone => `
        <tr>
            <td>
                <div class="zone-name-cell">
                    <span class="zone-color-dot"
                        style="background:${colorFor(zone.zone_type)}"></span>
                    <div>
                        <strong>${escapeHTML(zone.name)}</strong>
                        <small>${escapeHTML(zone.description || "No description")}</small>
                    </div>
                </div>
            </td>
            <td>${escapeHTML(typeLabel(zone.zone_type))}</td>
            <td>${escapeHTML(radiusLabel(zone.radius_meters))}</td>
            <td>—</td>
            <td>
                <span class="status-badge ${zone.is_active ? "active" : "inactive"}">
                    ${zone.is_active ? "Active" : "Inactive"}
                </span>
            </td>
            <td>
                <div class="table-actions">
                    <button type="button" data-action="edit"
                        data-id="${escapeHTML(zone.id)}">Edit</button>
                    <button type="button" data-action="delete"
                        data-id="${escapeHTML(zone.id)}">Delete</button>
                </div>
            </td>
        </tr>
    `).join("");

    const count = $("resultCount");
    if (count) {
        count.textContent =
            `${filtered.length} zone${filtered.length === 1 ? "" : "s"}`;
    }

    const emptyState = $("emptyState");
    if (emptyState) emptyState.hidden = filtered.length > 0;

    const tableWrap = tbody.closest(".table-wrap");
    if (tableWrap) tableWrap.hidden = filtered.length === 0;

    // Keep map drawing available for deployments that embed it.
    drawZones();
}

/* =========================================================
   SELECT ZONE
   ========================================================= */

function selectZone(id) {
    const zone = getZoneById(id);
    if (!zone) return;

    selectedZoneId = String(zone.id);

    const panel = $("selectedZoneBox");
    if (panel) panel.hidden = false;

    if ($("selectedZoneName")) {
        $("selectedZoneName").textContent = zone.name;
    }

    if ($("selectedZoneDescription")) {
        $("selectedZoneDescription").textContent =
            zone.description || "No description provided.";
    }

    if ($("selectedZoneType")) {
        $("selectedZoneType").textContent = typeLabel(zone.zone_type);
    }

    if ($("selectedZonePeople")) {
        $("selectedZonePeople").textContent = "—";
    }

    drawZones();
}

/* =========================================================
   CREATE / EDIT MODAL
   ========================================================= */

function openModal(zone = null) {
    const modal = $("geofenceModal");
    const form = $("geofenceForm");

    if (!modal || !form) {
        showToast("Geofence form was not found.", true);
        return;
    }

    form.reset();

    if ($("editZoneId")) {
        $("editZoneId").value = zone ? zone.id : "";
    }

    if ($("modalTitle")) {
        $("modalTitle").textContent =
            zone ? "Edit Geofence" : "Create Geofence";
    }

    if ($("zoneNameInput")) {
        $("zoneNameInput").value = zone?.name || "";
    }

    if ($("zoneLocationInput")) {
        $("zoneLocationInput").value =
            zone?.location || zone?.address || zone?.description || "";
    }

    if ($("zoneTypeInput")) {
        $("zoneTypeInput").value = zone?.zone_type || "safe";
    }

    if ($("zoneRadiusInput")) {
        $("zoneRadiusInput").value = zone?.radius_meters ?? 200;
    }

    if ($("zoneLatInput")) {
        $("zoneLatInput").value =
            zone?.latitude ?? map?.getCenter().lat ?? 20.5937;
    }

    if ($("zoneLngInput")) {
        $("zoneLngInput").value =
            zone?.longitude ?? map?.getCenter().lng ?? 78.9629;
    }

    const saveButton = $("saveZoneButton");

    if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = zone ? "Update Geofence" : "Create Geofence";
    }

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    modal.style.display = "flex";

    setTimeout(() => map?.invalidateSize(), 200);
}

function closeModal() {
    const modal = $("geofenceModal");
    if (!modal) return;

    modal.classList.remove("active", "show");
    modal.setAttribute("aria-hidden", "true");
    modal.style.display = "none";
}

/* =========================================================
   CREATE / UPDATE API
   ========================================================= */

async function saveZone(event) {
    event.preventDefault();

    const editId = $("editZoneId")?.value?.trim() || "";
    const name = $("zoneNameInput")?.value?.trim() || "";
    const description = $("zoneLocationInput")?.value?.trim() || "";
    const zoneType = $("zoneTypeInput")?.value || "safe";

    const radius = Number($("zoneRadiusInput")?.value);
    const latitude = Number($("zoneLatInput")?.value);
    const longitude = Number($("zoneLngInput")?.value);

    if (!name) {
        showToast("Enter a geofence name.", true);
        return;
    }

    if (!Number.isFinite(radius) || radius <= 0) {
        showToast("Radius must be a number greater than zero.", true);
        return;
    }

    if (!validCoordinates(latitude, longitude)) {
        showToast("Enter valid latitude and longitude.", true);
        return;
    }

    const oldZone = editId ? getZoneById(editId) : null;

    const payload = {
        name,
        description,
        zone_type: zoneType,
        radius_meters: radius,
        latitude,
        longitude,
        is_active: oldZone ? oldZone.is_active : true
    };

    const button = $("saveZoneButton");

    if (button) {
        button.disabled = true;
        button.textContent = editId ? "Updating..." : "Creating...";
    }

    try {
        const url = editId
            ? `${GEOFENCES_API_URL}${encodeURIComponent(editId)}/`
            : GEOFENCES_API_URL;

        const result = await apiRequest(url, {
            method: editId ? "PUT" : "POST",
            body: JSON.stringify(payload)
        });

        console.log("Geofence saved:", result);

        closeModal();

        // Fetch the saved database record and draw its circle.
        await loadZones();

        const returnedZone = result?.data || result?.geofence || result;
        const savedId = returnedZone?.id ?? returnedZone?.geofence_id;

        if (savedId) {
            selectZone(savedId);
        }

        if (map) {
            map.setView([latitude, longitude], 15);
            map.invalidateSize();
        }

        addActivity(
            editId ? "updated" : "created",
            name,
            `${typeLabel(zoneType)} ${editId ? "updated" : "created"}`
        );

        showToast(
            editId
                ? "Geofence updated successfully."
                : "Geofence created successfully."
        );
    } catch (error) {
        console.error("Geofence save failed:", error);
        showToast(`Unable to save geofence: ${error.message}`, true);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = editId ? "Update Geofence" : "Create Geofence";
        }
    }
}

/* =========================================================
   DETAILS MODAL
   ========================================================= */

function openDetailsModal(id) {
    const zone = getZoneById(id);
    if (!zone) return;

    selectZone(id);

    if ($("detailsTitle")) {
        $("detailsTitle").textContent = zone.name;
    }

    if ($("detailsSubtitle")) {
        $("detailsSubtitle").textContent = typeLabel(zone.zone_type);
    }

    if ($("detailsContent")) {
        $("detailsContent").innerHTML = `
            <p><strong>Name:</strong> ${escapeHTML(zone.name)}</p>
            <p><strong>Description:</strong> ${escapeHTML(zone.description || "Not provided")}</p>
            <p><strong>Type:</strong> ${escapeHTML(typeLabel(zone.zone_type))}</p>
            <p><strong>Radius:</strong> ${escapeHTML(radiusLabel(zone.radius_meters))}</p>
            <p><strong>Latitude:</strong> ${zone.latitude.toFixed(6)}</p>
            <p><strong>Longitude:</strong> ${zone.longitude.toFixed(6)}</p>
            <p><strong>Status:</strong> ${zone.is_active ? "Active" : "Inactive"}</p>
        `;
    }

    const modal = $("detailsModal");

    if (modal) {
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
        modal.style.display = "flex";
    }

    map?.setView(
        [zone.latitude, zone.longitude],
        Math.max(map.getZoom(), 14)
    );
}

function closeDetailsModal() {
    const modal = $("detailsModal");
    if (!modal) return;

    modal.classList.remove("active", "show");
    modal.setAttribute("aria-hidden", "true");
    modal.style.display = "none";
}

/* =========================================================
   ACTIVATE / DEACTIVATE
   ========================================================= */

async function toggleZone(id) {
    const zone = getZoneById(id);
    if (!zone) return;

    const nextActive = !zone.is_active;

    try {
        await apiRequest(
            `${GEOFENCES_API_URL}${encodeURIComponent(zone.id)}/`,
            {
                method: "PATCH",
                body: JSON.stringify({ is_active: nextActive })
            }
        );

        await loadZones();

        addActivity(
            nextActive ? "activated" : "deactivated",
            zone.name,
            `Geofence ${nextActive ? "activated" : "deactivated"}`
        );

        showToast(`${zone.name} status updated.`);
    } catch (error) {
        console.error("Status update failed:", error);
        showToast(error.message, true);
    }
}

/* =========================================================
   DELETE
   ========================================================= */

async function deleteZone(id) {
    const zone = getZoneById(id);
    if (!zone) return;

    if (!window.confirm(`Delete "${zone.name}"?`)) return;

    try {
        await apiRequest(
            `${GEOFENCES_API_URL}${encodeURIComponent(zone.id)}/`,
            { method: "DELETE" }
        );

        if (String(selectedZoneId) === String(zone.id)) {
            selectedZoneId = null;
            if ($("selectedZoneBox")) $("selectedZoneBox").hidden = true;
        }

        await loadZones();

        addActivity("deleted", zone.name, "Geofence deleted");
        showToast("Geofence deleted successfully.");
    } catch (error) {
        console.error("Delete failed:", error);
        showToast(error.message, true);
    }
}

/* =========================================================
   RECENT ACTIVITY
   ========================================================= */

function saveActivity() {
    try {
        localStorage.setItem(
            ACTIVITY_STORAGE_KEY,
            JSON.stringify(activityItems.slice(0, 30))
        );
    } catch (error) {
        console.warn("Unable to save activity history:", error);
    }
}

function loadActivity() {
    try {
        activityItems = JSON.parse(
            localStorage.getItem(ACTIVITY_STORAGE_KEY) || "[]"
        );

        if (!Array.isArray(activityItems)) activityItems = [];
    } catch {
        activityItems = [];
    }

    if (activityItems.length === 0) {
        activityItems = [{
            id: "initial",
            title: "Geofence monitoring initialized",
            description: "Your zone activities will appear here.",
            time: new Date().toISOString()
        }];

        saveActivity();
    }

    renderActivity();
}

function addActivity(action, name, description) {
    activityItems.unshift({
        id: `${Date.now()}`,
        title: `${name}: ${action}`,
        description,
        time: new Date().toISOString()
    });

    activityItems = activityItems.slice(0, 30);

    saveActivity();
    renderActivity();
    updateStats();
}

function renderActivity() {
    const list = $("activityList");
    if (!list) return;

    if (!activityItems.length) {
        list.innerHTML = "<p>No recent zone activity.</p>";
        return;
    }

    list.innerHTML = activityItems.map(item => `
        <div class="activity-item">
            <span class="activity-indicator"></span>
            <div class="activity-content">
                <strong>${escapeHTML(item.title)}</strong>
                <p>${escapeHTML(item.description || "")}</p>
                <small>${escapeHTML(
                    new Date(item.time).toLocaleString()
                )}</small>
            </div>
        </div>
    `).join("");
}

/* =========================================================
   SAFETY RULE SETTINGS
   ========================================================= */

function initializeRules() {
    let rules = {};

    try {
        rules = JSON.parse(
            localStorage.getItem(RULES_STORAGE_KEY) || "{}"
        );
    } catch {
        rules = {};
    }

    ["entryRule", "exitRule", "restrictedRule"].forEach(id => {
        const checkbox = $(id);
        if (!checkbox) return;

        if (typeof rules[id] === "boolean") {
            checkbox.checked = rules[id];
        }

        checkbox.addEventListener("change", () => {
            rules[id] = checkbox.checked;

            localStorage.setItem(
                RULES_STORAGE_KEY,
                JSON.stringify(rules)
            );

            showToast(
                `${id} ${checkbox.checked ? "enabled" : "disabled"}.`
            );
        });
    });
}

/* =========================================================
   MAP AND FILTER BUTTONS
   ========================================================= */

function clearFilters() {
    if ($("zoneSearch")) $("zoneSearch").value = "";
    if ($("mapSearch")) $("mapSearch").value = "";
    if ($("typeFilter")) $("typeFilter").value = "all";
    if ($("statusFilter")) $("statusFilter").value = "all";

    renderZones();
    zoomToZones();
    showToast("Filters cleared.");
}

function showAllZones() {
    if ($("zoneSearch")) $("zoneSearch").value = "";
    if ($("mapSearch")) $("mapSearch").value = "";
    if ($("typeFilter")) $("typeFilter").value = "all";
    if ($("statusFilter")) $("statusFilter").value = "all";

    renderZones();
    zoomToZones();
}

function resetMap() {
    clearFilters();

    if (map && zoneLayer.getLayers().length === 0) {
        map.setView([20.5937, 78.9629], 5);
    }
}

function focusSelectedZone() {
    const zone = getZoneById(selectedZoneId);

    if (!zone) {
        showToast("Select a geofence first.", true);
        return;
    }

    map?.setView(
        [zone.latitude, zone.longitude],
        Math.max(map.getZoom(), 15)
    );
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function bindEvents() {
    $("openCreateModal")?.addEventListener("click", () => openModal());

    $("closeModal")?.addEventListener("click", closeModal);
    $("cancelModal")?.addEventListener("click", closeModal);

    $("geofenceForm")?.addEventListener("submit", saveZone);

    $("closeDetailsModal")?.addEventListener("click", closeDetailsModal);
    $("detailsCloseButton")?.addEventListener("click", closeDetailsModal);

    $("editSelectedZone")?.addEventListener("click", () => {
        const zone = getZoneById(selectedZoneId);
        if (!zone) return;

        closeDetailsModal();
        openModal(zone);
    });

    $("viewSelectedZone")?.addEventListener("click", focusSelectedZone);

    ["zoneSearch", "mapSearch"].forEach(id => {
        $(id)?.addEventListener("input", renderZones);
    });

    ["typeFilter", "statusFilter"].forEach(id => {
        $(id)?.addEventListener("change", renderZones);
    });

    $("clearFilters")?.addEventListener("click", clearFilters);
    $("emptyClearFilters")?.addEventListener("click", clearFilters);
    $("showAllZones")?.addEventListener("click", showAllZones);
    $("resetMap")?.addEventListener("click", resetMap);

    $("refreshActivity")?.addEventListener("click", () => {
        renderActivity();
        showToast("Activity refreshed.");
    });

    $("zoneTableBody")?.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const id = button.dataset.id;

        switch (button.dataset.action) {
            case "view":
                openDetailsModal(id);
                break;

            case "edit": {
                const zone = getZoneById(id);
                if (zone) openModal(zone);
                break;
            }

            case "toggle":
                toggleZone(id);
                break;

            case "delete":
                deleteZone(id);
                break;
        }
    });

    $("geofenceModal")?.addEventListener("click", event => {
        if (event.target === $("geofenceModal")) closeModal();
    });

    $("detailsModal")?.addEventListener("click", event => {
        if (event.target === $("detailsModal")) closeDetailsModal();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeModal();
            closeDetailsModal();
        }
    });

}

/* =========================================================
   INITIALIZE PAGE
   ========================================================= */

async function initializeGeofencesPage() {
    if ($("footerYear")) {
        $("footerYear").textContent = new Date().getFullYear();
    }

    if ($("currentDate")) {
        $("currentDate").textContent =
            new Date().toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric"
            });
    }

    bindEvents();
    loadActivity();
    initializeRules();
    if ($("geofenceMap")) initMap();

    try {
        await loadZones();
    } catch (error) {
        // The error has already been logged and displayed.
    }
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeGeofencesPage,
        { once: true }
    );
} else {
    initializeGeofencesPage();
}
