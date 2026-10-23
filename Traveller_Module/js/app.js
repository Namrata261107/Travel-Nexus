// Leaflet Geofence map
let map = null;
let geofenceCircle = null;
let dashboardMap = null;
/* =====================================================
   TRAVELER INFORMATION
===================================================== */

const signedInProfile = window.travelNexusAuth?.profile || {};
const traveler = {
    id: signedInProfile.traveler_id || "Traveler",
    name: signedInProfile.full_name || "Traveler"
};
const travelerWelcome = document.getElementById("travelerWelcome");
if (travelerWelcome) {
    travelerWelcome.textContent = `Welcome back, ${traveler.name}. Your travel safety at a glance.`;
}
let travelerPlaceName = "Location not shared";



/* =====================================================
   GEOFENCE
===================================================== */

/* =====================================================
   GEOFENCE MAP INITIALIZATION
===================================================== */



function initializeGeofenceMap() {
    const mapElement = document.getElementById("map");

    if (!mapElement) {
        console.warn("Geofence map element #map was not found.");
        return;
    }

    if (typeof L === "undefined") {
        console.error("Leaflet has not loaded.");
        return;
    }

    // If the map already exists, refresh its dimensions
    // and reload the Authority's geofences.
    if (map) {
        setTimeout(() => {
            map.invalidateSize();
            loadAuthorityGeofences();
        }, 200);
        return;
    }

    // Create the existing map.
    map = L.map(mapElement, {
        zoomControl: false,
        scrollWheelZoom: true,
        minZoom: 3,
        maxZoom: 19
    }).setView([20.5937, 78.9629], 5);

    const streetTiles = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
    const streetAttribution = "Tiles &copy; Esri, TomTom, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors, and the GIS User Community";
    const streetLayer = L.tileLayer(streetTiles, {
        maxZoom: 19,
        attribution: streetAttribution
    }).addTo(map);
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

    L.control.layers(
        { Streets: streetLayer, Satellite: satelliteLayer },
        {},
        { position: "topright", collapsed: true }
    ).addTo(map);
    map.on("baselayerchange", event => {
        if (event.layer === satelliteLayer) {
            satelliteLabelsLayer.addTo(map);
        } else if (map.hasLayer(satelliteLabelsLayer)) {
            map.removeLayer(satelliteLabelsLayer);
        }
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);

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
        const previewLayer = L.tileLayer(streetTiles, {
            maxZoom: 19,
            attribution: streetAttribution
        });
        new L.Control.MiniMap(previewLayer, {
            position: "bottomright",
            toggleDisplay: true,
            minimized: false,
            zoomLevelOffset: -5
        }).addTo(map);
    }

    console.log("Geofence map initialized successfully.");

    // Load the active geofences defined by the Authority.
    loadAuthorityGeofences();
}

/* =====================================================
   DASHBOARD TRAVELER MARKER
===================================================== */

let dashboardTravelerMarker = null;






/* =====================================================
   GEOFENCE CENTER
===================================================== */




/* =====================================================
   TRAVELER MARKER
===================================================== */

let travelerMarker = null;



/* =====================================================
   GET LOCATION
===================================================== */


/* =====================================================
   UPDATE TRAVELER LOCATION
===================================================== */

function updateTravelerLocation(

    latitude,

    longitude

) {

    window.travelNexusLatestPosition = { latitude, longitude };


    

   const latitudeElement = document.getElementById("latitude");

if (latitudeElement) {
    latitudeElement.innerText = latitude.toFixed(6);
}
// Update the last location update time
const lastUpdatedElement =
    document.getElementById("dashboardLastUpdated");

if (lastUpdatedElement) {
    lastUpdatedElement.textContent =
        new Date().toLocaleTimeString();
}


    // Update longitude
const longitudeElement = document.getElementById("longitude");

if (longitudeElement) {
    longitudeElement.innerText = longitude.toFixed(6);
}

// Update detailed latitude
const detailLatitudeElement = document.getElementById("detailLatitude");

if (detailLatitudeElement) {
    detailLatitudeElement.innerText = latitude.toFixed(6);
}

// Update detailed longitude
const detailLongitudeElement = document.getElementById("detailLongitude");

if (detailLongitudeElement) {
    detailLongitudeElement.innerText = longitude.toFixed(6);
}


  

    // Update Dashboard latitude
const dashboardLatitudeElement =
    document.getElementById("dashboardLatitude");

if (dashboardLatitudeElement) {
    dashboardLatitudeElement.innerText =
        latitude.toFixed(6);
}

// Update Dashboard longitude
const dashboardLongitudeElement =
    document.getElementById("dashboardLongitude");

if (dashboardLongitudeElement) {
    dashboardLongitudeElement.innerText =
        longitude.toFixed(6);
}



    // Update Profile latitude
const profileLatitudeElement =
    document.getElementById("profileLatitude");

if (profileLatitudeElement) {
    profileLatitudeElement.innerText =
        latitude.toFixed(6);
}

// Update Profile longitude
const profileLongitudeElement =
    document.getElementById("profileLongitude");

if (profileLongitudeElement) {
    profileLongitudeElement.innerText =
        longitude.toFixed(6);
}


    

    const currentZone = getAuthorityZoneAt(latitude, longitude);
    const currentZoneType = currentZone ? getGeofenceTypeLabel(currentZone) : "safe";
    const zoneStatusText = currentZone
        ? `Entered ${currentZoneType} zone: ${currentZone.name || "Safety zone"}`
        : "Outside active geofences";
    const zoneStatusColor = getGeofenceTypeColor(currentZoneType);
    const popupContent = `
    <div style="min-width: 200px;">
        <b style="font-size: 15px;">👤 ${traveler.name}</b>
        <br><br>

        <b>Place:</b> ${travelerPlaceName}
        <br>

        <b>Traveler ID:</b> ${traveler.id}
        <br>

        <b>Latitude:</b> ${latitude.toFixed(6)}
        <br>

        <b>Longitude:</b> ${longitude.toFixed(6)}
        <br>

        <b>Status:</b> <span style="color:${zoneStatusColor};font-weight:700">
        ${escapeGeofenceText(zoneStatusText)}</span>
    </div>
`;



    // Update the traveler marker only when the Geofence map exists.
// Update the traveler's marker safely.
// Safely create or update the traveler's marker.
if (map && typeof L !== "undefined") {

    if (
        !travelerMarker ||
        typeof travelerMarker.setLatLng !== "function"
    ) {

        travelerMarker = L.marker([
            latitude,
            longitude
        ]).addTo(map);

    } else {

        travelerMarker.setLatLng([
            latitude,
            longitude
        ]);

    }

    travelerMarker.bindPopup(popupContent);
}

    



    /* ================================================
       UPDATE DASHBOARD MAP
    ================================================= */

    const dashboardPopupContent = `

        <div style="min-width:180px">

            <b style="font-size:15px">
                👤 ${traveler.name}
            </b>

            <br><br>

            <b>Traveler ID:</b>
            ${traveler.id}

            <br>

            <b>Latitude:</b>
            ${latitude.toFixed(6)}

            <br>

            <b>Longitude:</b>
            ${longitude.toFixed(6)}

            <br>

            <b>Status:</b> <span style="color:${zoneStatusColor};font-weight:700">
                ${escapeGeofenceText(zoneStatusText)}</span>

        </div>

    `;



    

    /* ================================================
       MOVE GEOFENCE MAP
    ================================================= */

    // Move the map only if the Geofence map has been initialized.
/* ================================================
   MOVE GEOFENCE MAP
================================================ */

if (map) {
    map.setView([latitude, longitude], 15);

    if (travelerMarker) {
        travelerMarker.setLatLng([latitude, longitude]);
        travelerMarker.bindPopup(popupContent);
    }
}

/* ================================================
   UPDATE DASHBOARD MAP
================================================ */

if (dashboardMap && typeof L !== "undefined") {

    if (
        !dashboardTravelerMarker ||
        typeof dashboardTravelerMarker.setLatLng !== "function"
    ) {
        dashboardTravelerMarker = L.marker([
            latitude,
            longitude
        ]).addTo(dashboardMap);
    } else {
        dashboardTravelerMarker.setLatLng([
            latitude,
            longitude
        ]);
    }

    dashboardTravelerMarker.bindPopup(dashboardPopupContent);

    dashboardMap.setView([latitude, longitude], 15);
}


    /* ================================================
       CHECK GEOFENCE
    ================================================= */

    checkGeofence(

        latitude,

        longitude

    );

}

