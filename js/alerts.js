
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    // =====================================================
    // CONFIGURATION
    // =====================================================
    const API_URL = window.TRAVEL_NEXUS_API_ORIGIN + "/api/authority/alerts/";

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        [...parent.querySelectorAll(selector)];

    const alertList = $("#alertList");
    const emptyState = $("#emptyState");

    const searchInput = $("#searchInput");
    const severityFilter = $("#severityFilter");
    const statusFilter = $("#statusFilter");

    const criticalCount = $("#criticalCount");
    const activeCount = $("#activeCount");
    const investigatingCount = $("#investigatingCount");
    const resolvedCount = $("#resolvedCount");
    const visibleAlertCount = $("#visibleAlertCount");

    const notificationBtn = $("#notificationBtn");
    const refreshBtn = $("#refreshBtn");
    const resetFiltersBtn = $("#resetFiltersBtn");
    const emptyResetBtn = $("#emptyResetBtn");

    const modal = $("#alertModal");
    const modalTitle = $("#modalTitle");
    const modalReference = $("#modalReference");
    const modalContent = $("#modalContent");
    const modalActionBtn = $("#modalActionBtn");
    const closeModalBtn = $("#closeModalBtn");
    const modalCloseBtn = $("#modalCloseBtn");

    const toast = $("#toast");
    const toastMessage = $("#toastMessage");
    const closeToastBtn = $("#closeToastBtn");

    let alerts = [];
    let selectedAlertId = null;
    let toastTimer = null;
    let isLoading = false;

    // =====================================================
    // SAFE HELPERS
    // =====================================================
    function setText(element, value) {
        if (element) {
            element.textContent = String(value ?? "");
        }
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    function refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    function normalizeSeverity(value) {
        const severity = String(value || "medium").toLowerCase();

        return ["critical", "high", "medium", "low"].includes(severity)
            ? severity
            : "medium";
    }

    function normalizeStatus(value) {
        const status = String(value || "active").toLowerCase();

        if (status === "acknowledged" || status === "under_review") {
            return "investigating";
        }

        if (status === "investigating") return "investigating";
        if (status === "resolved" || status === "closed") return "resolved";

        return "active";
    }

    function getStatusLabel(status) {
        return {
            active: "Active",
            investigating: "Investigating",
            resolved: "Resolved"
        }[status] || "Active";
    }

    function getSeverityIcon(type) {
        const icons = {
            sos: "heart-pulse",
            medical: "heart-pulse",
            geofence: "map-pin",
            security: "shield-alert",
            suspicious_activity: "shield-alert",
            location: "map-pin"
        };

        return icons[String(type || "").toLowerCase()] || "triangle-alert";
    }

    function getLocation(alert) {
        if (alert.location) return alert.location;

        if (alert.latitude != null && alert.longitude != null) {
            return `${alert.latitude}, ${alert.longitude}`;
        }

        return "Location unavailable";
    }

    function getTimeAgo(dateValue) {
        if (!dateValue) return "Time unavailable";

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) return "Time unavailable";

        const minutes = Math.max(
            0,
            Math.floor((Date.now() - date.getTime()) / 60000)
        );

        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes} min ago`;

        const hours = Math.floor(minutes / 60);

        if (hours < 24) return `${hours} hr ago`;

        return `${Math.floor(hours / 24)} day ago`;
    }

    function formatDate(dateValue) {
        if (!dateValue) return "Not available";

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) return "Not available";

        return date.toLocaleString();
    }

    function showToast(message) {
        setText(toastMessage, message);

        if (!toast) return;

        toast.classList.add("show");
        toast.hidden = false;

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
    }

    // =====================================================
    // CONVERT API DATA INTO FRONTEND ALERT OBJECTS
    // =====================================================
    function normalizeAlert(item) {
        return {
            id: String(item.id ?? item.alert_code ?? ""),
            reference: String(item.alert_code ?? item.id ?? "Alert"),
            travelerId: String(item.traveler_id ?? "Unknown traveler"),
            travelerName: String(item.traveler_name ?? "Unknown traveler"),
            severity: normalizeSeverity(item.severity),
            status: normalizeStatus(item.status),
            title: String(item.title ?? "Emergency Alert"),
            description: String(item.description ?? "No description available."),
            location: getLocation(item),
            team: String(item.assigned_team ?? item.team ?? "Authority Response Team"),
            type: String(item.alert_type ?? "general"),
            latitude: item.latitude ?? null,
            longitude: item.longitude ?? null,
            createdAt: item.created_at ?? null,
            acknowledgedAt: item.acknowledged_at ?? null,
            resolvedAt: item.resolved_at ?? null
        };
    }

    // =====================================================
    // BUILD CARDS USING YOUR EXISTING CSS CLASSES
    // =====================================================
    function renderAlertCard(alert) {
        const severity = alert.severity;
        const status = alert.status;

        const severityRail = `rail-${severity}`;
        const symbolClass = `symbol-${severity}`;
        const severityBadge = `badge-${severity}`;
        const statusBadge = `status-${status}`;

        const severityLabel =
            severity.charAt(0).toUpperCase() + severity.slice(1);

        const title = escapeHTML(alert.title);
        const reference = escapeHTML(alert.reference);
        const description = escapeHTML(alert.description);
        const location = escapeHTML(alert.location);
        const travelerId = escapeHTML(alert.travelerId);
        const team = escapeHTML(alert.team);
        const timeAgo = escapeHTML(getTimeAgo(alert.createdAt));
        const statusLabel = escapeHTML(getStatusLabel(status));
        const searchText = escapeHTML([
            alert.reference,
            alert.title,
            alert.description,
            alert.location,
            alert.travelerId,
            alert.travelerName,
            alert.team,
            alert.type
        ].join(" ").toLowerCase());

        const actionButton = status === "resolved"
            ? ""
            : status === "investigating"
                ? `
                    <button class="button button-primary resolve-btn" type="button">
                        <i data-lucide="check-circle-2"></i> Resolve
                    </button>`
                : `
                    <button class="button button-primary investigate-btn" type="button">
                        <i data-lucide="shield-check"></i> Investigate
                    </button>`;

        const updatedText = status === "resolved"
            ? "Incident resolved"
            : status === "investigating"
                ? "Review in progress"
                : severity === "critical"
                    ? "Requires immediate review"
                    : "Awaiting review";

        return `
            <article class="alert-card"
                data-id="${escapeHTML(alert.reference)}"
                data-record-id="${escapeHTML(alert.id)}"
                data-severity="${severity}"
                data-status="${status}"
                data-title="${escapeHTML(alert.title)}"
                data-location="${escapeHTML(alert.location)}"
                data-traveler="${escapeHTML(alert.travelerId)}"
                data-team="${escapeHTML(alert.team)}"
                data-description="${escapeHTML(alert.description)}"
                data-search="${searchText}">

                <div class="severity-rail ${severityRail}"></div>

                <div class="alert-card-inner">
                    <div class="alert-main-row">
                        <div class="alert-symbol ${symbolClass}">
                            <i data-lucide="${getSeverityIcon(alert.type)}"></i>
                        </div>

                        <div class="alert-main-copy">
                            <div class="alert-badges">
                                <span class="severity-badge ${severityBadge}">
                                    <span></span> ${severityLabel}
                                </span>
                                <span class="status-badge ${statusBadge}">
                                    ${statusLabel}
                                </span>
                            </div>

                            <h4>${title}</h4>
                            <span class="alert-reference">${reference}</span>
                        </div>

                        <span class="alert-age">
                            <i data-lucide="clock-3"></i> ${timeAgo}
                        </span>
                    </div>

                    <p class="alert-description">${description}</p>

                    <div class="alert-meta">
                        <span><i data-lucide="map-pin"></i> ${location}</span>
                        <span><i data-lucide="user-round"></i> ${travelerId}</span>
                        <span><i data-lucide="users"></i> ${team}</span>
                    </div>

                    <div class="alert-footer">
                        <span class="updated-label">
                            <i data-lucide="activity"></i> ${updatedText}
                        </span>

                        <div class="alert-actions">
                            <button class="button button-outline view-btn" type="button">
                                <i data-lucide="eye"></i> View details
                            </button>
                            ${actionButton}
                        </div>
                    </div>
                </div>
            </article>`;
    }

    function renderAlerts() {
        if (!alertList) return;

        // Keep the existing empty-state element.
        const cardsHTML = alerts.map(renderAlertCard).join("");

        alertList.querySelectorAll(".alert-card").forEach(card => card.remove());

        if (emptyState) {
            emptyState.insertAdjacentHTML("beforebegin", cardsHTML);
        } else {
            alertList.insertAdjacentHTML("beforeend", cardsHTML);
        }

        applyFilters();
        refreshIcons();
    }

    // =====================================================
    // STATISTICS — ALWAYS NULL-SAFE
    // =====================================================
    function updateStatistics() {
        const critical = alerts.filter(
            alert => alert.severity === "critical" &&
                     alert.status !== "resolved"
        ).length;

        const active = alerts.filter(
            alert => alert.status === "active"
        ).length;

        const investigating = alerts.filter(
            alert => alert.status === "investigating"
        ).length;

        const resolved = alerts.filter(
            alert => alert.status === "resolved"
        ).length;

        setText(criticalCount, critical);
        setText(activeCount, active);
        setText(investigatingCount, investigating);
        setText(resolvedCount, resolved);

        const unresolved = alerts.filter(
            alert => alert.status !== "resolved"
        ).length;

        const notificationCount = $(".notification-count");

        setText(notificationCount, unresolved);

        if (notificationCount) {
            notificationCount.hidden = unresolved === 0;
        }
    }

    // =====================================================
    // SEARCH AND FILTERS
    // =====================================================
    function applyFilters() {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const severity = severityFilter?.value || "all";
        const status = statusFilter?.value || "all";

        let visible = 0;

        $$(".alert-card", alertList || document).forEach(card => {
            const text = [
                card.dataset.id,
                card.dataset.title,
                card.dataset.location,
                card.dataset.traveler,
                card.dataset.team,
                card.dataset.description,
                card.dataset.search
            ].join(" ").toLowerCase();

            const matchesSearch = !query || text.includes(query);
            const matchesSeverity =
                severity === "all" || card.dataset.severity === severity;
            const matchesStatus =
                status === "all" || card.dataset.status === status;

            const show =
                matchesSearch && matchesSeverity && matchesStatus;

            card.hidden = !show;

            if (show) visible++;
        });

        if (emptyState) {
            emptyState.hidden = visible !== 0;
        }

        setText(
            visibleAlertCount,
            `${visible} ${visible === 1 ? "alert" : "alerts"}`
        );

        updateStatistics();
    }

    function resetFilters() {
        if (searchInput) searchInput.value = "";
        if (severityFilter) severityFilter.value = "all";
        if (statusFilter) statusFilter.value = "all";

        applyFilters();
    }

    // =====================================================
    // DETAILS MODAL
    // =====================================================
    function openModal(alert) {
        if (!modal || !alert) return;

        selectedAlertId = alert.id;

        setText(modalTitle, alert.title);
        setText(modalReference, alert.reference);

        if (modalContent) {
            modalContent.innerHTML = `
                <div class="detail-row">
                    <strong>Severity</strong>
                    <span>${escapeHTML(alert.severity.toUpperCase())}</span>
                </div>
                <div class="detail-row">
                    <strong>Status</strong>
                    <span>${escapeHTML(getStatusLabel(alert.status))}</span>
                </div>
                <div class="detail-row">
                    <strong>Traveler</strong>
                    <span>${escapeHTML(alert.travelerName)} (${escapeHTML(alert.travelerId)})</span>
                </div>
                <div class="detail-row">
                    <strong>Location</strong>
                    <span>${escapeHTML(alert.location)}</span>
                </div>
                <div class="detail-row">
                    <strong>Response team</strong>
                    <span>${escapeHTML(alert.team)}</span>
                </div>
                <div class="detail-row">
                    <strong>Reported</strong>
                    <span>${escapeHTML(formatDate(alert.createdAt))}</span>
                </div>
                <div class="detail-row">
                    <strong>Description</strong>
                    <p>${escapeHTML(alert.description)}</p>
                </div>`;

            // Optional CSS compatibility if detail-row styles are absent.
            modalContent.style.overflowWrap = "anywhere";
        }

        if (modalActionBtn) {
            modalActionBtn.hidden = alert.status === "resolved";
            modalActionBtn.innerHTML = alert.status === "investigating"
                ? '<i data-lucide="check-circle-2"></i> Resolve alert'
                : '<i data-lucide="shield-check"></i> Investigate alert';
        }

        modal.hidden = false;
        modal.classList.add("is-open");
        document.body.classList.add("modal-open");

        refreshIcons();
    }

    function closeModal() {
        if (!modal) return;

        modal.hidden = true;
        modal.classList.remove("is-open");
        document.body.classList.remove("modal-open");
        selectedAlertId = null;
    }

    // =====================================================
    // STATUS ACTIONS
    // NOTE: These update the current browser state only.
    // A backend update endpoint is required to save to DB.
    // =====================================================
    
async function updateAlertStatus(alert, newStatus) {
    if (!alert) return;

    if (!["investigating", "resolved"].includes(newStatus)) {
        return;
    }

    const previousStatus = alert.status;

    // The backend stores "acknowledged", not "investigating".
    const databaseStatus =
        newStatus === "investigating" ? "acknowledged" : "resolved";

    try {
        const response = await fetch(
            `${API_URL}${encodeURIComponent(alert.id)}/status/`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    status: databaseStatus
                })
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || `HTTP ${response.status}`
            );
        }

        // Change the page only after the database update succeeds.
        alert.status = normalizeStatus(result.data.status);
        alert.acknowledgedAt = result.data.acknowledged_at;
        alert.resolvedAt = result.data.resolved_at;

        renderAlerts();

        showToast(
            `${alert.reference} status saved successfully.`
        );

        if (modal && !modal.hidden && selectedAlertId === alert.id) {
            openModal(alert);
        }

    } catch (error) {
        alert.status = previousStatus;

        console.error("Failed to save alert status:", error);

        showToast(
            error.message || "Could not save alert status."
        );
    }
}

    // =====================================================
    // LOAD LIVE DATA FROM DJANGO
    // =====================================================
    async function loadAlerts(silent = false) {
        if (isLoading) return;

        isLoading = true;

        if (refreshBtn && !silent) {
            refreshBtn.disabled = true;
            refreshBtn.classList.add("loading");
        }

        try {
            const response = await fetch(API_URL, {
                method: "GET",
                headers: { "Accept": "application/json" },
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(`API returned HTTP ${response.status}`);
            }

            const result = await response.json();

            if (!result.success || !Array.isArray(result.data)) {
                throw new Error("Unexpected response format from Alerts API.");
            }

            alerts = result.data.map(normalizeAlert);

            renderAlerts();
        } catch (error) {
            console.error("Unable to load live alerts:", error);
            alerts = [];
            renderAlerts();
            const emptyHeading = $("h3", emptyState);
            const emptyMessage = $("p", emptyState);
            setText(emptyHeading, "Live alerts unavailable");
            setText(emptyMessage, error.message);
            if (!silent) showToast("Could not load live alerts. Check that Django is running.");
        } finally {
            isLoading = false;

            if (refreshBtn && !silent) {
                refreshBtn.disabled = false;
                refreshBtn.classList.remove("loading");
            }
        }
    }

    // =====================================================
    // EVENT LISTENERS
    // =====================================================
    searchInput?.addEventListener("input", applyFilters);
    severityFilter?.addEventListener("change", applyFilters);
    statusFilter?.addEventListener("change", applyFilters);

    resetFiltersBtn?.addEventListener("click", resetFilters);
    emptyResetBtn?.addEventListener("click", resetFilters);

    refreshBtn?.addEventListener("click", loadAlerts);

    closeModalBtn?.addEventListener("click", closeModal);
    modalCloseBtn?.addEventListener("click", closeModal);

    modal?.addEventListener("click", event => {
        if (event.target === modal) closeModal();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeModal();
    });

    closeToastBtn?.addEventListener("click", () => {
        if (toast) toast.classList.remove("show");
        clearTimeout(toastTimer);
    });


    // Delegated click handling supports cards loaded after the API request.
    alertList?.addEventListener("click", event => {
        const card = event.target.closest(".alert-card");
        if (!card) return;

        const reference = card.dataset.id;
        const alert = alerts.find(
            item => item.reference === reference ||
                    item.id === card.dataset.recordId
        );

        if (!alert) return;

        if (event.target.closest(".view-btn")) {
            openModal(alert);
            return;
        }

        if (event.target.closest(".investigate-btn")) {
            updateAlertStatus(alert, "investigating");
            return;
        }

        if (event.target.closest(".resolve-btn")) {
            updateAlertStatus(alert, "resolved");
        }
    });

    modalActionBtn?.addEventListener("click", () => {
        const alert = alerts.find(item => item.id === selectedAlertId);
        if (!alert) return;

        updateAlertStatus(
            alert,
            alert.status === "investigating" ? "resolved" : "investigating"
        );
    });

    // =====================================================
    // INITIALIZE
    // =====================================================
    alerts = [];
    applyFilters();
    refreshIcons();

    // Replace demo cards with real records from Django.
    loadAlerts();
    window.setInterval(() => loadAlerts(true), 2500);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") loadAlerts(true);
    });
});
