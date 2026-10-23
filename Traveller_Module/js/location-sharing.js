"use strict";

const TRAVELER_LOCATION_API = window.TRAVEL_NEXUS_API_ORIGIN + "/api/authority/traveler/location/";
const TRAVELER_GEOFENCES_API = window.TRAVEL_NEXUS_API_ORIGIN + "/api/authority/geofences/";
const locationMapElement = document.getElementById("travelerDashboardMap");
const shareLocationButton = document.getElementById("startLocationButton");
const stopLocationButton = document.getElementById("stopLocationButton");
const sharingStatusElement = document.getElementById("locationSharingStatus");
const trackingBadgeElement = document.getElementById("locationTrackingBadge");
const locationStatusLabels = document.querySelectorAll("[data-location-status]");
const MAX_LOCATION_ACCURACY_METERS = 500;

let locationMap = null;
let locationMarker = null;
let travelerGeofenceLayer = null;
let locationWatchId = null;
let lastSavedAt = 0;
let savingLocation = false;
let hasAccurateLocation = false;
let travelerGeofencesLoading = false;
let hasFocusedDashboardMap = false;
let lastTravelerGeofenceSignature = "";
let latestAccuratePosition = null;
const travelerGeofenceInsideState = new Map();

function checkTravelerDashboardGeofences(latitude, longitude, zones = null) {
    const currentZones = zones || travelerActiveGeofences || [];
    const newlyEnteredZones = [];
    const insideZones = [];
    const zonePriority = { restricted: 4, protected: 4, danger: 4, prohibited: 4, caution: 3, high_risk: 3, safe: 2, tourist: 1 };
    currentZones.forEach(zone => {
        const centerLat = Number(zone.latitude);
        const centerLng = Number(zone.longitude);
        const radius = Number(zone.radius_meters);
        if (![centerLat, centerLng, radius].every(Number.isFinite) || radius <= 0) return;
        const radians = value => value * Math.PI / 180;
        const dLat = radians(centerLat - latitude);
        const dLng = radians(centerLng - longitude);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(radians(latitude)) * Math.cos(radians(centerLat)) * Math.sin(dLng / 2) ** 2;
        const distance = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const wasInside = travelerGeofenceInsideState.get(String(zone.id)) === true;
        const isInside = distance <= radius;
        travelerGeofenceInsideState.set(String(zone.id), isInside);
        if (isInside) {
            insideZones.push(zone);
            if (!wasInside) newlyEnteredZones.push(zone);
        }
    });
    const sortByRisk = (a, b) =>
        (zonePriority[String(b.zone_type || "safe").toLowerCase()] || 0) -
        (zonePriority[String(a.zone_type || "safe").toLowerCase()] || 0);
    insideZones.sort(sortByRisk);
    newlyEnteredZones.sort(sortByRisk);

    const currentZone = insideZones[0] || null;
    const newlyEnteredZone = newlyEnteredZones[0] || null;
    const type = String(currentZone?.zone_type || "safe").toLowerCase().replace(/_/g, " ");
    const label = currentZone
        ? `Entered ${type} zone${currentZone.name ? `: ${currentZone.name}` : ""}`
        : "Safe - outside active geofences";
    const color = {
        restricted: "#ef4444", protected: "#ef4444", danger: "#ef4444", prohibited: "#ef4444",
        caution: "#f59e0b", high_risk: "#f59e0b",
        safe: "#22c55e", tourist: "#3b82f6"
    }[String(currentZone?.zone_type || "safe").toLowerCase()] || "#22c55e";
    const dashboardStatus = document.getElementById("dashboardStatus");
    if (dashboardStatus) {
        dashboardStatus.textContent = label;
        dashboardStatus.style.color = color;
    }
    const safetyNote = document.getElementById("dashboardSafetyNote");
    if (safetyNote && !newlyEnteredZone) {
        safetyNote.textContent = currentZone
            ? `You are currently inside the ${type} zone${currentZone.name ? `: ${currentZone.name}` : ""}.`
            : "You are outside active geofences.";
    }
    if (locationMarker) {
        locationMarker.setPopupContent(`
            <strong>Your live location</strong><br>
            ${escapeMapText(label)}
        `);
    }

    if (newlyEnteredZone) {
        const enteredType = String(newlyEnteredZone.zone_type || "safe").toLowerCase().replace(/_/g, " ");
        const message = `You entered a ${enteredType} zone${newlyEnteredZone.name ? `: ${newlyEnteredZone.name}` : ""}. The Authority has been notified.`;
        if (safetyNote) safetyNote.textContent = message;
        setSharingStatus(message);
        if (typeof window.showTravelNexusNotification === "function") {
            window.showTravelNexusNotification({
                id: `geofence-entry-${newlyEnteredZone.id}-${Date.now()}`,
                title: `${enteredType.charAt(0).toUpperCase()}${enteredType.slice(1)} zone notification`,
                message,
                type: ["restricted", "caution", "high_risk", "protected", "danger", "prohibited"].includes(enteredType.replace(/ /g, "_"))
                    ? "warning"
                    : "update"
            });
        }
    }
}

