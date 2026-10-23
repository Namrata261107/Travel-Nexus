
const travelNexusModules = [
    "dashboard",
    "geofence",
    "lost-found",
    "ai-assistant",
    "alerts",
    "person-reports",
    "profile"
];

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");

        script.src = src;
        script.onload = resolve;

        script.onerror = () => {
            reject(new Error(`Failed to load script: ${src}`));
        };

        document.body.appendChild(script);
    });
}

async function initializeTravelNexus() {
    const host = document.getElementById("moduleHost");

    if (!host) {
        console.error("moduleHost element is missing.");
        return;
    }

    try {
        // Step 1: Load all module HTML files.
        const responses = await Promise.all(
            travelNexusModules.map(async (moduleName) => {
                const response = await fetch(
                    `modules/${moduleName}.html${
                    moduleName === "dashboard"
                        ? "?v=traveler-location-consent-1"
                        : moduleName === "profile"
                            ? "?v=registration-profile-1"
                            : moduleName === "alerts"
                                ? "?v=account-alerts-1"
                                : moduleName === "lost-found"
                                    ? "?v=shared-reports-3"
                                : moduleName === "person-reports"
                                    ? "?v=person-reports-2"
                                : ""
                    }`
                );

                if (!response.ok) {
                    throw new Error(
                        `Could not load modules/${moduleName}.html`
                    );
                }

                return response.text();
            })
        );

        // Step 2: Insert all module HTML into the page.
        host.innerHTML = responses.join("\n");

        console.log("Travel Nexus modules inserted successfully.");

        // Step 3: Load the Alerts JavaScript.
        await loadScript("js/modules/alerts.js?v=account-alerts-1");

        // Use the same authenticated, shared Lost & Found reports as authority.
        await loadScript("../js/lostfound.js?v=shared-reports-3");

        // Step 4: Load the shared application JavaScript.
        await loadScript("js/app.js?v=auth-location-1");

        // Step 5: Load consent-based traveler location sharing.
        await loadScript("js/location-sharing.js?v=auth-location-1");

        // Step 6: Load the AI Assistant JavaScript.
        await loadScript("js/modules/ai-assistant.js");

        // Load read-only authority person reports.
        await loadScript("js/modules/person-reports.js?v=person-reports-2");

        // Step 7: Notify scripts that all modules are ready.
        document.dispatchEvent(
            new CustomEvent("travelnexus:ready")
        );

        console.log("Travel Nexus initialized successfully.");

    } catch (error) {
        console.error("Travel Nexus initialization failed:", error);

        host.innerHTML = `
            <div class="content-card">
                <h2>Unable to load Travel Nexus</h2>
                <p>${error.message}</p>
                <p>
                    Check your file names and folder structure.
                    Then open the browser console for more details.
                </p>
            </div>
        `;
    }
}

// Standalone Traveller_Module pages do not install an auth gate. In that
// case, continue loading modules; if an auth layer is present, honor it.
Promise.resolve(window.travelNexusAuthReady ?? true)
    .then(authenticated => {
        if (authenticated) return initializeTravelNexus();
        return undefined;
    })
    .catch(error => {
        console.error("Traveler authentication did not complete.", error);
    });
