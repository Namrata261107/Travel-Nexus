(() => {
    "use strict";

    const API_URL = "http://127.0.0.1:8000/api/authority/travelers/";

    // Store traveler data
    let travelers = [];
    let filteredTravelers = [];
    let currentTraveler = null;
    let databaseTotal = 0;
    let loadingTravelers = false;
    

    // Get HTML element by ID
    const $ = (id) => document.getElementById(id);

    // Safely update text
    function setText(id, value) {
        const element = $(id);

        if (element) {
            element.textContent = value;
        }
    }

    // Format numbers
    function formatNumber(value) {
        return Number(value || 0).toLocaleString("en-IN");
    }

    // Normalize API data
    function normalizeTraveler(record) {
        return {
            profileId: record.profile_id || "",
            id: record.traveler_id || "—",
            name: record.traveler_name || "Name unavailable",
            email: record.email || "—",
            phone: record.phone || "—",
            nationality: record.nationality || "—",
            gender: record.gender || "—",
            emergencyStatus: normalizeEmergencyStatus(
                record.emergency_status
            ),
            destination: record.destination || "Not specified",
            startTime: record.start_time || "",
            journeyStatus: normalizeJourneyStatus(
                record.journey_status
            ),
            createdAt: record.created_at || "",
            locationRecordedAt: record.location_recorded_at || ""
        };
    }

    // Normalize emergency status
    function normalizeEmergencyStatus(status) {
        const value = String(status || "").toLowerCase().trim();

        if (
            ["emergency", "alert", "help needed", "critical"].includes(value)
        ) {
            return "emergency";
        }

        if (
            ["warning", "needs attention", "attention"].includes(value)
        ) {
            return "attention";
        }

        if (value === "safe") {
            return "safe";
        }

        return value || "registered";
    }

    // Normalize journey status
    function normalizeJourneyStatus(status) {
        const value = String(status || "").toLowerCase().trim();

        if (["active", "traveling", "in progress"].includes(value)) {
            return "traveling";
        }

        if (["completed", "closed", "finished"].includes(value)) {
            return "completed";
        }

        return value || "unknown";
    }

    // Format dates
    function formatDate(dateValue) {
        if (!dateValue) {
            return "—";
        }

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    // Escape text before placing it into HTML
    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            };

            return entities[character];
        });
    }

    // Display notification if the page has a toast element
    function showToast(message, type = "info") {
        const toast = $("toast");

        if (toast) {
            toast.textContent = message;
            toast.dataset.type = type;
            toast.classList.add("show");

            window.setTimeout(() => {
                toast.classList.remove("show");
            }, 3000);

            return;
        }

        console.log(`[Travel Nexus] ${message}`);
    }

    // Populate destination dropdown
    function populateDestinationFilter() {
        const destinationFilter = $("destinationFilter");

        if (!destinationFilter) {
            return;
        }

        const selectedValue = destinationFilter.value;

        const destinations = [
            ...new Set(
                travelers
                    .map((traveler) => traveler.destination)
                    .filter(
                        (destination) =>
                            destination &&
                            destination !== "Not specified"
                    )
            )
        ].sort((a, b) => a.localeCompare(b));

        destinationFilter.innerHTML =
            '<option value="all">All Destinations</option>';

        destinations.forEach((destination) => {
            const option = document.createElement("option");
            option.value = destination;
            option.textContent = destination;
            destinationFilter.appendChild(option);
        });

        if (
            [...destinationFilter.options].some(
                (option) => option.value === selectedValue
            )
        ) {
            destinationFilter.value = selectedValue;
        }
    }

    // Apply search, status and destination filters
    function getFilteredTravelers() {
        const searchInput = $("searchInput");
        const statusFilter = $("statusFilter");
        const destinationFilter = $("destinationFilter");

        const searchTerm = (
            searchInput?.value || ""
        ).trim().toLowerCase();

        const selectedStatus = statusFilter?.value || "all";
        const selectedDestination = destinationFilter?.value || "all";

        return travelers.filter((traveler) => {
            const searchableText = [
                traveler.name,
                traveler.id,
                traveler.email,
                traveler.phone,
                traveler.destination,
                traveler.nationality
            ]
                .join(" ")
                .toLowerCase();

            const matchesSearch =
                !searchTerm || searchableText.includes(searchTerm);

            const matchesStatus =
                selectedStatus === "all" ||
                traveler.journeyStatus === selectedStatus ||
                traveler.emergencyStatus === selectedStatus;

            const matchesDestination =
                selectedDestination === "all" ||
                traveler.destination === selectedDestination;

            return (
                matchesSearch &&
                matchesStatus &&
                matchesDestination
            );
        });
    }

    // Create status badge
    function createBadge(status, type) {
        const safeStatus = escapeHTML(status);

        const label = status
            .replace(/_/g, " ")
            .replace(/\b\w/g, (character) => character.toUpperCase());

        return `
            <span class="status-badge ${type}-${safeStatus}">
                ${escapeHTML(label)}
            </span>
        `;
    }

    // Render traveler table
    function render() {
        filteredTravelers = getFilteredTravelers();

        const tableBody =
            $("travelersTableBody") ||
            $("travelersTable")?.querySelector("tbody") ||
            $("travelerRows");

        if (tableBody) {
            if (filteredTravelers.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="empty-state">
                            No traveler records found.
                        </td>
                    </tr>
                `;
            } else {
                tableBody.innerHTML = filteredTravelers
                    .map((traveler) => {
                        return `
                            <tr>
                                <td>
                                    <div class="traveler-info">
                                        <strong>${escapeHTML(traveler.name)}</strong>
                                    <small>${escapeHTML(traveler.email)}</small>
                                    <small class="account-presence ${isRecentlyActive(traveler.locationRecordedAt) ? "is-active" : "is-registered"}">${isRecentlyActive(traveler.locationRecordedAt) ? "Active · location shared recently" : "Registered · no recent location"}</small>
                                    </div>
                                </td>

                                <td>${escapeHTML(traveler.id)}</td>

                                <td>${escapeHTML(traveler.destination)}</td>

                                <td>${escapeHTML(formatDate(traveler.startTime))}</td>

                                <td>
                                    ${createBadge(
                                        traveler.journeyStatus,
                                        "journey"
                                    )}
                                </td>

                                <td>
                                    ${createBadge(
                                        traveler.emergencyStatus,
                                        "emergency"
                                    )}
                                </td>

                                <td>
                                    <button
                                        type="button"
                                        class="view-traveler-btn"
                                        data-profile-id="${escapeHTML(traveler.profileId)}"
                                        data-traveler-id="${escapeHTML(traveler.id)}"
                                    >
                                        View Details
                                    </button>
                                </td>
                            </tr>
                        `;
                    })
                    .join("");
            }
        }

        // Update record count
        setText("recordCount", filteredTravelers.length);
        setText("activeRecordCount", `${travelers.filter(t => isRecentlyActive(t.locationRecordedAt)).length} active`);

        // Update table summary
        setText(
            "tableSummary",
            `Showing ${formatNumber(filteredTravelers.length)} of ${formatNumber(databaseTotal)} travelers`
        );

        updateStatistics();
        renderRecentActivity();
    }

    function isRecentlyActive(timestamp) {
        const recordedAt = Date.parse(timestamp || "");
        return Number.isFinite(recordedAt) && Date.now() - recordedAt <= 120000;
    }

    function renderRecentActivity() {
        const container = $("recentActivityList");
        if (!container) return;
        const events = travelers.flatMap(traveler => {
            const items = [];
            if (traveler.createdAt) items.push({
                type: "registered", title: "Traveler registered", traveler,
                timestamp: traveler.createdAt
            });
            if (traveler.locationRecordedAt) items.push({
                type: "location", title: "Location shared", traveler,
                timestamp: traveler.locationRecordedAt
            });
            return items;
        }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 5);

        if (!events.length) {
            container.innerHTML = '<p>No registration or location activity is available yet.</p>';
            return;
        }
        container.innerHTML = events.map(item => `
            <div class="activity-item">
                <span class="activity-icon ${item.type === "registered" ? "blue-bg" : "green-bg"}"><i class="fa-solid ${item.type === "registered" ? "fa-user-plus" : "fa-location-dot"}"></i></span>
                <div><strong>${item.title}</strong><p>${escapeHTML(item.traveler.name)} · ${escapeHTML(item.traveler.id)}</p><small>${escapeHTML(formatDateTime(item.timestamp))}</small></div>
                <b class="mini-tag ${item.type === "registered" ? "blue-tag" : "green-tag"}">${item.type === "registered" ? "NEW" : "LIVE"}</b>
            </div>
        `).join("");
    }

    function formatDateTime(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString("en-IN");
    }

    // Update all statistic cards and the chart
   function updateStatistics() {
    const totalTraveling = travelers.filter(
        t => t.journeyStatus === "traveling"
    ).length;
    const totalRecentlyActive = travelers.filter(
        t => isRecentlyActive(t.locationRecordedAt)
    ).length;

    const totalSafe = travelers.filter(
        t => t.emergencyStatus === "safe" &&
             t.journeyStatus !== "completed"
    ).length;

    const totalAttention = travelers.filter(
        t => t.emergencyStatus === "attention"
    ).length;

    const totalCompleted = travelers.filter(
        t => t.journeyStatus === "completed"
    ).length;

    // Statistics cards: use the exact IDs in your HTML
    setText("totalStat", databaseTotal.toLocaleString("en-IN"));
    setText("activeNowStat", totalRecentlyActive);
    setText("attentionStat", totalAttention);
    setText("completedStat", totalCompleted);

    const setProgress = (id, count) => {
        const element = $(id);
        if (element) element.style.width = `${databaseTotal ? Math.min(100, (count / databaseTotal) * 100) : 0}%`;
    };
    setProgress("totalProgress", databaseTotal);
    setProgress("activeProgress", totalRecentlyActive);
    setProgress("attentionProgress", totalAttention);
    setProgress("completedProgress", totalCompleted);

    // Update chart
    updateStatusChart({
        totalTraveling,
        totalSafe,
        totalAttention,
        totalCompleted
    });
}

    // Update chart counts and donut chart
    function updateStatusChart(counts) {
        const {
            totalTraveling,
            totalSafe,
            totalAttention,
            totalCompleted
        } = counts;

        // IMPORTANT: This updates the center of the donut chart
        setText("chartTotal", formatNumber(databaseTotal));

        setText("chartTraveling", formatNumber(totalTraveling));
        setText("chartSafe", formatNumber(totalSafe));
        setText("chartAttention", formatNumber(totalAttention));
        setText("chartCompleted", formatNumber(totalCompleted));

        const chartTotal = databaseTotal || 0;

        setText(
            "chartTravelingPercent",
            `${chartTotal ? Math.round((totalTraveling / chartTotal) * 100) : 0}%`
        );

        setText(
            "chartSafePercent",
            `${chartTotal ? Math.round((totalSafe / chartTotal) * 100) : 0}%`
        );

        setText(
            "chartAttentionPercent",
            `${chartTotal ? Math.round((totalAttention / chartTotal) * 100) : 0}%`
        );
        setText("chartTotal", databaseTotal);

        setText(
            "chartCompletedPercent",
            `${chartTotal ? Math.round((totalCompleted / chartTotal) * 100) : 0}%`
        );

        const donut = $("statusDonut") || $("donutChart");

        if (donut) {
            const travelingPercent = chartTotal
                ? (totalTraveling / chartTotal) * 100
                : 0;

            const safePercent = chartTotal
                ? (totalSafe / chartTotal) * 100
                : 0;

            const attentionPercent = chartTotal
                ? (totalAttention / chartTotal) * 100
                : 0;

            const completedPercent = chartTotal
                ? (totalCompleted / chartTotal) * 100
                : 0;

            const stop1 = travelingPercent;
            const stop2 = stop1 + safePercent;
            const stop3 = stop2 + attentionPercent;
            const stop4 = stop3 + completedPercent;

            donut.style.background = `
                conic-gradient(
                    #3984f5 0% ${stop1}%,
                    #20b982 ${stop1}% ${stop2}%,
                    #f3ad45 ${stop2}% ${stop3}%,
                    #8a72e8 ${stop3}% ${stop4}%,
                    #e8edf3 ${stop4}% 100%
                )
            `;
        }
    }

    // Display selected traveler details
    function viewTraveler(traveler) {
        currentTraveler = traveler;

        const modal = $("travelerModal");

        if (!modal) {
            showToast(
                `${traveler.name} — ${traveler.id} — ${traveler.destination}`
            );
            return;
        }

        setText("detailName", traveler.name);
        setText("detailTravelerId", traveler.id);
        setText("detailEmail", traveler.email);
        setText("detailPhone", traveler.phone);
        setText("detailNationality", traveler.nationality);
        setText("detailGender", traveler.gender);
        setText("detailDestination", traveler.destination);
        setText("detailStartTime", formatDate(traveler.startTime));
        setText("detailJourneyStatus", traveler.journeyStatus);
        setText("detailEmergencyStatus", traveler.emergencyStatus);

        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
    }

    // Close details modal
    function closeTravelerModal() {
        const modal = $("travelerModal");

        if (modal) {
            modal.classList.remove("show");
            modal.setAttribute("aria-hidden", "true");
        }

        currentTraveler = null;
    }

    // Reset filters
    function resetFilters() {
        if ($("searchInput")) {
            $("searchInput").value = "";
        }

        if ($("statusFilter")) {
            $("statusFilter").value = "all";
        }

        if ($("destinationFilter")) {
            $("destinationFilter").value = "all";
        }

        render();
    }

    // Load traveler records from Django API
    async function loadTravelers() {
        if (loadingTravelers) return;
        loadingTravelers = true;
        const refreshButton = $("refreshBtn");

        if (refreshButton) {
            refreshButton.disabled = true;
        }

        try {
            const response = await fetch(API_URL, {
                method: "GET",
                headers: {
                    Accept: "application/json"
                }
            });

            if (!response.ok) {
                throw new Error(`API request failed (${response.status})`);
            }

            const result = await response.json();

            if (!result.success || !Array.isArray(result.data)) {
                throw new Error(
                    result.message || "Unexpected API response."
                );
            }

            // Convert API records into the format used by this page
            travelers = result.data.map(normalizeTraveler);
            databaseTotal = Number(result.count ?? travelers.length);

            // Use the count returned by the backend
            const apiCount = Number(result.count);

            databaseTotal =
                result.count !== undefined &&
                result.count !== null &&
                Number.isFinite(apiCount) &&
                apiCount >= 0
                    ? apiCount
                    : travelers.length;

            populateDestinationFilter();
            render();

            console.log("Travelers API response:", result);
            console.log("Database/API traveler count:", databaseTotal);

            showToast(
                `${formatNumber(databaseTotal)} traveler records loaded.`,
                "success"
            );
        } catch (error) {
            console.error("Unable to load travelers:", error);

            travelers = [];
            filteredTravelers = [];
            databaseTotal = 0;

            render();

            showToast(
                "Unable to load travelers. Check that the Django backend is running.",
                "error"
            );
        } finally {
            loadingTravelers = false;
            if (refreshButton) {
                refreshButton.disabled = false;
            }
        }
    }

    // Connect page controls
    function bindEvents() {
        $("searchInput")?.addEventListener("input", render);
        $("statusFilter")?.addEventListener("change", render);
        $("destinationFilter")?.addEventListener("change", render);

        $("refreshBtn")?.addEventListener("click", loadTravelers);
        $("resetFiltersBtn")?.addEventListener("click", resetFilters);
        $("resetBtn")?.addEventListener("click", resetFilters);

        // Table View Details buttons
        document.addEventListener("click", (event) => {
            const button = event.target.closest(
                ".view-traveler-btn, [data-action='view-traveler']"
            );

            if (button) {
                const profileId = button.dataset.profileId || "";
                const travelerId = button.dataset.travelerId || "";

                const traveler = travelers.find(
                    (item) =>
                        (profileId && item.profileId === profileId) ||
                        (travelerId && item.id === travelerId)
                );

                if (traveler) {
                    viewTraveler(traveler);
                }
            }

            if (
                event.target.closest(
                    "#closeTravelerModal, [data-action='close-modal']"
                )
            ) {
                closeTravelerModal();
            }
        });

        // Close modal when clicking outside its content
        $("travelerModal")?.addEventListener("click", (event) => {
            if (event.target.id === "travelerModal") {
                closeTravelerModal();
            }
        });

        // Close modal with Escape key
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeTravelerModal();
            }
        });
    }

    // Start the page
    function init() {
        bindEvents();
        loadTravelers();
        window.setInterval(loadTravelers, 10000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
