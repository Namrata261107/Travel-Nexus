function travelNexusAlertStorageKey(key) {
    const userId = window.travelNexusAuth?.user?.id || "signed-out";
    return `${key}:${userId}`;
}

(function () {
    "use strict";

    function getAlertsSection() {
        return document.getElementById("alerts");
    }

    function getAlertCards() {
        const section = getAlertsSection();

        return section
            ? Array.from(section.querySelectorAll(".alert-item"))
            : [];
    }

    function filterAlerts(type, button) {
        const alerts = getAlertCards();
        const section = getAlertsSection();

        if (!section) return;

        section.querySelectorAll(".alert-filter").forEach(function (item) {
            item.classList.remove("active");
        });

        if (button) {
            button.classList.add("active");
        }

        let visibleCount = 0;

        alerts.forEach(function (alert) {
            const shouldShow =
                type === "all" || alert.dataset.type === type;

            alert.style.display = shouldShow ? "" : "none";

            if (shouldShow) {
                visibleCount++;
            }
        });

        const emptyMessage = document.getElementById("noAlertsMessage");

        if (emptyMessage) {
            emptyMessage.style.display =
                visibleCount === 0 ? "block" : "none";
        }
    }

    function markAllAlertsRead() {
        getAlertCards().forEach(function (alert) {
            alert.classList.remove("unread");

            const dot = alert.querySelector(".unread-dot");

            if (dot) {
                dot.style.display = "none";
            }
        });

        try {
            localStorage.setItem(
                travelNexusAlertStorageKey("travelNexusAlertsRead"),
                "true"
            );
        } catch (error) {
            console.warn("Could not save alert status.");
        }

        const button = document.querySelector(
            "#alerts .mark-read-btn"
        );

        if (button) {
            const originalText = button.textContent;
            button.textContent = "✓ All Alerts Read";
            button.disabled = true;

            setTimeout(function () {
                button.textContent = originalText;
                button.disabled = false;
            }, 1500);
        }
    }

    function openAlertDetails(title, message, icon, card) {
        const modal = document.getElementById("alertDetailsModal");

        if (!modal) {
            window.alert(title + "\n\n" + message);
            return;
        }

        const titleElement = document.getElementById("alertDetailsTitle");
        const messageElement = document.getElementById("alertDetailsText");
        const iconElement = document.getElementById("alertDetailsIcon");

        if (titleElement) titleElement.textContent = title;
        if (messageElement) messageElement.textContent = message;
        if (iconElement) iconElement.textContent = icon || "🔔";

        if (card) {
            card.classList.remove("unread");

            const dot = card.querySelector(".unread-dot");

            if (dot) {
                dot.style.display = "none";
            }
        }

        modal.classList.add("show");
        modal.style.display = "flex";
    }

    function closeAlertDetails(event) {
        if (
            event &&
            event.target !== event.currentTarget &&
            !event.target.closest(".alert-details-content")
        ) {
            return;
        }

        const modal = document.getElementById("alertDetailsModal");

        if (modal) {
            modal.classList.remove("show");
            modal.style.display = "none";
        }
    }

    function initializeAlerts() {
        const section = getAlertsSection();

        if (!section) return;

        // Remove the sample alerts baked into the original markup before the
        // account-specific API request runs.
        section.querySelectorAll(".alert-summary-card strong").forEach(item => {
            item.textContent = "0";
        });
        const alertList = document.getElementById("alertList");
        if (alertList) {
            alertList.replaceChildren();
            const loading = document.createElement("p");
            loading.className = "no-alerts-message";
            loading.textContent = "Loading your alerts…";
            alertList.appendChild(loading);
        }

        const alreadyRead = localStorage.getItem(
            travelNexusAlertStorageKey("travelNexusAlertsRead")
        ) === "true";

        if (alreadyRead) {
            getAlertCards().forEach(function (alert) {
                alert.classList.remove("unread");

                const dot = alert.querySelector(".unread-dot");

                if (dot) {
                    dot.style.display = "none";
                }
            });
        }

        section.querySelectorAll(".alert-filter").forEach(function (button) {
            button.addEventListener("click", function () {
                const text = button.textContent.toLowerCase();

                let type = "all";

                if (text.includes("emergency")) {
                    type = "emergency";
                } else if (
                    text.includes("safety") ||
                    text.includes("warning")
                ) {
                    type = "warning";
                } else if (
                    text.includes("update") ||
                    text.includes("updates")
                ) {
                    type = "update";
                }

                filterAlerts(type, button);
            });
        });

        section.querySelectorAll(".alert-item").forEach(function (card) {
            card.style.cursor = "pointer";

            card.addEventListener("click", function (event) {
                if (event.target.closest("button")) return;

                const titleElement = card.querySelector(
                    ".alert-title-row h4"
                );

                const title = titleElement
                    ? titleElement.textContent.trim()
                    : "Travel Alert";

                const messageElement = card.querySelector(
                    ".alert-content p"
                );

                const message = messageElement
                    ? messageElement.textContent.trim()
                    : "Please review this travel alert.";

                const iconElement = card.querySelector(".alert-icon");

                const icon = iconElement
                    ? iconElement.textContent.trim()
                    : "🔔";

                openAlertDetails(title, message, icon, card);
            });
        });

        const markReadButton = section.querySelector(".mark-read-btn");

        if (markReadButton) {
            markReadButton.addEventListener(
                "click",
                markAllAlertsRead
            );
        }

        const modal = document.getElementById("alertDetailsModal");

        if (modal) {
            modal.addEventListener("click", function (event) {
                if (event.target === modal) {
                    closeAlertDetails();
                }
            });
        }

        console.log("Alerts buttons and cards are ready.");
    }

    window.filterAlerts = filterAlerts;
    window.markAllAlertsRead = markAllAlertsRead;
    window.openAlertDetails = openAlertDetails;
    window.closeAlertDetails = closeAlertDetails;

    document.addEventListener("travelnexus:ready", initializeAlerts);

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeAlerts,
            { once: true }
        );
    } else {
        initializeAlerts();
    }
})();