/* =====================================================
   GET LIVE PLACE NAME
===================================================== */



async function getLocationPlaceName(latitude, longitude) {
    try {
        const url =
            `https://nominatim.openstreetmap.org/reverse` +
            `?format=jsonv2` +
            `&lat=${latitude}` +
            `&lon=${longitude}` +
            `&zoom=18` +
            `&addressdetails=1`;

        console.log("Fetching place name for:", latitude, longitude);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Geocoding request failed: HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data || !data.address) {
            console.warn("No address found for these coordinates:", data);
            travelerPlaceName = "Address unavailable";
        } else {
            const a = data.address;

            const street = [
                a.house_number,
                a.road
            ].filter(Boolean).join(" ");

            const area =
                a.neighbourhood ||
                a.suburb ||
                a.residential ||
                a.quarter;

            const city =
                a.city ||
                a.town ||
                a.village ||
                a.municipality ||
                a.county;

            const parts = [
                street,
                area,
                city,
                a.state,
                a.postcode,
                a.country
            ].filter(Boolean);

            travelerPlaceName = [...new Set(parts)].join(", ");

            if (!travelerPlaceName) {
                travelerPlaceName =
                    data.display_name || "Address unavailable";
            }
        }

        console.log("Place name received:", travelerPlaceName);
        const profilePlaceElement = document.getElementById("profileLocationName");
        if (profilePlaceElement) profilePlaceElement.textContent = travelerPlaceName;

        // Refresh the map popups with the updated place name.
        updateTravelerLocation(latitude, longitude);

    } catch (error) {
        console.error("Place-name lookup failed:", error);
    }
}


/* =====================================================
   DISTANCE CALCULATION
===================================================== */

function calculateDistance(

    lat1,
    lon1,
    lat2,
    lon2

) {

    const R = 6371000;


    const dLat =
        (lat2 - lat1) *
        Math.PI / 180;


    const dLon =
        (lon2 - lon1) *
        Math.PI / 180;


    const a =

        Math.sin(dLat / 2) *
        Math.sin(dLat / 2)

        +

        Math.cos(
            lat1 * Math.PI / 180
        )

        *

        Math.cos(
            lat2 * Math.PI / 180
        )

        *

        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);



    const c =

        2 *

        Math.atan2(

            Math.sqrt(a),

            Math.sqrt(1 - a)

        );


    return R * c;

}



function getAuthorityZoneAt(latitude, longitude) {
    const priority = { restricted: 4, protected: 4, danger: 4, caution: 3, high_risk: 3, safe: 2, tourist: 1 };
    return (authorityGeofences || [])
        .filter(zone => zone.is_active === true && calculateDistance(
            latitude,
            longitude,
            Number(zone.latitude),
            Number(zone.longitude)
        ) <= Number(zone.radius_meters))
        .sort((a, b) =>
            (priority[String(b.zone_type).toLowerCase()] || 0) -
            (priority[String(a.zone_type).toLowerCase()] || 0)
        )[0] || null;
}

function getGeofenceTypeLabel(zone) {
    return String(zone?.zone_type || "safe").replace(/_/g, " ").toLowerCase();
}

function getGeofenceTypeColor(zoneType) {
    const type = String(zoneType || "safe").toLowerCase();
    if (["restricted", "protected", "danger", "prohibited"].includes(type)) return "#ef4444";
    if (["caution", "high_risk"].includes(type)) return "#f59e0b";
    return {
        safe: "#22c55e",
        tourist: "#3b82f6"
    }[type] || "#22c55e";
}

