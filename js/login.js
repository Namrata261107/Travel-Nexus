"use strict";

const db = window.travelNexusSupabase;
const BOOTSTRAP_API = "http://127.0.0.1:8000/api/authority/auth/bootstrap/";
let selectedRole = "traveler";

function element(id) {
    return document.getElementById(id);
}

function showMessage(id, message, isSuccess = false) {
    const target = element(id);
    if (!target) return;

    target.textContent = message;
    target.style.display = message ? "block" : "none";
    target.classList.toggle("success-message", isSuccess && Boolean(message));
    target.classList.toggle("error-message", !isSuccess && Boolean(message));
}

function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
        button.dataset.label = button.textContent.trim();
        button.disabled = true;
        button.textContent = label;
    } else {
        button.disabled = false;
        if (button.dataset.label) {
            button.textContent = button.dataset.label;
            delete button.dataset.label;
        }
    }
}

function updateRole(role) {
    if (!["traveler", "authority"].includes(role)) return;
    selectedRole = role;

    const travelerButton = element("travelerBtn");
    const authorityButton = element("authorityBtn");
    const roleText = element("roleText");
    if (travelerButton) {
        travelerButton.classList.toggle("active", role === "traveler");
        travelerButton.setAttribute("aria-pressed", String(role === "traveler"));
    }
    if (authorityButton) {
        authorityButton.classList.toggle("active", role === "authority");
        authorityButton.setAttribute("aria-pressed", String(role === "authority"));
    }
    if (roleText) {
        roleText.textContent = role === "authority" ? "Authority" : "Traveler";
    }
}

function updateRegistrationRole() {
    const role = document.querySelector('input[name="registerRole"]:checked')?.value;
    const phoneField = element("registerPhoneField");
    const phoneInput = element("registerPhone");
    const traveler = role === "traveler";
    if (phoneField) phoneField.hidden = !traveler;
    if (phoneInput) phoneInput.required = traveler;
}

async function getProfile() {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    const accessToken = data.session?.access_token;
    if (!accessToken) {
        throw new Error("Your session has expired. Please sign in again.");
    }

    const response = await fetch(BOOTSTRAP_API, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
        },
        body: "{}"
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.profile) {
        throw new Error(result.message || `Profile request failed (HTTP ${response.status}).`);
    }
    return result.profile;
}

function redirectForRole(role) {
    if (role === "authority" || role === "admin") {
        window.location.replace("../pages/authority.html");
        return;
    }
    if (role === "traveler") {
        window.location.replace("../Traveller_Module/index.html");
        return;
    }
    throw new Error("This account does not have a valid Travel Nexus role.");
}

async function finishSignIn(expectedRole) {
    const profile = await getProfile();
    const accountRole = profile.role === "admin" ? "authority" : profile.role;

    if (expectedRole && accountRole !== expectedRole) {
        throw new Error(
            `This account is registered as ${accountRole}. Select the matching account type and sign in again.`
        );
    }
    redirectForRole(accountRole);
}

function openModal(id) {
    const modal = element(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    modal.querySelector("input")?.focus();
}

function closeModal(id) {
    const modal = element(id);
    if (!modal) return;
    modal.hidden = true;
    if ([...document.querySelectorAll(".modal")].every(item => item.hidden)) {
        document.body.classList.remove("modal-open");
    }
}

if (!db?.auth) {
    throw new Error("Supabase did not initialize. Check the Supabase script and project configuration.");
}

element("travelerBtn")?.addEventListener("click", () => updateRole("traveler"));
element("authorityBtn")?.addEventListener("click", () => updateRole("authority"));

element("passwordToggle")?.addEventListener("click", () => {
    const password = element("password");
    const toggle = element("passwordToggle");
    if (!password || !toggle) return;

    const visible = password.type === "password";
    password.type = visible ? "text" : "password";
    toggle.textContent = visible ? "Hide" : "Show";
    toggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
});

element("signupBtn")?.addEventListener("click", () => {
    showMessage("registerMessage", "");
    if (element("email") && element("registerEmail")) {
        element("registerEmail").value = element("email").value.trim();
    }
    const roleInput = document.querySelector(
        `input[name="registerRole"][value="${selectedRole}"]`
    );
    if (roleInput) roleInput.checked = true;
    updateRegistrationRole();
    openModal("registerModal");
});

document.querySelectorAll('input[name="registerRole"]').forEach(input => {
    input.addEventListener("change", updateRegistrationRole);
});
updateRegistrationRole();

element("closeRegister")?.addEventListener("click", () => closeModal("registerModal"));
element("backToLogin")?.addEventListener("click", () => closeModal("registerModal"));
element("closeModal")?.addEventListener("click", () => closeModal("forgotModal"));

document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
        if (event.target === modal) closeModal(modal.id);
    });
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        document.querySelectorAll(".modal").forEach(modal => {
            if (!modal.hidden) closeModal(modal.id);
        });
    }
});

