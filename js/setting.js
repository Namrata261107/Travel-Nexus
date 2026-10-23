
/* ==========================================
   TRAVEL NEXUS - SETTINGS JAVASCRIPT
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const STORAGE_KEY = "travelNexusSettingsV1";

    const $ = (id) => document.getElementById(id);

    const controls = {
        fullName: $("fullName"),
        emailAddress: $("emailAddress"),
        phoneNumber: $("phoneNumber"),
        jobTitle: $("jobTitle"),

        compactMode: $("compactMode"),
        emergencyNotifications: $("emergencyNotifications"),
        travelerNotifications: $("travelerNotifications"),
        geofenceNotifications: $("geofenceNotifications"),
        systemNotifications: $("systemNotifications"),
        twoFactorAuth: $("twoFactorAuth"),
        sessionReminder: $("sessionReminder"),
        confirmReset: $("confirmReset"),

        languageSelect: $("languageSelect"),
        timezoneSelect: $("timezoneSelect"),
        dateFormat: $("dateFormat"),
        defaultDashboard: $("defaultDashboard")
    };

    const defaultSettings = {
        fullName: "Authority Admin",
        emailAddress: "admin@travelnexus.demo",
        phoneNumber: "",
        jobTitle: "Authority Administrator",

        theme: "light",
        accent: "#6558e8",
        compactMode: false,

        emergencyNotifications: true,
        travelerNotifications: true,
        geofenceNotifications: true,
        systemNotifications: false,

        twoFactorAuth: false,
        sessionReminder: true,
        confirmReset: true,

        languageSelect: "en",
        timezoneSelect: "Asia/Kolkata",
        dateFormat: "DD/MM/YYYY",
        defaultDashboard: "authority.html"
    };

    let savedSettings = { ...defaultSettings };
    let selectedTheme = "light";
    let selectedAccent = defaultSettings.accent;
    let toastSequence = 0;

    // --------------------------------------
    // STORAGE HELPERS
    // --------------------------------------

    function readSavedSettings() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);

            if (!stored) {
                return { ...defaultSettings };
            }

            const parsed = JSON.parse(stored);

            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                return { ...defaultSettings };
            }

            return {
                ...defaultSettings,
                ...parsed
            };
        } catch (error) {
            console.warn("Unable to read saved settings.", error);
            return { ...defaultSettings };
        }
    }

    function persistSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error("Unable to save settings.", error);
            showToast(
                "Storage unavailable",
                "Your browser could not save these settings. Check browser storage permissions.",
                "error"
            );
            return false;
        }
    }

    // --------------------------------------
    // APPLY SETTINGS TO THE INTERFACE
    // --------------------------------------

    function applyTheme(theme) {
        selectedTheme = theme === "dark" ? "dark" : "light";

        document.body.classList.toggle(
            "dark-theme",
            selectedTheme === "dark"
        );

        document.querySelectorAll(".theme-choice").forEach((button) => {
            const active = button.dataset.theme === selectedTheme;

            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function applyAccent(color) {
        const allowedColors = [
            "#6558e8",
            "#1687f8",
            "#0caa83",
            "#e76b42",
            "#d94c90"
        ];

        selectedAccent = allowedColors.includes(color)
            ? color
            : defaultSettings.accent;

        const rgb = selectedAccent
            .replace("#", "")
            .match(/.{2}/g)
            .map((part) => parseInt(part, 16))
            .join(", ");

        document.documentElement.style.setProperty("--accent", selectedAccent);
        document.documentElement.style.setProperty("--accent-rgb", rgb);

        document.querySelectorAll(".color-choice").forEach((button) => {
            const active = button.dataset.color === selectedAccent;

            button.classList.toggle("selected", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function applyCompactMode(enabled) {
        document.body.classList.toggle("compact-mode", Boolean(enabled));
    }

    function updateProfilePreview() {
        const name = controls.fullName.value.trim() || "Authority Admin";
        const email = controls.emailAddress.value.trim();

        $("profileDisplayName").textContent = name;
        $("profileDisplayEmail").textContent =
            email || "No email address entered";

        $("profileAvatar").textContent = name.charAt(0).toUpperCase();
    }

    function updateSaveIndicator(hasChanges) {
        const indicator = $("saveIndicator");

        if (!indicator) return;

        indicator.classList.toggle("unsaved", hasChanges);

        indicator.innerHTML = hasChanges
            ? '<i class="fa-solid fa-clock"></i> Unsaved changes'
            : '<i class="fa-solid fa-circle-check"></i> All changes saved';
    }

    // --------------------------------------
    // READ CURRENT FORM VALUES
    // --------------------------------------

    function getCurrentSettings() {
        const result = {};

        Object.keys(defaultSettings).forEach((key) => {
            if (key === "theme") {
                result.theme = selectedTheme;
            } else if (key === "accent") {
                result.accent = selectedAccent;
            } else if (controls[key]) {
                const element = controls[key];

                result[key] = element.type === "checkbox"
                    ? element.checked
                    : element.value;
            }
        });

        return result;
    }

    function fillControls(settings) {
        Object.keys(controls).forEach((key) => {
            const element = controls[key];

            if (!element || !(key in settings)) return;

            if (element.type === "checkbox") {
                element.checked = Boolean(settings[key]);
            } else {
                element.value = settings[key];
            }
        });

        applyTheme(settings.theme);
        applyAccent(settings.accent);
        applyCompactMode(settings.compactMode);
        updateProfilePreview();
    }

    function hasUnsavedChanges() {
        return JSON.stringify(getCurrentSettings()) !==
            JSON.stringify(savedSettings);
    }

    function refreshDirtyState() {
        updateSaveIndicator(hasUnsavedChanges());
    }

    // --------------------------------------
    // TOAST NOTIFICATIONS
    // --------------------------------------

    function showToast(title, message, type = "success") {
        const container = $("toastContainer");
        if (!container) return;

        const toast = document.createElement("div");
        const icon = document.createElement("span");
        const content = document.createElement("div");
        const heading = document.createElement("strong");
        const description = document.createElement("p");

        toast.className = type === "error" ? "toast toast-error" : "toast";
        toast.dataset.toastId = String(++toastSequence);

        icon.className = "toast-icon";

        const iconElement = document.createElement("i");
        iconElement.className = type === "error"
            ? "fa-solid fa-circle-exclamation"
            : "fa-solid fa-circle-check";

        icon.appendChild(iconElement);

        heading.textContent = title;
        description.textContent = message;

        content.append(heading, description);
        toast.append(icon, content);
        container.appendChild(toast);

        // Keep notifications from accumulating indefinitely.
        while (container.children.length > 4) {
            container.firstElementChild.remove();
        }

        window.setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(12px)";

            window.setTimeout(() => toast.remove(), 250);
        }, 3500);
    }

    // --------------------------------------
    // VALIDATE AND SAVE
    // --------------------------------------

    function validateForm() {
        const profileForm = $("profileForm");

        if (!profileForm.reportValidity()) {
            showToast(
                "Check your details",
                "Please enter a valid name and email address.",
                "error"
            );

            return false;
        }

        if (!controls.fullName.value.trim()) {
            controls.fullName.focus();
            return false;
        }

        return true;
    }

    function saveAllSettings() {
        if (!validateForm()) return;

        const current = getCurrentSettings();

        if (!persistSettings(current)) return;

        savedSettings = { ...current };

        updateProfilePreview();
        refreshDirtyState();

        showToast(
            "Settings saved",
            "Your preferences have been saved in this browser."
        );
    }

    // --------------------------------------
    // INITIALIZE
    // --------------------------------------

    savedSettings = readSavedSettings();
    fillControls(savedSettings);
    refreshDirtyState();

    // --------------------------------------
    // PROFILE EDITING
    // --------------------------------------

    $("editProfileBtn").addEventListener("click", () => {
        controls.fullName.focus();

        controls.fullName.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

        showToast(
            "Edit your profile",
            "Update your information below and select Save changes."
        );
    });

    [
        controls.fullName,
        controls.emailAddress
    ].forEach((element) => {
        element.addEventListener("input", updateProfilePreview);
    });

    // --------------------------------------
    // THEME SELECTION
    // --------------------------------------

    document.querySelectorAll(".theme-choice").forEach((button) => {
        button.addEventListener("click", () => {
            applyTheme(button.dataset.theme);
            refreshDirtyState();

            showToast(
                "Theme updated",
                "Preview your new theme. Save changes to keep it."
            );
        });
    });

    // --------------------------------------
    // ACCENT COLOR SELECTION
    // --------------------------------------

    document.querySelectorAll(".color-choice").forEach((button) => {
        button.addEventListener("click", () => {
            applyAccent(button.dataset.color);
            refreshDirtyState();

            showToast(
                "Accent color changed",
                "Your workspace highlight color has been updated."
            );
        });
    });

    // --------------------------------------
    // GENERAL CONTROL CHANGES
    // --------------------------------------

    Object.values(controls).forEach((element) => {
        if (!element) return;

        const eventName = element.type === "checkbox"
            ? "change"
            : "input";

        element.addEventListener(eventName, () => {
            if (element === controls.compactMode) {
                applyCompactMode(element.checked);
            }

            refreshDirtyState();
        });

        if (element.tagName === "SELECT") {
            element.addEventListener("change", refreshDirtyState);
        }
    });

    // --------------------------------------
    // SAVE BUTTONS
    // --------------------------------------

    $("saveAllBtn").addEventListener("click", saveAllSettings);
    $("bottomSaveBtn").addEventListener("click", saveAllSettings);

    // --------------------------------------
    // DISCARD UNSAVED CHANGES
    // --------------------------------------

    $("discardChangesBtn").addEventListener("click", () => {
        if (
            hasUnsavedChanges() &&
            !window.confirm("Discard your unsaved changes?")
        ) {
            return;
        }

        fillControls(savedSettings);
        refreshDirtyState();

        showToast(
            "Changes discarded",
            "The last saved preferences have been restored."
        );
    });

    // --------------------------------------
    // RESET MODAL
    // --------------------------------------

    const resetModal = $("resetModal");
    const resetSettingsBtn = $("resetSettingsBtn");
    const cancelResetBtn = $("cancelResetBtn");
    const confirmResetBtn = $("confirmResetBtn");

    function openResetModal() {
        resetModal.hidden = false;
        confirmResetBtn.focus();
    }

    function closeResetModal() {
        resetModal.hidden = true;
        resetSettingsBtn.focus();
    }

    resetSettingsBtn.addEventListener("click", () => {
        if (
            !controls.confirmReset.checked &&
            !window.confirm("Reset all saved settings to defaults?")
        ) {
            return;
        }

        openResetModal();
    });

    cancelResetBtn.addEventListener("click", closeResetModal);

    resetModal.addEventListener("click", (event) => {
        if (event.target === resetModal) {
            closeResetModal();
        }
    });

    confirmResetBtn.addEventListener("click", () => {
        const defaults = { ...defaultSettings };

        if (!persistSettings(defaults)) return;

        savedSettings = { ...defaults };
        fillControls(defaults);
        refreshDirtyState();
        closeResetModal();

        showToast(
            "Settings reset",
            "Default preferences have been restored successfully."
        );
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !resetModal.hidden) {
            closeResetModal();
        }
    });

    // --------------------------------------
    // SECURITY GUIDANCE
    // --------------------------------------

    $("changePasswordBtn").addEventListener("click", () => {
        showToast(
            "Password management",
            "Connect a secure backend with authenticated password updates to enable this feature."
        );
    });

    // --------------------------------------
    // HEADER NOTIFICATION BUTTON
    // --------------------------------------

    // --------------------------------------
    // NAVIGATION TO SETTINGS SECTIONS
    // --------------------------------------

    const sectionTabs = document.querySelectorAll(".settings-tab");

    sectionTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const section = $(tab.dataset.target);
            if (!section) return;

            sectionTabs.forEach((item) => {
                item.classList.remove("active");
            });

            tab.classList.add("active");

            section.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    });

    // Highlight the corresponding settings category while scrolling.
    if ("IntersectionObserver" in window) {
        const sectionObserver = new IntersectionObserver((entries) => {
            const visibleSections = entries
                .filter((entry) => entry.isIntersecting)
                .sort((a, b) =>
                    b.intersectionRatio - a.intersectionRatio
                );

            if (!visibleSections.length) return;

            const visibleId = visibleSections[0].target.id;

            sectionTabs.forEach((tab) => {
                tab.classList.toggle(
                    "active",
                    tab.dataset.target === visibleId
                );
            });
        }, {
            rootMargin: "-15% 0px -60% 0px",
            threshold: [0, 0.15, 0.35]
        });

        document.querySelectorAll(".settings-section").forEach((section) => {
            sectionObserver.observe(section);
        });
    }

    // --------------------------------------
    // INITIAL PAGE STATE
    // --------------------------------------

    updateProfilePreview();
    updateSaveIndicator(false);
});