/* =========================================
   LOAD ALERTS FROM SUPABASE
========================================= */

async function loadTravelNexusAlertsFromSupabase() {

    const supabaseClient = window.travelNexusSupabase;
    const travelerProfile = window.travelNexusAuth?.profile;

    const alertList = document.getElementById("alertList");

    if (!alertList) {
        console.warn("Alerts list was not found.");
        return;
    }

    if (!supabaseClient || !travelerProfile?.traveler_profile_id || !travelerProfile?.traveler_id) {
        alertList.textContent =
            "Your traveller account could not be verified. Please sign in again.";
        return;
    }

    alertList.textContent = "Loading alerts...";

    try {

        // Retrieve emergency alerts.
        const emergencyResult = await supabaseClient
            .from("emergency_alerts")
            .select(`
                id,
                alert_code,
                alert_type,
                severity,
                title,
                description,
                latitude,
                longitude,
                status,
                created_at
            `)
            .eq("traveler_id", travelerProfile.traveler_profile_id)
            .order("created_at", { ascending: false })
            .limit(50);

        // Retrieve saved SOS reports.
        const sosResult = await supabaseClient
            .from("traveler_sos_reports")
            .select(`
                id,
                traveler_name,
                traveler_code,
                latitude,
                longitude,
                area_name,
                message,
                status,
                created_at
            `)
            .eq("traveler_code", travelerProfile.traveler_id)
            .order("created_at", { ascending: false })
            .limit(50);

        if (emergencyResult.error) {
            console.error(
                "Could not load emergency alerts:",
                emergencyResult.error.message
            );
        }

        if (sosResult.error) {
            console.error(
                "Could not load SOS reports:",
                sosResult.error.message
            );
        }

        // Convert database records into a common format.
        const emergencyAlerts = (emergencyResult.data || []).map(
            function (alert) {
                return {
                    id: alert.id,
                    title: alert.title || alert.alert_type || "Emergency Alert",
                    message: alert.description || "Emergency alert recorded.",
                    type: getTravelNexusAlertType(alert),
                    created_at: alert.created_at,
                    source: "emergency"
                };
            }
        );

        const sosAlerts = (sosResult.data || []).map(
            function (alert) {
                return {
                    id: alert.id,
                    title: "Emergency SOS Alert",
                    message:
                        (alert.message || "SOS report recorded.") +
                        " Traveller: " +
                        (alert.traveler_name || "Unknown") +
                        ". Location: " +
                        (alert.area_name || "Unavailable") +
                        ".",
                    type: "emergency",
                    created_at: alert.created_at,
                    source: "sos"
                };
            }
        );

        let geofenceAlerts = [];
        try {
            const token = window.travelNexusAuth &&
                await window.travelNexusAuth.getAccessToken();
            if (!token) throw new Error("Sign in to load your geofence notifications.");
            const response = await fetch(
                "http://127.0.0.1:8000/api/authority/traveler/geofence-alerts/",
                {
                    cache: "no-store",
                    headers: {
                        Accept: "application/json",
                        Authorization: `Bearer ${token}`
                    }
                }
            );
            const result = await response.json();
            if (response.ok && result.success && Array.isArray(result.data)) {
                geofenceAlerts = result.data
                    .filter(alert => String(alert.alert_type).toLowerCase() === "geofence_entry")
                    .map(alert => ({
                        id: alert.id,
                        title: alert.title || "Geofence entered",
                        message: alert.description || "You entered an active safety zone.",
                        type: "warning",
                        created_at: alert.created_at,
                        source: "geofence"
                    }));
            }
        } catch (error) {
            console.warn("Could not load geofence entry notifications:", error);
        }

        // Combine and sort the records by date.
        const allAlerts = [
            ...emergencyAlerts,
            ...sosAlerts,
            ...geofenceAlerts
        ].sort(function (a, b) {
            return new Date(b.created_at || 0) -
                   new Date(a.created_at || 0);
        });

        if (typeof window.syncTravelNexusNotificationHistory === "function") {
    window.syncTravelNexusNotificationHistory(allAlerts);
}

        // Update summary cards.
        const summaryNumbers = document.querySelectorAll(
            "#alerts .alert-summary-card strong"
        );

        const emergencyCount = allAlerts.filter(
            alert => alert.type === "emergency"
        ).length;

        const warningCount = allAlerts.filter(
            alert => alert.type === "warning"
        ).length;

        const updateCount = allAlerts.filter(
            alert => alert.type === "update"
        ).length;

        if (summaryNumbers[0]) {
            summaryNumbers[0].textContent = allAlerts.length;
        }

        if (summaryNumbers[1]) {
            summaryNumbers[1].textContent = emergencyCount;
        }

        if (summaryNumbers[2]) {
            summaryNumbers[2].textContent = warningCount;
        }

        if (summaryNumbers[3]) {
            summaryNumbers[3].textContent = updateCount;
        }

        // Show an empty state if there are no saved alerts.
        alertList.replaceChildren();

        if (allAlerts.length === 0) {

            const emptyMessage = document.createElement("div");

            emptyMessage.className = "no-alerts-message";

            emptyMessage.innerHTML = `
                <div>🔔</div>
                <h3>No saved alerts</h3>
                <p>New safety notifications will appear here.</p>
            `;

            alertList.appendChild(emptyMessage);

            console.log("No alerts found in Supabase.");
            return;
        }

        // Display alerts using the existing CSS classes.
        allAlerts.forEach(function (alert) {

            const isEmergency = alert.type === "emergency";
            const isWarning = alert.type === "warning";

            const card = document.createElement("div");

            card.className = "alert-item";

            card.dataset.type = alert.type;

            const icon = document.createElement("div");

            icon.className =
                "alert-icon " +
                (isEmergency
                    ? "emergency-icon"
                    : isWarning
                        ? "warning-icon"
                        : "update-icon");

            icon.textContent =
                isEmergency ? "🚨" :
                isWarning ? "⚠️" : "📍";

            const content = document.createElement("div");

            content.className = "alert-content";

            const titleRow = document.createElement("div");

            titleRow.className = "alert-title-row";

            const heading = document.createElement("h4");

            heading.textContent = alert.title;

            const badge = document.createElement("span");

            badge.className =
                "alert-status " +
                (isEmergency
                    ? "emergency-status"
                    : isWarning
                        ? "warning-status"
                        : "update-status");

            badge.textContent =
                isEmergency ? "Emergency" :
                isWarning ? "Warning" : "Update";

            titleRow.append(heading, badge);

            const message = document.createElement("p");

            message.textContent = alert.message;

            const time = document.createElement("span");

            time.className = "alert-time";

            time.textContent = alert.created_at
                ? new Date(alert.created_at).toLocaleString("en-IN")
                : "Time unavailable";

            content.append(titleRow, message, time);

            const unreadDot = document.createElement("span");

            unreadDot.className = "unread-dot";

            card.append(icon, content, unreadDot);

            // Keep the existing alert-details popup.
            card.addEventListener("click", function () {

                if (typeof window.openAlertDetails === "function") {
                    window.openAlertDetails(
                        alert.title,
                        alert.message,
                        icon.textContent
                    );
                }

            });

            alertList.appendChild(card);

        });

        console.log(
            "Alerts loaded successfully from Supabase:",
            allAlerts.length
        );

    } catch (error) {

        console.error("Could not load Alerts:", error);

        alertList.textContent =
            "Unable to load alerts. Check the browser console.";
    }
}