let travelerActiveGeofences = [];

function focusDashboardSafetyArea(force = false) {
    if (!locationMap || (hasFocusedDashboardMap && !force)) return;
    const bounds = L.latLngBounds([]);
    if (travelerGeofenceLayer) {
        travelerGeofenceLayer.eachLayer(layer => {
            if (typeof layer.getBounds === "function") bounds.extend(layer.getBounds());
        });
    }
    if (locationMarker) bounds.extend(locationMarker.getLatLng());
    if (!bounds.isValid()) return;
    hasFocusedDashboardMap = true;
    locationMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
}

function setSharingStatus(message, isError = false) {
    if (!sharingStatusElement) return;
    sharingStatusElement.textContent = message;
    sharingStatusElement.classList.toggle("error", isError);
}

function initializeLocationMap() {
    if (!locationMapElement || !window.L) {
        setSharingStatus("The location map could not be loaded.", true);
        return;
    }

    locationMap = L.map(locationMapElement, {
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

    const streetTiles = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
    const streetsLayer = L.tileLayer(
        streetTiles,
        {
            maxZoom: 19,
            attribution: "Tiles &copy; Esri, TomTom, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors, and the GIS User Community"
        }
    ).addTo(locationMap);
    const satelliteLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
            maxZoom: 19,
            attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community"
        }
    );
    const satelliteLabelsLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, attribution: "Labels &copy; Esri" }
    );
    travelerGeofenceLayer = L.layerGroup().addTo(locationMap);
    L.control.layers(
        { Streets: streetsLayer, Satellite: satelliteLayer },
        { "Active safety zones": travelerGeofenceLayer },
        { position: "topright", collapsed: true }
    ).addTo(locationMap);
    locationMap.on("baselayerchange", event => {
        if (event.layer === satelliteLayer) {
            satelliteLabelsLayer.addTo(locationMap);
        } else if (locationMap.hasLayer(satelliteLabelsLayer)) {
            locationMap.removeLayer(satelliteLabelsLayer);
        }
    });
    L.control.zoom({ position: "bottomright" }).addTo(locationMap);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(locationMap);
    if (L.control && typeof L.control.fullscreen === "function") {
        L.control.fullscreen({ position: "topright" }).addTo(locationMap);
    }
    if (L.control && typeof L.control.locate === "function") {
        L.control.locate({
            position: "topright",
            flyTo: true,
            keepCurrentZoomLevel: true
        }).addTo(locationMap);
    }
    if (L.Control && typeof L.Control.geocoder === "function") {
        L.Control.geocoder({ defaultMarkGeocode: false, position: "topleft" })
            .on("markgeocode", event => locationMap.fitBounds(event.geocode.bbox))
            .addTo(locationMap);
    }
    if (L.Control && typeof L.Control.MiniMap === "function") {
        const previewLayer = L.tileLayer(streetTiles, {
            maxZoom: 19,
            attribution: "Tiles &copy; Esri, TomTom, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors"
        });
        new L.Control.MiniMap(previewLayer, {
            position: "bottomright",
            toggleDisplay: true,
            minimized: false,
            zoomLevelOffset: -5
        }).addTo(locationMap);
    }
}