/* =====================================================
   GEOFENCE CHECK
===================================================== */

function checkGeofence(latitude, longitude) {
    const containingZone = getAuthorityZoneAt(latitude, longitude);

    const status = document.getElementById("status");
    const dashboardStatus = document.getElementById("dashboardStatus");
    const profileStatus = document.getElementById("profileSafetyStatus");
    const alertBox = document.getElementById("alertBox");

    const zoneKey = String(containingZone?.zone_type || "safe").toLowerCase();
    const zoneType = containingZone ? getGeofenceTypeLabel(containingZone) : "safe";
    const isRestricted = ["restricted", "protected", "danger", "prohibited"].includes(zoneKey);
    const isCaution = ["caution", "high_risk"].includes(zoneKey);

    const safetyText = containingZone
        ? `Entered ${zoneType} zone${containingZone.name ? `: ${containingZone.name}` : ""}`
        : "Safe - outside active geofences";
    const safetyColor = getGeofenceTypeColor(zoneKey);

    // Update Geofence status
    if (status) {
        status.innerText = safetyText;
        status.style.color = safetyColor;
    }

    // Update Dashboard status
    if (dashboardStatus) {
        dashboardStatus.innerText = safetyText;
        dashboardStatus.style.color = safetyColor;
    }

    // Update Profile status
    if (profileStatus) {
        profileStatus.innerText = safetyText;
        profileStatus.style.color = safetyColor;
    }

    // Update safety alert
    if (alertBox) {
        if (containingZone) {
            alertBox.className = isRestricted || isCaution
                ? "alert-box warning"
                : "alert-box success";

            alertBox.innerHTML = `
                <b>⚠️ Safety Alert</b>
                <br>
                ${escapeGeofenceText(traveler.name)}, you entered a ${escapeGeofenceText(zoneType)} zone${containingZone.name ? `: ${escapeGeofenceText(containingZone.name)}` : ""}.
            `;
        } else {
            alertBox.className = "alert-box success";

            alertBox.innerHTML = `
                <b>✅ You are Safe</b>
                <br>
                You are currently outside the restricted area.
            `;
        }
    }
}
// Stores the active geofences retrieved from Supabase.
let authorityGeofences = [];
let authorityGeofenceLayers = [];

// Loads active geofences created by the Authority.
async function loadAuthorityGeofences() {
    try {
        const response = await fetch(
            "http://127.0.0.1:8000/api/authority/geofences/",
            { cache: "no-store", headers: { Accept: "application/json" } }
        );
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.data)) {
            throw new Error(result.message || `Geofences API returned HTTP ${response.status}.`);
        }

        authorityGeofences = result.data.filter(zone => zone.is_active === true);
        window.travelNexusGeofencesLoaded = true;

        console.log("Authority geofences loaded:", authorityGeofences.length);

        displayAuthorityGeofences();
        if (window.travelNexusLatestPosition) {
            const { latitude, longitude } = window.travelNexusLatestPosition;
            checkGeofence(latitude, longitude);
        }
    } catch (error) {
        console.error("Could not load authority geofences:", error.message);
    }
}

// Displays the Authority's active geofences on the existing map.
function displayAuthorityGeofences() {
    if (typeof L === "undefined" || typeof map === "undefined" || !map) return;

    // Remove circles previously drawn by this function.
    authorityGeofenceLayers.forEach(layer => {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });

    authorityGeofenceLayers = [];

    authorityGeofences.forEach(zone => {
        const latitude = Number(zone.latitude);
        const longitude = Number(zone.longitude);
        const radius = Number(zone.radius_meters);

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            !Number.isFinite(radius) ||
            radius <= 0
        ) {
            return;
        }

        const zoneType = String(zone.zone_type || "").toLowerCase();

        const zoneColor = getGeofenceTypeColor(zoneType);

        const circle = L.circle(
            [latitude, longitude],
            {
                radius: radius,
                color: zoneColor,
                fillColor: zoneColor,
                fillOpacity: 0.18,
                weight: 2
            }
        ).addTo(map);

        const popupContent = `
            <strong>${escapeGeofenceText(zone.name)}</strong><br>
            Type: ${escapeGeofenceText(zone.zone_type)}<br>
            Radius: ${radius} metres
            ${
                zone.description
                    ? `<br>${escapeGeofenceText(zone.description)}`
                    : ""
            }
        `;

        circle.bindPopup(popupContent);

        authorityGeofenceLayers.push(circle);
    });

    const bounds = L.latLngBounds([]);
    authorityGeofenceLayers.forEach(layer => bounds.extend(layer.getBounds()));
    if (travelerMarker) bounds.extend(travelerMarker.getLatLng());
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    map.invalidateSize();

    console.log("Authority geofences displayed on the map.");
}

// Safely formats text shown in geofence popups.
function escapeGeofenceText(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}



/* =====================================================
   NAVIGATION
===================================================== */

const navItems =
    document.querySelectorAll(
        ".nav-item"
    );


navItems.forEach(

    function(item) {

        item.addEventListener(

            "click",

            function() {


                /* Remove active */

                navItems.forEach(

                    function(nav) {

                        nav.classList.remove(
                            "active"
                        );

                    }

                );


                /* Add active */

                item.classList.add(
                    "active"
                );


                /* Get section */

                const sectionId =
                    item.dataset.section;


                showSection(
                    sectionId
                );

            }

        );

    }

);



/* =====================================================
   SHOW SECTION
===================================================== */