/* Classify emergency alerts by type and severity. */

function getTravelNexusAlertType(alert) {

    const details = (
        (alert.alert_type || "") + " " +
        (alert.severity || "") + " " +
        (alert.title || "")
    ).toLowerCase();

    if (
        details.includes("emergency") ||
        details.includes("sos") ||
        details.includes("critical")
    ) {
        return "emergency";
    }

    if (
        details.includes("warning") ||
        details.includes("geofence") ||
        details.includes("restricted") ||
        details.includes("high")
    ) {
        return "warning";
    }

    return "update";
}


/* Load alerts when the Alerts module opens. */

document.addEventListener("click", function (event) {

    const alertsLink = event.target.closest(
        '.nav-item[data-section="alerts"]'
    );

    const dashboardButton = event.target.closest(
        ".dashboard-action[data-target='alerts']"
    );

    if (alertsLink || dashboardButton) {

        setTimeout(function () {
            loadTravelNexusAlertsFromSupabase();
        }, 150);

    }

});

// Initial load.
setTimeout(function () {
    loadTravelNexusAlertsFromSupabase();
}, 300);

/* ======================================
   TRAVEL NEXUS NOTIFICATION CENTER
====================================== */

(function () {
    "use strict";

    const STORAGE_KEY = travelNexusAlertStorageKey("travelNexusNotificationHistory");
    const KNOWN_IDS_KEY = travelNexusAlertStorageKey("travelNexusKnownAlertIds");
    let container = null;

    function getHistory() {
        try {
            const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.warn("Could not read notification history.", error);
            return [];
        }
    }

    function saveHistory(history) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 100)));
        } catch (error) {
            console.warn("Could not save notification history.", error);
        }
    }

    function getNotificationContainer() {
        if (container && container.isConnected) return container;

        container = document.getElementById("tnNotificationContainer");

        if (!container) {
            container = document.createElement("div");
            container.id = "tnNotificationContainer";
            container.setAttribute("aria-label", "New notifications");
            container.setAttribute("aria-live", "polite");
            document.body.appendChild(container);
        }

        return container;
    }

    function getIcon(type) {
        if (type === "emergency") return "🚨";
        if (type === "warning") return "⚠️";
        return "🔔";
    }

    function updateBadge() {
        const badge = document.getElementById("tnNotificationBadge");
        const summary = document.getElementById("tnNotificationSummary");

        if (!badge) return;

        const unreadCount = getHistory().filter(item => !item.read).length;

        badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
        badge.hidden = unreadCount === 0;

        if (summary) {
            summary.textContent = unreadCount
                ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                : "You're all caught up";
        }
    }

    function openNotificationDetails(item) {
        item.read = true;
        saveHistory(getHistory().map(existing =>
            existing.id === item.id ? item : existing
        ));

        renderNotificationHistory();
        updateBadge();

        if (typeof window.showSection === "function") {
            window.showSection("alerts");
        }

        if (typeof window.openAlertDetails === "function") {
            window.openAlertDetails(
                item.title,
                item.message,
                getIcon(item.type)
            );
        } else if (typeof window.loadTravelNexusAlertsFromSupabase === "function") {
            window.loadTravelNexusAlertsFromSupabase();
        }
    }

    function renderNotificationHistory() {
        const list = document.getElementById("tnNotificationList");
        if (!list) return;

        const history = getHistory();

        list.replaceChildren();

        if (history.length === 0) {
            const empty = document.createElement("div");
            empty.className = "tn-notification-empty";

            const icon = document.createElement("span");
            icon.textContent = "🔔";

            const title = document.createElement("p");
            title.textContent = "No notifications yet";

            const message = document.createElement("small");
            message.textContent =
                "New safety alerts and Authority messages will appear here.";

            empty.append(icon, title, message);
            list.appendChild(empty);
            updateBadge();
            return;
        }

        history.forEach(function (item) {
            const row = document.createElement("article");
            row.className =
                "tn-center-item" +
                (item.read ? "" : " tn-center-unread") +
                (item.type === "emergency" ? " tn-center-emergency" : "") +
                (item.type === "warning" ? " tn-center-warning" : "");

            row.tabIndex = 0;
            row.setAttribute("role", "button");
            row.setAttribute("aria-label", `Open notification: ${item.title}`);

            const icon = document.createElement("div");
            icon.className = "tn-center-item-icon";
            icon.textContent = getIcon(item.type);

            const content = document.createElement("div");
            content.className = "tn-center-item-content";

            const title = document.createElement("h4");
            title.className = "tn-center-item-title";
            title.textContent = item.title;

            const message = document.createElement("p");
            message.className = "tn-center-item-message";
            message.textContent = item.message;

            const time = document.createElement("span");
            time.className = "tn-center-item-time";
            time.textContent = item.created_at
                ? new Date(item.created_at).toLocaleString("en-IN")
                : "Time unavailable";

            content.append(title, message, time);
            row.append(icon, content);

            if (!item.read) {
                const dot = document.createElement("span");
                dot.className = "tn-center-unread-dot";
                dot.setAttribute("aria-label", "Unread");
                row.appendChild(dot);
            }

            row.addEventListener("click", () => openNotificationDetails(item));

            row.addEventListener("keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openNotificationDetails(item);
                }
            });

            list.appendChild(row);
        });

        updateBadge();
    }

    function addToHistory(options = {}) {
        const item = {
            id: String(options.id || (
                "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8)
            )),
            title: String(options.title || "New Authority Notification"),
            message: String(
                options.message || "Please open Alerts to view the details."
            ),
            type: String(options.type || "update").toLowerCase(),
            created_at: options.created_at || new Date().toISOString(),
            read: Boolean(options.read)
        };

        const history = getHistory();
        const existingIndex = history.findIndex(existing => existing.id === item.id);

        if (existingIndex !== -1) {
            history[existingIndex] = {
                ...history[existingIndex],
                ...item,
                read: history[existingIndex].read
            };
        } else {
            history.unshift(item);
        }

        saveHistory(history);
        renderNotificationHistory();

        return item;
    }

    function showTravelNexusNotification(options = {}) {
        const item = addToHistory(options);
        const toast = document.createElement("article");

        toast.className =
            "tn-notification-toast " +
            (item.type === "emergency"
                ? "tn-emergency"
                : item.type === "warning"
                    ? "tn-warning"
                    : "");

        const icon = document.createElement("div");
        icon.className = "tn-notification-icon";
        icon.textContent = getIcon(item.type);

        const body = document.createElement("div");
        body.className = "tn-notification-body";

        const label = document.createElement("p");
        label.className = "tn-notification-label";
        label.textContent = "NEW AUTHORITY ALERT";

        const heading = document.createElement("h3");
        heading.className = "tn-notification-title";
        heading.textContent = item.title;

        const description = document.createElement("p");
        description.className = "tn-notification-message";
        description.textContent = item.message;

        const actions = document.createElement("div");
        actions.className = "tn-notification-actions";

        const viewButton = document.createElement("button");
        viewButton.className = "tn-notification-view";
        viewButton.type = "button";
        viewButton.textContent = "View Alerts";

        viewButton.addEventListener("click", function () {
            toast.remove();

            if (typeof window.showSection === "function") {
                window.showSection("alerts");
            }

            if (typeof window.loadTravelNexusAlertsFromSupabase === "function") {
                window.loadTravelNexusAlertsFromSupabase();
            }
        });

        const dismissButton = document.createElement("button");
        dismissButton.className = "tn-notification-dismiss";
        dismissButton.type = "button";
        dismissButton.textContent = "Dismiss";
        dismissButton.addEventListener("click", () => toast.remove());

        actions.append(viewButton, dismissButton);

        const closeButton = document.createElement("button");
        closeButton.className = "tn-notification-close";
        closeButton.type = "button";
        closeButton.setAttribute("aria-label", "Close notification");
        closeButton.textContent = "×";
        closeButton.addEventListener("click", () => toast.remove());

        body.append(label, heading, description, actions);
        toast.append(icon, body, closeButton);

        const notificationContainer = getNotificationContainer();

        while (notificationContainer.children.length >= 4) {
            notificationContainer.firstElementChild.remove();
        }

        notificationContainer.appendChild(toast);

        if (item.type !== "emergency") {
            window.setTimeout(() => toast.remove(), 7000);
        }

        return toast;
    }

    function markAllNotificationHistoryRead() {
        const history = getHistory().map(item => ({
            ...item,
            read: true
        }));

        saveHistory(history);
        renderNotificationHistory();
    }

    function initializeNotificationCenter() {
        const bell = document.getElementById("tnNotificationBell");
        const dropdown = document.getElementById("tnNotificationDropdown");
        const center = document.getElementById("tnNotificationCenter");
        const markRead = document.getElementById("tnMarkAllRead");
        const viewAll = document.getElementById("tnViewAllNotifications");

        if (!bell || !dropdown || !center) {
            console.warn("Notification bell HTML was not found.");
            return;
        }

        if (bell.dataset.initialized === "true") {
            renderNotificationHistory();
            return;
        }

        bell.dataset.initialized = "true";

        bell.addEventListener("click", function (event) {
            event.stopPropagation();

            const willOpen = dropdown.hidden;
            dropdown.hidden = !willOpen;
            bell.setAttribute("aria-expanded", String(willOpen));

            if (willOpen) renderNotificationHistory();
        });

        dropdown.addEventListener("click", event => event.stopPropagation());

        document.addEventListener("click", function (event) {
            if (!center.contains(event.target)) {
                dropdown.hidden = true;
                bell.setAttribute("aria-expanded", "false");
            }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                dropdown.hidden = true;
                bell.setAttribute("aria-expanded", "false");
            }
        });

        if (markRead) {
            markRead.addEventListener("click", markAllNotificationHistoryRead);
        }

        if (viewAll) {
            viewAll.addEventListener("click", function () {
                dropdown.hidden = true;
                bell.setAttribute("aria-expanded", "false");

                if (typeof window.showSection === "function") {
                    window.showSection("alerts");
                }

                if (typeof window.loadTravelNexusAlertsFromSupabase === "function") {
                    window.loadTravelNexusAlertsFromSupabase();
                }
            });
        }

        renderNotificationHistory();
    }

    /*
     * Add database alerts to the dropdown.
     * Existing records on the first load are treated as read.
     * Newly discovered records on later loads are marked unread.
     */
    window.syncTravelNexusNotificationHistory = function (alerts) {
        if (!Array.isArray(alerts)) return;

        let knownIds = [];

        try {
            knownIds = JSON.parse(localStorage.getItem(KNOWN_IDS_KEY) || "[]");
            if (!Array.isArray(knownIds)) knownIds = [];
        } catch (error) {
            knownIds = [];
        }

        const firstSync = !localStorage.getItem(KNOWN_IDS_KEY);
        const history = getHistory();

        alerts.forEach(function (alert) {
            const id = String(alert.id);
            if (!alert.id) return;

            const alreadyStored = history.some(item => item.id === id);
            if (alreadyStored) return;

            const isKnown = knownIds.includes(id);

            history.push({
                id,
                title: String(alert.title || "Travel Alert"),
                message: String(alert.message || "Please review this travel alert."),
                type: String(alert.type || "update"),
                created_at: alert.created_at || new Date().toISOString(),
                read: firstSync || isKnown
            });
        });

        const merged = history
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
            .slice(0, 100);

        saveHistory(merged);

        try {
            const allIds = [...new Set([
                ...knownIds,
                ...alerts.map(alert => String(alert.id)).filter(Boolean)
            ])].slice(-500);

            localStorage.setItem(KNOWN_IDS_KEY, JSON.stringify(allIds));
        } catch (error) {
            console.warn("Could not save known alert IDs.", error);
        }

        renderNotificationHistory();
    };

    window.showTravelNexusNotification = showTravelNexusNotification;
    window.markAllNotificationHistoryRead = markAllNotificationHistoryRead;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeNotificationCenter);
    } else {
        initializeNotificationCenter();
    }

    document.addEventListener("travelnexus:ready", initializeNotificationCenter);

})();
