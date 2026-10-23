"use strict";

const authClient = window.travelNexusSupabase;
const authApi = window.TRAVEL_NEXUS_API_ORIGIN + "/api/authority/auth/bootstrap/";
const currentScriptUrl = document.currentScript?.src || window.location.href;
const workspaceRoot = new URL("../", currentScriptUrl);

function authPage(role) {
    if (role === "authority" || role === "admin") {
        return new URL("pages/authority.html", workspaceRoot).href;
    }
    if (role === "traveler") {
        return new URL("Traveller_Module/index.html", workspaceRoot).href;
    }
    return new URL("pages/login.html", workspaceRoot).href;
}

function updateAccountName(profile) {
    const displayName = profile.full_name || profile.email || "Travel Nexus user";
    const travelerName = document.getElementById("travelerDisplayName");
    if (travelerName) travelerName.textContent = displayName;
    const headerTravelerName = document.getElementById("headerUserName");
    if (headerTravelerName) headerTravelerName.textContent = displayName;
    const headerTravelerAvatar = document.getElementById("headerUserAvatar");
    if (headerTravelerAvatar) {
        headerTravelerAvatar.textContent = displayName.trim().charAt(0).toUpperCase() || "T";
    }
    const geofenceName = document.getElementById("travelerName");
    if (geofenceName) geofenceName.textContent = displayName;
    const travelerId = document.getElementById("travelerId");
    if (travelerId) travelerId.textContent = profile.traveler_id || "—";

    const authorityName = document.getElementById("authorityDisplayName");
    if (authorityName) authorityName.textContent = displayName;

    const welcome = document.getElementById("travelerWelcome");
    if (welcome) welcome.textContent = `Welcome, ${displayName}. Your travel safety at a glance.`;

    const initials = displayName.trim().split(/\s+/).slice(0, 2)
        .map(part => part.charAt(0)).join("").toUpperCase();
    const travelerAvatar = document.getElementById("travelerAvatar");
    if (travelerAvatar) travelerAvatar.textContent = initials || "T";
}

window.travelNexusAuthReady = (async function authenticateDashboard() {
    if (!authClient?.auth) {
        console.error("Supabase is not initialized; dashboard access cannot be verified.");
        window.location.replace(authPage());
        return false;
    }

    try {
        const { data, error } = await authClient.auth.getSession();
        if (error) throw error;
        const session = data.session;
        if (!session?.access_token) {
            window.location.replace(authPage());
            return false;
        }

        const response = await fetch(authApi, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`
            },
            body: "{}"
        });
        const result = await response.json();
        if (!response.ok || !result.success || !result.profile) {
            if (response.status === 401) {
                await authClient.auth.signOut();
                window.location.replace(authPage());
                return false;
            }
            throw new Error(result.message || `Account verification failed (HTTP ${response.status}).`);
        }

        const profile = result.profile;
        const requiredRole = document.body.dataset.requiredRole;
        const actualRole = profile.role === "admin" ? "authority" : profile.role;
        if (requiredRole && actualRole !== requiredRole) {
            window.location.replace(authPage(actualRole));
            return false;
        }

        window.travelNexusAuth = {
            user: session.user,
            profile,
            async getAccessToken() {
                const { data: current, error: sessionError } = await authClient.auth.getSession();
                if (sessionError) throw sessionError;
                if (!current.session?.access_token) {
                    throw new Error("Your sign-in has expired. Please sign in again.");
                }
                return current.session.access_token;
            }
        };
        window.travelNexusAccountProfile = profile;
        window.travelNexusProfileId = profile.traveler_profile_id;
        updateAccountName(profile);
        return true;
    } catch (error) {
        console.error("Dashboard account verification failed:", error);
        const message = document.createElement("main");
        message.className = "auth-error";
        const heading = document.createElement("h1");
        heading.textContent = "Unable to verify your account";
        const details = document.createElement("p");
        details.textContent = String(
            error.message || "Please check the connection and try again."
        );
        const link = document.createElement("a");
        link.href = authPage();
        link.textContent = "Return to sign in";
        message.append(heading, details, link);
        document.body.replaceChildren(message);
        return false;
    }
})();

if (document.body.dataset.requiredRole === "traveler") {
    document.getElementById("signOutButton")?.addEventListener("click", async () => {
        try {
            const { error } = await authClient.auth.signOut();
            if (error) throw error;
            window.location.replace(authPage());
        } catch (error) {
            console.error("Sign-out failed:", error);
            window.alert(error.message || "Unable to sign out. Please try again.");
        }
    });
}