function escapeMapText(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

async function loadTravelerGeofences() {
    if (travelerGeofencesLoading) return;
    travelerGeofencesLoading = true;

    try {
        const response = await fetch(TRAVELER_GEOFENCES_API, {
            cache: "no-store",
            headers: { Accept: "application/json" }
        });
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.data)) {
            throw new Error(
                result.message || `Safety-zone request failed (HTTP ${response.status}).`
            );
        }

        const activeZones = result.data.filter(zone => zone.is_active === true);
        travelerActiveGeofences = activeZones;
        const signature = activeZones
            .map(zone => `${zone.id}:${zone.zone_type}:${zone.name}:${zone.latitude}:${zone.longitude}:${zone.radius_meters}`)
            .sort()
            .join("|");
        const zonesChanged = signature !== lastTravelerGeofenceSignature;
        lastTravelerGeofenceSignature = signature;
        if (travelerGeofenceLayer) {
            travelerGeofenceLayer.clearLayers();
            activeZones.forEach(zone => {
                const latitude = Number(zone.latitude);
                const longitude = Number(zone.longitude);
                const radius = Number(zone.radius_meters);
                if (
                    !Number.isFinite(latitude) ||
                    !Number.isFinite(longitude) ||
                    !Number.isFinite(radius) ||
                    radius <= 0
                ) {
                    console.warn("Skipping invalid authority geofence:", zone.id);
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
                    <strong>${escapeMapText(zone.name || "Safety zone")}</strong><br>
                    ${escapeMapText(zone.zone_type || "Zone")} · ${Math.round(radius).toLocaleString("en-IN")} m radius
                `);
                circle.addTo(travelerGeofenceLayer);
            });
        }
        if (zonesChanged) focusDashboardSafetyArea(true);
        else if (!locationMarker) focusDashboardSafetyArea();
        if (locationMarker) {
            const point = locationMarker.getLatLng();
            checkTravelerDashboardGeofences(point.lat, point.lng, activeZones);
        }
        if (zonesChanged && locationWatchId !== null && latestAccuratePosition && !savingLocation) {
            savingLocation = true;
            saveLocation(latestAccuratePosition).finally(() => {
                savingLocation = false;
            });
        }
        if (locationMap) locationMap.invalidateSize();

        const status = document.getElementById("dashboardGeofenceStatus");
        if (status) {
            status.textContent =
                `${activeZones.length} active safety zone${activeZones.length === 1 ? "" : "s"} shown on the map`;
        }
    } catch (error) {
        console.error("Could not load authority safety zones:", error);
        const status = document.getElementById("dashboardGeofenceStatus");
        if (status) status.textContent = "Safety zones could not be refreshed";
    } finally {
        travelerGeofencesLoading = false;
    }
}

function updateLocationDisplay(position) {
    const { latitude, longitude, accuracy, altitude, speed } = position.coords;
    const accuracyElement = document.getElementById("locationAccuracy");
    const validAccuracy = Number.isFinite(accuracy) && accuracy >= 0;

    if (!validAccuracy || accuracy > MAX_LOCATION_ACCURACY_METERS) {
        if (hasAccurateLocation) return;

        const accuracyText = validAccuracy
            ? `GPS reports about ${formatDistance(accuracy)} accuracy; waiting for a fix within ${MAX_LOCATION_ACCURACY_METERS} m.`
            : "GPS did not report its accuracy; waiting for a more reliable fix.";
        if (accuracyElement) {
            accuracyElement.textContent = validAccuracy
                ? `${formatDistance(accuracy)} (too imprecise to share)`
                : "not reported (waiting for a reliable fix)";
        }
        setSharingStatus(
            `${accuracyText} Check device Location Services and browser location permission.`,
            true
        );
        locationStatusLabels.forEach(label => {
            label.textContent = "Waiting for accurate GPS";
        });
        return;
    }

    const latitudeText = latitude.toFixed(6);
    const longitudeText = longitude.toFixed(6);
    hasAccurateLocation = true;
    latestAccuratePosition = position;
    window.travelNexusLatestPosition = { latitude, longitude };

    const firstLocationFix = !locationMarker;
    if (!locationMarker) {
        locationMarker = L.marker([latitude, longitude], {
            title: "Your current location"
        }).addTo(locationMap);
        locationMarker.bindPopup("Your shared location");
    } else {
        locationMarker.setLatLng([latitude, longitude]);
    }
    focusDashboardSafetyArea(firstLocationFix);

    const displayValues = {
        dashboardLatitude: latitudeText,
        dashboardLongitude: longitudeText,
        latitude: latitudeText,
        longitude: longitudeText,
        profileLatitude: latitudeText,
        profileLongitude: longitudeText
    };
    Object.entries(displayValues).forEach(([id, value]) => {
        const target = document.getElementById(id);
        if (target) target.textContent = value;
    });

    if (typeof window.updateDashboardPlace === "function") {
        const place = document.getElementById("dashboardPlace");
        if (place) place.textContent = "Finding nearby place…";
        window.updateDashboardPlace(latitude, longitude);
    } else {
        console.error("Place-name lookup is unavailable; the location app script did not initialize.");
    }
    locationStatusLabels.forEach(label => {
        label.textContent = "Location sharing on";
    });
    if (trackingBadgeElement) {
        trackingBadgeElement.textContent = "Location tracking active";
        trackingBadgeElement.classList.remove("is-off");
        trackingBadgeElement.insertAdjacentHTML("afterbegin", '<span class="online-dot"></span>');
    }
    const dashboardStatus = document.getElementById("dashboardStatus");
    if (dashboardStatus) dashboardStatus.textContent = "Location shared";
    const dashboardSafetyNote = document.getElementById("dashboardSafetyNote");
    if (dashboardSafetyNote) {
        dashboardSafetyNote.textContent = "Your latest browser location is being shared.";
    }
    checkTravelerDashboardGeofences(latitude, longitude);
    const updated = document.getElementById("profileLocationUpdated");
    if (updated) updated.textContent = new Date().toLocaleString();
    if (accuracyElement) {
        accuracyElement.textContent = `within ${Math.round(accuracy)} m`;
    }
    if (
        window.travelNexusGeofencesLoaded &&
        typeof window.updateTravelerLocation === "function"
    ) {
        window.updateTravelerLocation(latitude, longitude);
    }

    const now = Date.now();
    if (!savingLocation && now - lastSavedAt >= 5000) {
        lastSavedAt = now;
        savingLocation = true;
        saveLocation(position).finally(() => {
            savingLocation = false;
        });
    }
}

function formatDistance(metres) {
    if (metres >= 1000) {
        return `${(metres / 1000).toFixed(metres >= 10000 ? 0 : 1)} km`;
    }
    return `${Math.round(metres)} m`;
}

async function saveLocation(position) {
    try {
        const token = await window.travelNexusAuth.getAccessToken();
        const response = await fetch(TRAVELER_LOCATION_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                altitude: position.coords.altitude,
                speed: position.coords.speed
            })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || `Location save failed (HTTP ${response.status}).`);
        }

        lastSavedAt = Date.now();
        setSharingStatus("Location sharing is on. Your latest location is saved to Travel Nexus.");
    } catch (error) {
        console.error("Could not save traveler location:", error);
        setSharingStatus(error.message || "Could not save your location.", true);
    }
}

function handleLocationError(error) {
    const messages = {
        1: "Location permission was denied. Allow location access in your browser to share it.",
        2: "Your current location is unavailable. Move to an area with GPS or network reception and try again.",
        3: "The location request timed out. Try sharing your location again."
    };
    setSharingStatus(messages[error.code] || "Could not read your current location.", true);
    stopLocationSharing(false);
}

function startLocationSharing() {
    if (!locationMap) {
        setSharingStatus("The location map is unavailable. Refresh the page and try again.", true);
        return;
    }
    if (!navigator.geolocation) {
        setSharingStatus("This browser does not support location sharing.", true);
        return;
    }
    if (!window.isSecureContext) {
        setSharingStatus("Location sharing requires HTTPS or localhost.", true);
        return;
    }
    if (locationWatchId !== null) return;

    lastSavedAt = 0;
    hasAccurateLocation = false;
    latestAccuratePosition = null;
    window.travelNexusLatestPosition = null;
    if (locationMarker) {
        locationMap.removeLayer(locationMarker);
        locationMarker = null;
    }
    hasFocusedDashboardMap = false;
    focusDashboardSafetyArea();
    [
        "dashboardLatitude",
        "dashboardLongitude",
        "latitude",
        "longitude",
        "profileLatitude",
        "profileLongitude"
    ].forEach(id => {
        const target = document.getElementById(id);
        if (target) target.textContent = "Waiting for accurate GPS…";
    });
    const place = document.getElementById("dashboardPlace");
    if (place) place.textContent = "Waiting for an accurate location";
    const profilePlace = document.getElementById("profileLocationName");
    if (profilePlace) profilePlace.textContent = "Waiting for an accurate location";
    const accuracy = document.getElementById("locationAccuracy");
    if (accuracy) accuracy.textContent = "checking…";
    const dashboardStatus = document.getElementById("dashboardStatus");
    if (dashboardStatus) dashboardStatus.textContent = "Waiting for accurate GPS";
    const safetyNote = document.getElementById("dashboardSafetyNote");
    if (safetyNote) safetyNote.textContent = "Your location will only be shared after a reliable GPS fix.";
    setSharingStatus("Requesting browser location permission…");
    if (trackingBadgeElement) {
        trackingBadgeElement.textContent = "Waiting for location permission";
        trackingBadgeElement.classList.add("is-off");
        trackingBadgeElement.insertAdjacentHTML("afterbegin", '<span class="online-dot"></span>');
    }
    locationWatchId = navigator.geolocation.watchPosition(
        updateLocationDisplay,
        handleLocationError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
    if (shareLocationButton) shareLocationButton.disabled = true;
    if (stopLocationButton) stopLocationButton.disabled = false;
    locationStatusLabels.forEach(label => {
        label.textContent = "Location sharing requested";
    });
}

function stopLocationSharing(showStatus = true) {
    if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
    }
    if (typeof window.cancelDashboardPlaceLookup === "function") {
        window.cancelDashboardPlaceLookup();
    }
    hasAccurateLocation = false;
    latestAccuratePosition = null;
    window.travelNexusLatestPosition = null;
    if (locationMarker && locationMap) {
        locationMap.removeLayer(locationMarker);
        locationMarker = null;
    }
    ["dashboardLatitude", "dashboardLongitude", "latitude", "longitude", "profileLatitude", "profileLongitude"]
        .forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = "Not shared";
        });
    ["dashboardPlace", "profileLocationName"].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = "Not shared";
    });
    const address = document.getElementById("dashboardLocationAddress");
    if (address) address.textContent = "Share your location to see your current place.";
    const accuracy = document.getElementById("locationAccuracy");
    if (accuracy) accuracy.textContent = "Location accuracy will appear after sharing starts.";
    if (shareLocationButton) shareLocationButton.disabled = false;
    if (stopLocationButton) stopLocationButton.disabled = true;
    locationStatusLabels.forEach(label => {
        label.textContent = "Location sharing off";
    });
    if (trackingBadgeElement) {
        trackingBadgeElement.textContent = "Location sharing off";
        trackingBadgeElement.classList.add("is-off");
        trackingBadgeElement.insertAdjacentHTML("afterbegin", '<span class="online-dot"></span>');
    }
    const dashboardStatus = document.getElementById("dashboardStatus");
    if (dashboardStatus) {
        dashboardStatus.textContent = "Not checked";
        dashboardStatus.style.color = "";
    }
    const dashboardSafetyNote = document.getElementById("dashboardSafetyNote");
    if (dashboardSafetyNote) {
        dashboardSafetyNote.textContent = "Share your location to check nearby safety zones.";
    }
    if (showStatus) {
        setSharingStatus("Location sharing is off. Your last saved location remains visible to authorities.");
    }
}

initializeLocationMap();
loadTravelerGeofences();
window.setInterval(() => {
    if (document.visibilityState === "visible") {
        loadTravelerGeofences();
    }
}, 5000);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        loadTravelerGeofences();
    }
});
shareLocationButton?.addEventListener("click", startLocationSharing);
stopLocationButton?.addEventListener("click", () => stopLocationSharing());
window.addEventListener("pagehide", () => stopLocationSharing(false));