function showSection(sectionId) {

    // 1. Hide all sections
    document.querySelectorAll(".page-section").forEach(function (section) {
        section.classList.remove("active-section");
    });

    // 2. Display the selected section
    const selectedSection = document.getElementById(sectionId);

    if (selectedSection) {
        selectedSection.classList.add("active-section");
    } else {
        console.warn("Section not found:", sectionId);
        return;
    }

    // 3. Update the header navigation's active tab
    document.querySelectorAll(".nav-item").forEach(function (link) {
        const isActive = link.dataset.section === sectionId;

        link.classList.toggle("active", isActive);

        if (isActive) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });

    // 4. Open Geofence and center the map on the latest available location
    if (sectionId === "geofence") {

        if (typeof initializeGeofenceMap === "function") {
            initializeGeofenceMap();
        }

        setTimeout(function () {

            if (typeof map !== "undefined" && map) {
                map.invalidateSize();

                const latitude = window.travelNexusCurrentLatitude;
                const longitude = window.travelNexusCurrentLongitude;

                if (
                    Number.isFinite(latitude) &&
                    Number.isFinite(longitude)
                ) {
                    map.setView([latitude, longitude], 16, {
                        animate: true
                    });
                }
            }

        }, 300);
    }

    // 5. Refresh the Dashboard map size
    if (sectionId === "dashboard") {
        setTimeout(function () {
            if (typeof dashboardMap !== "undefined" && dashboardMap) {
                dashboardMap.invalidateSize();
            }
        }, 100);
    }

    // 6. Load the Traveller Profile
    if (sectionId === "profile") {
        if (typeof loadTravellerProfile === "function") {
            loadTravellerProfile();
        }
    }

    // 7. Return the page to the top when changing modules
    const mainContainer = document.getElementById("mainContainer");

    if (mainContainer) {
        mainContainer.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

/* =====================================================
   PROFILE CLICK
===================================================== */

document.getElementById(
    "profileButton"
).addEventListener(

    "click",

    function() {


        /* Remove active nav */

        navItems.forEach(

            function(nav) {

                nav.classList.remove(
                    "active"
                );

            }

        );


        /* Show profile */

        showSection(
            "profile"
        );

    }

);



/* =====================================================
   SOS
===================================================== */

async function saveSOSReportToSupabase(notification) {
    const supabaseClient = window.travelNexusSupabase;

    if (!supabaseClient) {
        console.error("Supabase client is unavailable.");
        return;
    }

    const report = {
        traveler_name: notification.travelerName,
        traveler_code: notification.travelerId,
        latitude: Number(notification.latitude) || null,
        longitude: Number(notification.longitude) || null,
        area_name: notification.areaName,
        message: notification.message,
        status: "created"
    };

    const { data, error } = await supabaseClient
        .from("traveler_sos_reports")
        .insert([report])
        .select()
        .single();

    if (error) {
        console.error("SOS save failed:", error.message);
        return;
    }

    console.log("SOS saved successfully:", data);
}


function sendSOS() {
    const supabaseClient = window.travelNexusSupabase;

if (!supabaseClient) {
    alert("Database connection failed. Please try again.");
    return;
}

const getText = (id) => {
    const element = document.getElementById(id);

    return element
        ? element.innerText.trim()
        : "Unavailable";
};

const latitude = getText("latitude");
const longitude = getText("longitude");

// Fill the existing SOS confirmation modal
document.getElementById("sosModalTraveler").textContent =
    traveler.name;

document.getElementById("sosModalTravelerId").textContent =
    traveler.id;

document.getElementById("sosModalLatitude").textContent =
    latitude;

document.getElementById("sosModalLongitude").textContent =
    longitude;

// Get the current date and time
const now = new Date();

const dateTime = now.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
});

// Create the SOS notification
const notification = {
    notificationId: "SOS-" + now.getTime(),
    travelerName: traveler.name,
    travelerId: traveler.id,
    latitude: latitude,
    longitude: longitude,
    areaName: "Kolhapur, Maharashtra (approximate)",
    dateTime: dateTime,
    message: "SOS notification generated successfully.",
    status: "SOS Alert Created"
};
saveSOSReportToSupabase(notification);
// Show the notification in the existing action modal
openActionModal(
    "🆘 SOS Emergency Notification",
    `
    <div class="sos-notification-card">

        <div class="sos-notification-header">
            <div class="sos-icon-circle">🆘</div>

            <div>
                <h3>SOS Alert Created</h3>
                <p>Travel Nexus Emergency Notification</p>
            </div>
        </div>

        <div class="sos-notification-success">
            ✓ SOS notification generated successfully.
        </div>

        <div class="sos-notification-details">

            <div class="sos-detail-row">
                <span>Notification ID</span>
                <strong>${notification.notificationId}</strong>
            </div>

            <div class="sos-detail-row">
                <span>Traveller Name</span>
                <strong>${notification.travelerName}</strong>
            </div>

            <div class="sos-detail-row">
                <span>Traveller ID</span>
                <strong>${notification.travelerId}</strong>
            </div>

            <div class="sos-detail-row">
                <span>Latitude</span>
                <strong>${notification.latitude}</strong>
            </div>

            <div class="sos-detail-row">
                <span>Longitude</span>
                <strong>${notification.longitude}</strong>
            </div>

            <div class="sos-detail-row">
                <span>Area</span>
                <strong>${notification.areaName}</strong>
            </div>

            <div class="sos-detail-row">
                <span>Date & Time</span>
                <strong>${notification.dateTime}</strong>
            </div>

            <div class="sos-detail-row">
                <span>Status</span>
                <strong class="sos-status-created">
                    ${notification.status}
                </strong>
            </div>

        </div>

        

        <button type="button"
        class="primary-button sos-done-button"
        onclick="finishSOSNotification()">
    Done
</button>

    </div>
    `
);


// Keep the original SOS modal closed if it was open
const sosModal =
    document.getElementById("sosConfirmationModal");

if (sosModal) {
    sosModal.classList.remove("show");
}

document.body.style.overflow = "";

}

function closeSOSModal(event) {

const modal =
    document.getElementById("sosConfirmationModal");

if (!modal) return;

if (event && event.target !== modal) return;

modal.classList.remove("show");

document.body.style.overflow = "";

}



/* =====================================================
   START LOCATION TRACKING
===================================================== */

loadAuthorityGeofences();
window.setInterval(() => {
    if (document.visibilityState === "visible") loadAuthorityGeofences();
}, 5000);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadAuthorityGeofences();
});


