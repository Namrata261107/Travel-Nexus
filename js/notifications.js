(() => {
  "use strict";

  const API_URL = window.TRAVEL_NEXUS_API_ORIGIN + "/api/authority/alerts/";
  let loading = false;

  function initializeNotifications() {
    let button = document.getElementById("notificationButton") ||
      document.getElementById("notificationBtn");
    if (!button || document.getElementById("notificationItems")) return;

    const anchor = document.createElement("div");
    anchor.className = "notification-anchor";
    button.parentNode.insertBefore(anchor, button);
    anchor.appendChild(button);
    button.id = "notificationButton";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "notificationPanel");

    let badge = button.querySelector(".notification-count");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "notification-count";
      button.appendChild(badge);
    }
    badge.textContent = "0";
    badge.hidden = true;

    const panel = document.createElement("section");
    panel.className = "notification-panel";
    panel.id = "notificationPanel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="notification-panel-heading">
        <strong>Recent notifications</strong>
        <button type="button" class="notification-mark-read">Mark read</button>
      </div>
      <div class="notification-items" id="notificationItems" aria-live="polite">
        <p class="notification-empty">Loading recent notifications…</p>
      </div>`;
    anchor.appendChild(panel);

    button.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) loadNotifications();
    });
    panel.querySelector(".notification-mark-read").addEventListener("click", () => {
      badge.hidden = true;
      badge.textContent = "0";
    });
    document.addEventListener("click", event => {
      if (!anchor.contains(event.target)) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });

    loadNotifications();
    window.setInterval(loadNotifications, 2500);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") loadNotifications();
    });
  }

  async function loadNotifications() {
    if (loading) return;
    loading = true;
    try {
      const response = await fetch(API_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (!result.success || !Array.isArray(result.data)) throw new Error("Invalid alerts response");

      const alerts = result.data;
      const unresolved = alerts.filter(item =>
        !["resolved", "closed"].includes(String(item.status || "").toLowerCase())
      ).length;
      const badge = document.querySelector("#notificationButton .notification-count");
      if (badge) {
        badge.textContent = unresolved > 99 ? "99+" : String(unresolved);
        badge.hidden = unresolved === 0;
      }

      const container = document.getElementById("notificationItems");
      if (!container) return;
      container.replaceChildren();
      if (!alerts.length) {
        const empty = document.createElement("p");
        empty.className = "notification-empty";
        empty.textContent = "No recent notifications.";
        container.appendChild(empty);
        return;
      }

      alerts.slice(0, 5).forEach(item => {
        const link = document.createElement("a");
        link.className = "notification-row";
        link.href = "alerts.html";
        const title = document.createElement("strong");
        title.textContent = item.title || item.alert_type || "Emergency alert";
        const detail = document.createElement("span");
        detail.textContent = item.description || item.traveler_name || "View alert details";
        const time = document.createElement("small");
        const date = new Date(item.created_at);
        time.textContent = Number.isNaN(date.getTime())
          ? "Recent"
          : date.toLocaleString("en-IN");
        link.append(title, detail, time);
        container.appendChild(link);
      });
    } catch (error) {
      console.error("Notifications could not be refreshed:", error);
    } finally {
      loading = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeNotifications, { once: true });
  } else {
    initializeNotifications();
  }
})();
