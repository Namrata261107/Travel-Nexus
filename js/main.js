
document.addEventListener("DOMContentLoaded", () => {
    const navButtons = document.querySelectorAll(".nav-item[data-section]");
    const sections = document.querySelectorAll(".page-section");

    const notificationBtn = document.getElementById("notificationBtn");
    const notificationPanel = document.getElementById("notificationPanel");
    const notificationOverlay = document.getElementById("notificationOverlay");
    const closeNotifications = document.getElementById("closeNotifications");
    const markNotificationsRead = document.getElementById("markNotificationsRead");
    const notificationBadge = document.querySelector(".notification-badge");

    const profileBtn = document.getElementById("profileBtn");
    const profileMenu = document.getElementById("profileMenu");

    const toast = document.getElementById("toast");
    const toastTitle = document.getElementById("toastTitle");
    const toastMessage = document.getElementById("toastMessage");
    const closeToast = document.getElementById("closeToast");

    const mapArt = document.getElementById("mapArt");
    const mapTooltip = document.getElementById("mapTooltip");

    let zoomLevel = 1;
    let toastTimer;
    let selectedMarker = null;

    // -------------------------------
    // NAVIGATION
    // -------------------------------

    function showSection(sectionId) {
        const targetSection = document.getElementById(sectionId);

        if (!targetSection || !targetSection.classList.contains("page-section")) {
            return;
        }

        sections.forEach((section) => {
            section.classList.toggle("active-section", section.id === sectionId);
        });

        navButtons.forEach((button) => {
            const isActive = button.dataset.section === sectionId;

            button.classList.toggle("active", isActive);

            if (isActive) {
                button.setAttribute("aria-current", "page");
            } else {
                button.removeAttribute("aria-current");
            }
        });

        profileMenu?.classList.remove("open");
        profileBtn?.setAttribute("aria-expanded", "false");

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    navButtons.forEach((button) => {
        button.addEventListener("click", () => {
            showSection(button.dataset.section);
        });
    });

    // Buttons that navigate from inside a page.
    document.querySelectorAll("[data-go]").forEach((button) => {
        button.addEventListener("click", () => {
            showSection(button.dataset.go);
        });
    });

    // -------------------------------
    // TOAST MESSAGES
    // -------------------------------

    function showToast(message, title = "Notice") {
        if (!toast || !toastTitle || !toastMessage) return;

        window.clearTimeout(toastTimer);

        toastTitle.textContent = title;
        toastMessage.textContent = message;
        toast.classList.add("show");

        toastTimer = window.setTimeout(() => {
            toast.classList.remove("show");
        }, 3500);
    }

    function hideToast() {
        toast?.classList.remove("show");
        window.clearTimeout(toastTimer);
    }

    closeToast?.addEventListener("click", hideToast);

    document.querySelectorAll("[data-toast]").forEach((button) => {
        button.addEventListener("click", () => {
            showToast(button.dataset.toast);
        });
    });

    // -------------------------------
    // NOTIFICATION DRAWER
    // -------------------------------

    function openNotifications() {
        notificationPanel?.classList.add("open");
        notificationOverlay?.classList.add("open");

        notificationPanel?.setAttribute("aria-hidden", "false");
        notificationBtn?.setAttribute("aria-expanded", "true");

        document.body.style.overflow = "hidden";
        closeNotifications?.focus();
    }

    function closeNotificationDrawer() {
        notificationPanel?.classList.remove("open");
        notificationOverlay?.classList.remove("open");

        notificationPanel?.setAttribute("aria-hidden", "true");
        notificationBtn?.setAttribute("aria-expanded", "false");

        document.body.style.overflow = "";
    }

    notificationBtn?.addEventListener("click", openNotifications);
    closeNotifications?.addEventListener("click", closeNotificationDrawer);
    notificationOverlay?.addEventListener("click", closeNotificationDrawer);

    document.querySelectorAll("[data-open-notifications]").forEach((button) => {
        button.addEventListener("click", openNotifications);
    });

    markNotificationsRead?.addEventListener("click", () => {
        if (notificationBadge) {
            notificationBadge.textContent = "0";
            notificationBadge.style.display = "none";
        }

        const notificationSubtitle = document.querySelector(
            ".notification-header span"
        );

        if (notificationSubtitle) {
            notificationSubtitle.textContent = "All caught up";
        }

        showToast("All sample notifications marked as read.", "Notifications");
        closeNotificationDrawer();
    });

    // -------------------------------
    // ADMIN PROFILE MENU
    // -------------------------------

    profileBtn?.addEventListener("click", (event) => {
        event.stopPropagation();

        const isOpen = profileMenu?.classList.toggle("open") ?? false;
        profileBtn.setAttribute("aria-expanded", String(isOpen));
    });

    profileMenu?.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    document.addEventListener("click", (event) => {
        if (
            profileMenu &&
            !profileMenu.contains(event.target) &&
            !profileBtn?.contains(event.target)
        ) {
            profileMenu.classList.remove("open");
            profileBtn?.setAttribute("aria-expanded", "false");
        }
    });

    document.getElementById("profileSettingsBtn")?.addEventListener("click", () => {
        profileMenu?.classList.remove("open");
        profileBtn?.setAttribute("aria-expanded", "false");
        showSection("settings");
    });

    // -------------------------------
    // MAP ZOOM
    // -------------------------------

    function updateZoom() {
        if (mapArt) {
            mapArt.style.transform = `scale(${zoomLevel})`;
        }
    }

    document.getElementById("zoomIn")?.addEventListener("click", () => {
        if (zoomLevel < 1.8) {
            zoomLevel = Math.min(1.8, +(zoomLevel + 0.2).toFixed(1));
            updateZoom();
        } else {
            showToast("Maximum demo map zoom reached.");
        }
    });

    document.getElementById("zoomOut")?.addEventListener("click", () => {
        if (zoomLevel > 0.8) {
            zoomLevel = Math.max(0.8, +(zoomLevel - 0.2).toFixed(1));
            updateZoom();
        } else {
            showToast("Minimum demo map zoom reached.");
        }
    });

    // -------------------------------
    // LOCATE ALL SAMPLE MARKERS
    // -------------------------------

    document.getElementById("locateAll")?.addEventListener("click", () => {
        zoomLevel = 1;
        updateZoom();

        document.querySelectorAll(".big-marker").forEach((marker) => {
            marker.classList.remove("selected");
        });

        selectedMarker = null;

        if (mapTooltip) {
            mapTooltip.classList.remove("visible");
        }

        showToast("All sample traveler markers are visible.", "Map reset");
    });

    // -------------------------------
    // CLICK A MAP MARKER
    // -------------------------------

    document.querySelectorAll(".big-marker").forEach((marker) => {
        marker.addEventListener("click", () => {
            if (selectedMarker) {
                selectedMarker.classList.remove("selected");
            }

            selectedMarker = marker;
            marker.classList.add("selected");

            if (mapTooltip) {
                mapTooltip.textContent =
                    `${marker.dataset.traveler} — ${marker.dataset.status}`;
                mapTooltip.classList.add("visible");
            }
        });
    });

    // -------------------------------
    // SEARCH TRAVELERS
    // -------------------------------

    const travelerSearch = document.getElementById("travelerSearch");
    const travelerRows = document.querySelectorAll(".mini-traveler");
    const emptySearch = document.getElementById("emptySearch");

    travelerSearch?.addEventListener("input", () => {
        const query = travelerSearch.value.trim().toLowerCase();
        let visibleCount = 0;

        travelerRows.forEach((row) => {
            const searchableText = (
                row.dataset.search || row.textContent
            ).toLowerCase();

            const matches = searchableText.includes(query);

            row.hidden = !matches;

            if (matches) {
                visibleCount++;
            }
        });

        if (emptySearch) {
            emptySearch.hidden = visibleCount !== 0;
        }
    });

    // -------------------------------
    // SETTINGS
    // -------------------------------

    const compactNav = document.getElementById("compactNav");
    const reduceMotion = document.getElementById("reduceMotion");

    compactNav?.addEventListener("change", () => {
        document.body.classList.toggle(
            "compact-navigation",
            compactNav.checked
        );

        showToast(
            compactNav.checked
                ? "Compact navigation enabled."
                : "Compact navigation disabled.",
            "Settings"
        );
    });

    reduceMotion?.addEventListener("change", () => {
        document.body.classList.toggle(
            "reduce-motion",
            reduceMotion.checked
        );

        showToast(
            reduceMotion.checked
                ? "Reduced animations enabled."
                : "Reduced animations disabled.",
            "Settings"
        );
    });

    // -------------------------------
    // KEYBOARD SUPPORT
    // -------------------------------

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeNotificationDrawer();
            profileMenu?.classList.remove("open");
            profileBtn?.setAttribute("aria-expanded", "false");
            hideToast();
        }
    });

    // -------------------------------
    // INITIAL STATE
    // -------------------------------

    showSection("monitoring");
});