/* =====================================================
   BUTTON ACTIONS
===================================================== */

function openActionModal(title, content) {
    document.getElementById("actionModalTitle").innerText = title;
    document.getElementById("actionModalBody").innerHTML = content;
    document.getElementById("actionModal").classList.add("show");
}

function closeActionModal(event) {
    if (event && event.target !== document.getElementById("actionModal")) {
        return;
    }

    document.getElementById("actionModal").classList.remove("show");
}

function closeModalDirectly() {
    document.getElementById("actionModal").classList.remove("show");
}

/* REPORT LOST ITEM */

function openReportItem() {

    openActionModal(
        "📦 Report Lost Item",
        `
        <form class="action-form" onsubmit="submitLostItem(event)">
            <label>Item Name</label>
            <input id="lostItemName" type="text"
                   placeholder="e.g. Wallet, Mobile Phone" required>

            <label>Category</label>
            <select id="lostItemCategory" required>
                <option value="">Select category</option>
                <option>Electronics</option>
                <option>Documents</option>
                <option>Wallet / Money</option>
                <option>Luggage</option>
                <option>Other</option>
            </select>

            <label>Last Known Location</label>
            <input id="lostItemLocation" type="text"
                   placeholder="e.g. Railway Station" required>

            <label>Description</label>
            <textarea id="lostItemDescription"
                      placeholder="Describe the item and where you lost it..."
                      required></textarea>

            <button class="primary-button" type="submit">
                Submit Lost Item Report
            </button>
        </form>
        `
    );
}


async function submitLostItem(event) {
    event.preventDefault();

    const itemName = document
        .getElementById("lostItemName")
        .value.trim();

    const category = document
        .getElementById("lostItemCategory")
        .value;

    const location = document
        .getElementById("lostItemLocation")
        .value.trim();

    const description = document
        .getElementById("lostItemDescription")
        .value.trim();

    // Validate required fields.
    if (!itemName || !category || !location) {
        alert("Please enter the item name, category, and last known location.");
        return;
    }

    // Get the existing Supabase client.
    let supabaseClient = window.travelNexusSupabase;

    if (
        !supabaseClient &&
        typeof window.initializeSupabaseClient === "function"
    ) {
        window.initializeSupabaseClient();
        supabaseClient = window.travelNexusSupabase;
    }

    if (!supabaseClient) {
        alert("Database connection is unavailable. Please refresh and try again.");
        return;
    }

    // Generate a unique report code.
    const reportCode =
        "TN-LST-" +
        Date.now().toString() +
        "-" +
        Math.random().toString(36).slice(2, 7).toUpperCase();

    // Match the existing Supabase table columns.
    // Authentication is not connected yet, so traveler_id remains NULL.
    const reportData = {
        report_code: reportCode,
        traveler_id: null,
        item_type: category,
        item_name: itemName,
        description: description || null,
        location_description: location,
        report_type: "lost",
        status: "pending"
    };

    try {
        const { error } = await supabaseClient
    .from("lost_found_reports")
    .insert([reportData]);

        if (error) {
            console.error("Lost item submission failed:", error);
            alert(
                "Unable to save your report to the database. " +
                "Please check the database permissions and try again."
            );
            return;
        }

        // Show success only after Supabase confirms the insert.
        const content = document.createElement("div");
        content.className = "action-list";

        const item = document.createElement("div");
        item.className = "action-list-item";

        const heading = document.createElement("h4");
        heading.textContent = "Lost item report submitted successfully.";

        item.appendChild(heading);

       const details = [
    ["Report ID", reportCode],
    ["Item", itemName],
    ["Category", category],
    ["Location", location],
    ["Status", "pending"]
];

        details.forEach(([label, value]) => {
            const paragraph = document.createElement("p");
            const strong = document.createElement("b");

            strong.textContent = label + ": ";
            paragraph.appendChild(strong);
            paragraph.appendChild(
                document.createTextNode(String(value ?? "Not provided"))
            );

            item.appendChild(paragraph);
        });

        const notice = document.createElement("p");
        notice.textContent =
            "Your report has been saved to the Travel Nexus database.";

        item.appendChild(notice);
        content.appendChild(item);

        openActionModal(
            "Lost & Found — Report Submitted",
            content.outerHTML +
            `<button type="button" class="primary-button"
                onclick="closeModalDirectly()">Done</button>`
        );

        // Clear the form after a successful database submission.
        const form = event.target;

        if (form && typeof form.reset === "function") {
            form.reset();
        }

        console.log("Lost item report saved successfully:", reportCode);



} catch (error) {
    console.error("Lost item submission failed:", error);
    alert(
        "Submission failed: " +
        (error?.message || String(error))
    );
}


}

/* SEARCH FOUND ITEMS */

// Stores found-item reports retrieved from Supabase.
window.travelNexusFoundItems = [];

async function openSearchItems() {

    // Open the existing modal with a loading message.
    openActionModal(
        "🔍 Search Found Items",
        `
        <div class="action-form">
            <label for="searchItemInput">Search Item</label>
            <input
                id="searchItemInput"
                type="text"
                placeholder="Enter item name..."
                oninput="filterFoundItems()"
            >
        </div>

        <div id="foundItemsList"
             class="action-list"
             style="margin-top:15px;">
            <p>Loading found-item reports...</p>
        </div>
        `
    );

    // Check that the Supabase client is available.
    if (
        !window.travelNexusSupabase &&
        typeof window.initializeSupabaseClient === "function"
    ) {
        window.initializeSupabaseClient();
    }

    const supabaseClient = window.travelNexusSupabase;
    const list = document.getElementById("foundItemsList");

    if (!list) return;

    if (!supabaseClient) {
        list.textContent =
            "Database connection is not available. Please check your Supabase configuration.";
        return;
    }

    try {
        // Retrieve found-item reports from the existing table.
        const { data, error } = await supabaseClient
            .from("lost_found_reports")
            .select(`
                report_code,
                item_type,
                item_name,
                description,
                location_description,
                status,
                created_at
            `)
            .eq("report_type", "found")
            .order("created_at", { ascending: false });

        if (error) {
            console.error(
                "Could not retrieve found-item reports:",
                error
            );

            list.textContent =
                "Unable to retrieve reports. Please check your database permissions and RLS policies.";

            return;
        }

        window.travelNexusFoundItems = data || [];

        if (window.travelNexusFoundItems.length === 0) {
            list.textContent =
                "No found-item reports are currently visible. Database permissions may need to be configured.";

            return;
        }

        filterFoundItems();

    } catch (error) {
        console.error("Found-item search failed:", error);

        const currentList =
            document.getElementById("foundItemsList");

        if (currentList) {
            currentList.textContent =
                "An unexpected error occurred while loading reports.";
        }
    }
}