element("loginForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    showMessage("message", "");

    const email = element("email")?.value.trim() || "";
    const password = element("password")?.value || "";
    const button = element("loginBtn");
    if (!email || !password) {
        showMessage("message", "Enter your email address and password.");
        return;
    }

    setBusy(button, true, "Signing in...");
    try {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await finishSignIn(selectedRole);
    } catch (error) {
        console.error("Travel Nexus sign-in failed:", error);
        showMessage("message", error.message || "Unable to sign in. Please try again.");
    } finally {
        setBusy(button, false);
    }
});

element("registerForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    showMessage("registerMessage", "");

    const fullName = element("registerName")?.value.trim() || "";
    const email = element("registerEmail")?.value.trim() || "";
    const phone = element("registerPhone")?.value.trim() || "";
    const password = element("registerPassword")?.value || "";
    const confirmation = element("confirmPassword")?.value || "";
    const role = document.querySelector('input[name="registerRole"]:checked')?.value;
    const button = element("registerBtn");

    if (!fullName || !email || !password || !confirmation) {
        showMessage("registerMessage", "Complete all required fields.");
        return;
    }
    if (role === "traveler" && !phone) {
        showMessage("registerMessage", "Enter a mobile number to receive geofence SMS alerts.");
        return;
    }
    if (role === "traveler" && !/^[+0-9() .-]{8,20}$/.test(phone)) {
        showMessage("registerMessage", "Enter a valid mobile number.");
        return;
    }
    if (password.length < 8) {
        showMessage("registerMessage", "Your password must contain at least 8 characters.");
        return;
    }
    if (password !== confirmation) {
        showMessage("registerMessage", "Your passwords do not match.");
        return;
    }
    if (!["traveler", "authority"].includes(role)) {
        showMessage("registerMessage", "Select Traveler or Authority.");
        return;
    }
    if (!element("acceptTerms")?.checked) {
        showMessage("registerMessage", "Please accept the terms and privacy policy.");
        return;
    }

    setBusy(button, true, "Creating account...");
    try {
        const { data, error } = await db.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName, requested_role: role, phone: role === "traveler" ? phone : "" },
                emailRedirectTo: new URL("login.html", window.location.href).href
            }
        });
        if (error) throw error;
        if (!data.user) throw new Error("Supabase did not return a user.");
        if (!data.session) {
            showMessage(
                "registerMessage",
                "Your account was created, but Supabase is requiring email confirmation. To allow immediate sign-in, the project owner must turn off Confirm email in Supabase Dashboard → Authentication → Sign In / Providers → Email. The app cannot safely change that project setting."
            );
            return;
        }

        await finishSignIn(role);
    } catch (error) {
        console.error("Travel Nexus registration failed:", error);
        showMessage("registerMessage", error.message || "Unable to create your account.");
    } finally {
        setBusy(button, false);
    }
});

element("resetForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    showMessage("resetMessage", "");
    const email = element("resetEmail")?.value.trim() || "";
    const button = element("resetBtn");
    if (!email) {
        showMessage("resetMessage", "Enter your registered email address.");
        return;
    }

    setBusy(button, true, "Sending reset link...");
    try {
        const { error } = await db.auth.resetPasswordForEmail(email, {
            redirectTo: new URL("login.html", window.location.href).href
        });
        if (error) throw error;
        showMessage("resetMessage", "If the address is registered, a password reset link has been sent.", true);
    } catch (error) {
        console.error("Password reset request failed:", error);
        showMessage("resetMessage", error.message || "Could not send the reset link.");
    } finally {
        setBusy(button, false);
    }
});

db.auth.getSession().then(({ data, error }) => {
    if (error) {
        console.error("Could not restore the sign-in session:", error);
        return;
    }
    if (data.session) {
        finishSignIn().catch(error => {
            console.error("Could not route the existing session:", error);
            showMessage("message", error.message || "Could not load your account.");
        });
    }
});