// Filters the reports already retrieved from Supabase.
function filterFoundItems() {

    const input = document.getElementById("searchItemInput");
    const list = document.getElementById("foundItemsList");

    if (!input || !list) return;

    const searchTerm = input.value.trim().toLowerCase();

    const matchingItems =
        (window.travelNexusFoundItems || []).filter(function(item) {

            return (
                (item.item_name || "")
                    .toLowerCase()
                    .includes(searchTerm) ||

                (item.item_type || "")
                    .toLowerCase()
                    .includes(searchTerm) ||

                (item.location_description || "")
                    .toLowerCase()
                    .includes(searchTerm)
            );
        });

    if (matchingItems.length === 0) {
        list.textContent = "No matching found-item reports.";
        return;
    }

    // Escape database values before inserting them into HTML.
    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, function(char) {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            };

            return entities[char];
        });
    }

    list.innerHTML = matchingItems.map(function(item) {

        const name = escapeHTML(item.item_name);
        const category = escapeHTML(item.item_type || "Unspecified");
        const location = escapeHTML(
            item.location_description || "Location not provided"
        );
        const description = escapeHTML(item.description || "No description");
        const status = escapeHTML(item.status || "pending");
        const reportCode = escapeHTML(item.report_code || "Unavailable");

        return `
            <div class="action-list-item">
                <h4>🔎 ${name}</h4>
                <p><b>Category:</b> ${category}</p>
                <p><b>Found at:</b> ${location}</p>
                <p><b>Status:</b> ${status}</p>
                <p><b>Description:</b> ${description}</p>
                <p><b>Report ID:</b> ${reportCode}</p>
            </div>
        `;

    }).join("");
}

/* VIEW CLAIMS */

/* VIEW CLAIMS */

function openClaims() {
    const savedReport = localStorage.getItem("travelNexusLostReport");

    let reportHTML = "";

    if (savedReport) {
        const report = JSON.parse(savedReport);

        reportHTML = `
            <div class="action-list-item">
                <h4>📦 ${report.itemName}</h4>
                <p><b>Report ID:</b> ${report.reportId}</p>
                <p><b>Traveler:</b> ${report.travelerName}</p>
                <p><b>Location:</b> ${report.location}</p>
                <p><b>Status:</b> Waiting for authority verification</p>
            </div>
        `;
    } else {
        reportHTML = `
            <div class="action-list-item">
                <h4>No active claims</h4>
                <p>You have not submitted any lost item report yet.</p>
            </div>
        `;
    }

    openActionModal(
        "🤝 My Claims",
        `
        <div class="action-list">
            ${reportHTML}
        </div>
        `
    );
}

/* AI ASSISTANT CHAT */

function openChat() {

    openActionModal(
        "🤖 Travel Nexus AI Assistant",
        `
        <div class="chat-container">

            <div id="chatMessages" class="chat-messages">
                <div class="chat-message bot">
                    Hello ${traveler.name}! 👋
                    I am your Travel Nexus safety assistant.
                    How can I help you?
                </div>
            </div>

            <div class="chat-input-row">
                <input id="chatInput"
                       type="text"
                       placeholder="Ask about travel safety..."
                       onkeydown="if(event.key === 'Enter') sendChatMessage()">

                <button onclick="sendChatMessage()">
                    Send
                </button>
            </div>

        </div>
        `
    );

    setTimeout(function() {
        document.getElementById("chatInput").focus();
    }, 100);
}

async function sendChatMessage() {
    const input = document.getElementById("chatInput");
    const messages = document.getElementById("chatMessages");

    if (!input || !messages) {
        console.error("Chat elements not found.");
        return;
    }

    const message = input.value.trim();

    if (!message || input.disabled) {
        return;
    }

    // Initialize conversation history.
    if (!window.travelNexusChatHistory) {
        window.travelNexusChatHistory = [];
    }

    // Display the user's message.
    const userBubble = document.createElement("div");
    userBubble.className = "chat-message user";
    userBubble.textContent = message;

    messages.appendChild(userBubble);

    input.value = "";
    input.disabled = true;

    // Display a loading message.
    const botBubble = document.createElement("div");
    botBubble.className = "chat-message bot";
    botBubble.textContent = "Thinking...";

    messages.appendChild(botBubble);
    messages.scrollTop = messages.scrollHeight;

    window.travelNexusChatHistory.push({
        role: "user",
        content: message
    });

    try {
        const response = await fetch(
            "http://127.0.0.1:5000/chat",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    messages: window.travelNexusChatHistory.slice(-20)
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Unable to get an AI response."
            );
        }

        if (!result.reply) {
            throw new Error("The AI returned an empty response.");
        }

        // Display the answer without interpreting it as HTML.
        botBubble.textContent = result.reply;

        // Save the answer for follow-up questions.
        window.travelNexusChatHistory.push({
            role: "assistant",
            content: result.reply
        });

    } catch (error) {
        console.error("Travel Nexus AI error:", error);

        botBubble.textContent =
            "Sorry, I couldn't get a response. " +
            (error.message || "Please try again.");

    } finally {
        input.disabled = false;
        input.focus();

        messages.scrollTop = messages.scrollHeight;
    }
}

function escapeChatText(text) {

    const div = document.createElement("div");

    div.textContent = text;

    return div.innerHTML;
}

/* Close action window with ESC */

document.addEventListener("keydown", function(event) {

    if (event.key === "Escape") {
        closeModalDirectly();
        closeSOSModal();
        
    }

});


/* =====================================================
   SOS DONE BUTTON + SUCCESS POPUP
===================================================== */

function finishSOSNotification() {

    // Close the notification details modal
    const actionModal = document.getElementById("actionModal");

    if (actionModal) {
        actionModal.classList.remove("show");
    }

    // Close the old SOS modal if it exists
    const sosModal = document.getElementById("sosConfirmationModal");

    if (sosModal) {
        sosModal.classList.remove("show");
    }

    document.body.style.overflow = "";

    // Remove any previous popup
    const oldToast = document.getElementById("sosToast");

    if (oldToast) {
        oldToast.remove();
    }

    // Create the success popup
    const toast = document.createElement("div");

    toast.id = "sosToast";
    toast.innerHTML = `
        <span class="sos-toast-check">✓</span>
        <div class="sos-toast-content">
            <strong>SOS Notification</strong>
            <p>Your SOS notification has been recorded successfully.</p>
        </div>
        <button type="button"
                class="sos-toast-close"
                aria-label="Close popup"
                onclick="document.getElementById('sosToast')?.remove()">
            &times;
        </button>
    `;

    toast.style.cssText = `
        position: fixed;     top: 25px;     right: 25px;     z-index: 2147483647;     display: flex;     align-items: center;     gap: 12px;     width: min(360px, calc(100vw - 40px));     box-sizing: border-box;     padding: 18px;     background: #fff5f5;     color: #991b1b;     border: 1px solid #fecaca;     border-left: 5px solid #dc2626;     border-radius: 12px;     box-shadow: 0 8px 30px rgba(240, 54, 54, 0.92);     font-family: Arial, sans-serif;;
    `;

    document.body.appendChild(toast);

    // Automatically close after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

let lastPlaceLookup = 0;
window.cancelDashboardPlaceLookup = () => {
    lastPlaceLookup += 1;
    travelerPlaceName = "Location not shared";
};

async function updateDashboardPlace(latitude, longitude) {

    const placeElement = document.getElementById("dashboardPlace");
    const addressElement = document.getElementById("dashboardLocationAddress");

    // The Dashboard may not currently contain these elements.
    if (!placeElement && !addressElement) {
        return;
    }

    const lookupTime = Date.now();
    lastPlaceLookup = lookupTime;

    if (placeElement) {
        placeElement.textContent = "Finding your location...";
    }

    if (addressElement) {
        addressElement.textContent = "Updating location details...";
    }

    try {
        const url =
            "https://nominatim.openstreetmap.org/reverse" +
            `?format=jsonv2&lat=${encodeURIComponent(latitude)}` +
            `&lon=${encodeURIComponent(longitude)}` +
            "&zoom=18&addressdetails=1";

        const response = await fetch(url, {
            headers: {
                "Accept": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error("Place lookup failed: " + response.status);
        }

        const data = await response.json();

        // Ignore an older response if a newer lookup has started.
        if (lookupTime !== lastPlaceLookup) {
            return;
        }

        const address = data.address || {};

        const placeName =
            address.amenity ||
            address.building ||
            address.tourism ||
            address.leisure ||
            address.shop ||
            address.road ||
            address.neighbourhood ||
            address.suburb ||
            address.village ||
            address.town ||
            address.city ||
            address.municipality ||
            address.county ||
            address.state_district ||
            data.name ||
            data.display_name;

        const locality =
            address.suburb ||
            address.neighbourhood ||
            address.village ||
            address.town ||
            address.city ||
            address.municipality;

        const displayName = placeName
            ? (
                locality && locality !== placeName
                    ? `${placeName}, ${locality}`
                    : placeName
            )
            : "Place name unavailable";

        travelerPlaceName = displayName;

        if (placeElement) {
            placeElement.textContent = displayName;
        }
        const profilePlaceElement = document.getElementById("profileLocationName");
        if (profilePlaceElement) profilePlaceElement.textContent = displayName;

        if (addressElement) {
            addressElement.textContent =
                data.display_name ||
                "Location details unavailable";
        }

        console.log("Current place name:", displayName);

    } catch (error) {

        if (lookupTime !== lastPlaceLookup) {
            return;
        }

        if (placeElement) {
            placeElement.textContent = "Place name unavailable";
        }
        const profilePlaceElement = document.getElementById("profileLocationName");
        if (profilePlaceElement) profilePlaceElement.textContent = "Place name unavailable";

        if (addressElement) {
            addressElement.textContent =
                "Unable to retrieve the address. Your coordinates may still be available.";
        }

        console.error("Location lookup failed:", error);
    }
}


document.addEventListener("click", function (event) {
    const button = event.target.closest("button.dashboard-action");

    if (!button) {
        return;
    }

    const target = button.getAttribute("data-target");

    console.log("Dashboard button clicked:", target);

    if (!target) {
        console.error("This dashboard button has no data-target.");
        return;
    }

    if (typeof showSection !== "function") {
        console.error("showSection() is not available.");
        return;
    }

    event.preventDefault();
    showSection(target);
});


async function testSupabaseConnection() {
    const supabaseClient = window.travelNexusSupabase;

    if (!supabaseClient) {
        console.error("Supabase client not initialized.");
        return;
    }

    const { error } = await supabaseClient
        .from("traveler_profiles")
        .select("id")
        .limit(1);

    if (error) {
        console.error("Supabase connection test failed:", error.message);
        return;
    }

    console.log("Supabase connection successful!");
}

testSupabaseConnection();


async function loadTravellerProfile() {
    const supabase = window.travelNexusSupabase;
    const profileId = window.travelNexusProfileId;

    if (!supabase || !profileId) {
        console.error("Supabase client or traveller profile ID is missing.");
        return;
    }

    try {
        // 1. Fetch traveller information
        const { data: traveller, error } = await supabase
            .from("traveler_profiles")
            .select("*")
            .eq("id", profileId)
            .maybeSingle();

        if (error) {
            console.error("Could not load traveller profile:", error.message);
            return;
        }

        if (!traveller) {
            console.warn("Traveller profile was not found.");
            return;
        }

        // 2. Fetch the user's basic profile information
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", traveller.user_id)
            .maybeSingle();

        if (profileError) {
            console.error("Could not load user profile:", profileError.message);
        }

        // 3. Prepare profile values
        const fullName = profile?.full_name || "Traveller";
    
// Update the top-right navbar name and avatar
const displayName = fullName.trim() || "User";

const headerUserName = document.getElementById("headerUserName");
const headerUserAvatar = document.getElementById("headerUserAvatar");

if (headerUserName) {
    headerUserName.textContent = displayName;
}

if (headerUserAvatar) {
    headerUserAvatar.textContent =
        displayName.charAt(0).toUpperCase();
}


        const values = {
            name: fullName,
            email: profile?.email || "Not available",
            phone: profile?.phone || "Not provided",
            travelerId: traveller.traveler_id || "Not available"
        };

        // 4. Update profile information displayed on the page
        const selectors = {
            name: [
                "profileName",
                "profileFullName",
                "travelerName"
            ],
            email: ["profileEmail"],
            phone: ["profilePhone"],
            travelerId: [
                "profileTravelerId",
                "profileTravelerIdDetails",
                "travelerId"
            ]
        };

        Object.entries(selectors).forEach(([key, ids]) => {
            ids.forEach(id => {
                const element = document.getElementById(id);

                if (element) {
                    element.textContent = values[key];
                }
            });
        });

        // 5. Update the profile avatar with the first letter of the name
        const avatar = document.getElementById("profileAvatar");

        if (avatar) {
            avatar.textContent = fullName.trim().charAt(0).toUpperCase() || "T";
        }

        
// 6. Update the edit form fields, if present
const editFields = {
    editProfileName: values.name,
    editProfilePhone: profile?.phone || ""
};


        Object.entries(editFields).forEach(([id, value]) => {
            const element = document.getElementById(id);

            if (element && element !== document.activeElement) {
                element.value = value;
            }
        });

        console.log("Traveller profile loaded successfully:", values);

    } catch (error) {
        console.error("Unexpected error loading traveller profile:", error);
    }
}

    


// The authenticated profile ID is set by dashboard-auth.js.

// Make the profile editor functions available to HTML onclick handlers
/* =====================================================
   OPEN AND CLOSE TRAVELLER PROFILE EDITOR
===================================================== */

window.openTravellerProfileEditor = function () {
    const editor = document.getElementById("travellerProfileEditor");

    if (!editor) {
        console.error(
            "Profile editor not found. Check the ID in modules/profile.html."
        );
        return;
    }

    // Fill the editing form with the current profile values.
    const fields = {
    editProfileName: "profileFullName",
    editProfilePhone: "profilePhone"
   };

    Object.entries(fields).forEach(([inputId, displayId]) => {
        const input = document.getElementById(inputId);
        const display = document.getElementById(displayId);

        if (input && display) {
            const value = display.textContent.trim();

            input.value =
                value === "Not provided" || value === "None provided"
                    ? ""
                    : value;
        }
    });

    editor.hidden = false;
    editor.style.display = "block";

    editor.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
};


window.closeTravellerProfileEditor = function () {
    const editor = document.getElementById("travellerProfileEditor");

    if (editor) {
        editor.hidden = true;
        editor.style.display = "none";
    }
};




/* =====================================================
   SAVE TRAVELLER PROFILE TO SUPABASE
===================================================== */
window.saveTravellerProfile = async function (event) {
    if (event) {
        event.preventDefault();
    }

    const supabase = window.travelNexusSupabase;
    const profileId = window.travelNexusProfileId;

    if (!supabase || !profileId) {
        alert("Supabase is not connected. Please refresh the page.");
        console.error("Supabase client or traveller profile ID is missing.");
        return;
    }

    // Read all editable profile fields.
    const fullName =
        document.getElementById("editProfileName")?.value.trim() || "";
    const phone = document.getElementById("editProfilePhone")?.value.trim() || "";

    if (!fullName) {
        alert("Please enter your full name.");
        return;
    }
    if (!/^[+0-9() .-]{8,20}$/.test(phone)) {
        alert("Please enter a valid mobile number for geofence SMS alerts.");
        return;
    }

    try {
        // Find the traveller and associated user.
        const { data: traveller, error: travellerError } = await supabase
            .from("traveler_profiles")
            .select("id, user_id")
            .eq("id", profileId)
            .maybeSingle();

        if (travellerError) {
            throw travellerError;
        }

        if (!traveller) {
            throw new Error("Traveller profile was not found.");
        }

        // Update the user's full name.
        const { data: updatedProfile, error: profileError } = await supabase
            .from("profiles")
            .update({
                full_name: fullName,
                phone
            })
            .eq("id", traveller.user_id)
            .select("id, full_name, phone");

        if (profileError) {
            throw profileError;
        }

        if (!updatedProfile || updatedProfile.length === 0) {
            throw new Error(
                "The name was not updated. Check the profiles UPDATE policy."
            );
        }

        // Refresh the displayed information.
        await loadTravellerProfile();

        // Close the editor.
        if (typeof window.closeTravellerProfileEditor === "function") {
            window.closeTravellerProfileEditor();
        }

        alert("Profile updated successfully and saved to Supabase!");

        console.log("Profile saved successfully:", updatedProfile[0]);

    } catch (error) {
        console.error("Could not save traveller profile:", error);

        alert(
            "Could not save your profile.\n\n" +
            (error.message || "Please check your Supabase permissions.")
        );
    }
};

/* =====================================================
   TRAVEL NEXUS PROFILE EDITOR
===================================================== */


console.log("Traveller profile editor functions registered.");

console.log("TEST: Traveller profile editor code loaded");

console.log(
    "Editor function:",
    typeof window.openTravellerProfileEditor
);
