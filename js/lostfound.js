
function initializeLostFoundModule() {
  const $ = (selector) => document.querySelector(selector);

  const itemsGrid = $("#itemsGrid");
  const emptyState = $("#emptyState");
  const searchInput = $("#searchInput");
  const typeFilter = $("#typeFilter");
  const statusFilter = $("#statusFilter");
  const categoryChips = $("#categoryChips");
  const itemModal = $("#itemModal");
  const detailsModal = $("#detailsModal");
  const itemForm = $("#itemForm");

  // =======================================================
  // AUTHENTICATED DATABASE API
  // =======================================================

  const REPORTS_API = "http://127.0.0.1:8000/api/authority/lost-found/reports/";
  let items = [];
  let selectedCategory = "all";
  let editingId = null;
  let lastFocusedElement = null;
  let isLoading = false;
  let hasLoadedReports = false;

  const categoryIcons = {
    Electronics: "fa-mobile-screen-button",
    Bags: "fa-bag-shopping",
    Documents: "fa-file-lines",
    Accessories: "fa-glasses",
    Clothing: "fa-shirt",
    Other: "fa-box"
  };

  const categoryClasses = {
    Electronics: "category-electronics",
    Bags: "category-bags",
    Documents: "category-documents",
    Accessories: "category-accessories",
    Clothing: "category-clothing",
    Other: "category-other"
  };

  // =======================================================
  // GENERAL HELPERS
  // =======================================================

  function getLocalDate() {
    const date = new Date();

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

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

  function formatDate(dateString) {
    if (!dateString) return "Not specified";

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return String(dateString);
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function getStatusClass(status) {
    return String(status || "Open")
      .toLowerCase()
      .replace(/\s+/g, "-");
  }

  function normalizeType(value) {
    return String(value || "lost").toLowerCase() === "found"
      ? "Found"
      : "Lost";
  }

  function normalizeStatus(value) {
    const status = String(value || "pending")
      .trim()
      .toLowerCase()
      .replace(/_/g, " ");

    if (
      ["resolved", "returned", "closed"].includes(status)
    ) {
      return "Resolved";
    }

    if (
      [
        "in progress",
        "processing",
        "under review",
        "matched"
      ].includes(status)
    ) {
      return "In Progress";
    }

    return "Open";
  }

  function statusToDatabase(value) {
    const status = String(value || "Open").toLowerCase();

    if (status === "resolved") return "resolved";

    if (status === "in progress") return "matched";

    return "pending";
  }

  function normalizeCategory(value) {
    const category = String(value || "Other")
      .trim()
      .toLowerCase();

    if (
      category.includes("electronic") ||
      category.includes("mobile") ||
      category.includes("charger") ||
      category.includes("earbud")
    ) {
      return "Electronics";
    }

    if (category.includes("document")) return "Documents";

    if (
      category.includes("bag") ||
      category.includes("luggage") ||
      category.includes("backpack")
    ) {
      return "Bags";
    }

    if (category.includes("accessor")) return "Accessories";

    if (category.includes("cloth")) return "Clothing";

    if (
      category.includes("wallet") ||
      category.includes("money")
    ) {
      return "Other";
    }

    return Object.keys(categoryIcons).find(
      (key) => key.toLowerCase() === category
    ) || "Other";
  }

  function showToast(message, type = "success") {
    const container = $("#toastContainer");

    if (!container) {
      console.log(message);
      return;
    }

    const toast = document.createElement("div");

    toast.className =
      `toast ${type === "error" ? "error" : ""}`;

    const icon = type === "error"
      ? "fa-circle-exclamation"
      : "fa-circle-check";

    const heading = type === "error"
      ? "Something went wrong"
      : "Success";

    toast.innerHTML = `
      <div class="toast-icon">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div class="toast-content">
        <strong>${heading}</strong>
        <p>${escapeHTML(message)}</p>
      </div>
    `;

    container.appendChild(toast);

    window.setTimeout(() => toast.remove(), 3500);
  }

  function showDatabaseError(error, action = "database operation") {
    console.error(`Lost & Found ${action} failed:`, error);

    let message = error?.message ||
      "An unexpected error occurred.";

    showToast(message, "error");
  }

  // =======================================================
  // AUTHENTICATED BACKEND API
  // =======================================================

  async function reportsRequest(path = "", options = {}) {
    const auth = window.travelNexusAuth;
    if (!auth) throw new Error("Sign in to use Lost & Found.");
    const token = await auth.getAccessToken();
    const response = await fetch(`${REPORTS_API}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || `Lost & Found request failed (HTTP ${response.status}).`);
    }
    return result;
  }

  const lostFoundChannel = typeof BroadcastChannel === "function"
    ? new BroadcastChannel("travel-nexus-lost-found")
    : null;
  lostFoundChannel?.addEventListener("message", (event) => {
    if (event.data?.type === "reports-changed") loadReportsFromDatabase();
  });
  function notifyReportsChanged() {
    lostFoundChannel?.postMessage({ type: "reports-changed" });
  }

  // =======================================================
  // DATABASE RECORD TO UI ITEM
  // =======================================================

  function databaseToItem(report) {
    return {
      dbId: report.id,

      id: report.report_code || String(report.id || ""),

      name: report.item_name || "Unnamed item",

      type: normalizeType(report.report_type),

      category: normalizeCategory(report.item_type),

      location:
        report.location_description || "Not specified",

      reporter:
        report.reporter_name ||
        report.full_name ||
        (report.traveler_id
          ? "Registered Traveller"
          : "Traveller"),

      date: report.report_date || (report.created_at
        ? String(report.created_at).slice(0, 10)
        : getLocalDate()),

      reportedBy: report.reported_by || null,

      status: normalizeStatus(report.status),

      reference: report.reporter_contact || "",

      description: report.description || "",

      latitude: report.latitude ?? null,

      longitude: report.longitude ?? null
    };
  }

  // =======================================================
  // LOAD SHARED REPORTS FROM THE AUTHENTICATED API
  // =======================================================

  async function loadReportsFromDatabase(showMessage = false) {
    if (!window.travelNexusAuth || isLoading) return;

    isLoading = true;

    if (itemsGrid && !hasLoadedReports) {
      itemsGrid.hidden = false;
      itemsGrid.innerHTML = "<p>Loading reports...</p>";
    }

    try {
      const result = await reportsRequest();
      const databaseReports = result.data || [];

      items = databaseReports.map(databaseToItem);
      hasLoadedReports = true;

      renderItems();

      console.info(
        `Loaded ${items.length} Lost & Found report(s).`
      );

      if (showMessage) {
        showToast(
          `${items.length} report(s) loaded from the database.`
        );
      }
    } catch (error) {
      showDatabaseError(error, "loading");

      if (!hasLoadedReports && itemsGrid) {
        itemsGrid.innerHTML = "";
        itemsGrid.hidden = true;
      }

      if (!hasLoadedReports && emptyState) {
        emptyState.hidden = false;

        const heading = emptyState.querySelector("h2, h3");
        const description = emptyState.querySelector("p");

        if (heading) {
          heading.textContent = "Unable to load reports";
        }

        if (description) {
          description.textContent =
            "Check the database connection and permissions, then refresh the page.";
        }
      }

      updateStatistics();
    } finally {
      isLoading = false;
    }
  }

  // =======================================================
  // FILTERING
  // =======================================================

  function getFilteredItems() {
    const searchTerm =
      (searchInput?.value || "").trim().toLowerCase();

    const selectedType =
      (typeFilter?.value || "all").toLowerCase();

    const selectedStatus =
      (statusFilter?.value || "all").toLowerCase();

    return items.filter((item) => {
      const searchableText = [
        item.id,
        item.name,
        item.type,
        item.category,
        item.location,
        item.reporter,
        item.status,
        item.reference,
        item.description
      ].join(" ").toLowerCase();

      const matchesSearch =
        !searchTerm || searchableText.includes(searchTerm);

      const matchesType =
        selectedType === "all" ||
        item.type.toLowerCase() === selectedType;

      const matchesStatus =
        selectedStatus === "all" ||
        item.status.toLowerCase() ===
          selectedStatus.replace(/_/g, " ");

      const matchesCategory =
        selectedCategory === "all" ||
        item.category === selectedCategory;

      return (
        matchesSearch &&
        matchesType &&
        matchesStatus &&
        matchesCategory
      );
    });
  }

  // =======================================================
  // STATISTICS
  // =======================================================

  function updateStatistics() {
    if ($("#totalReports")) {
      $("#totalReports").textContent = items.length;
    }

    if ($("#lostCount")) {
      $("#lostCount").textContent =
        items.filter((item) => item.type === "Lost").length;
    }

    if ($("#foundCount")) {
      $("#foundCount").textContent =
        items.filter((item) => item.type === "Found").length;
    }

    if ($("#resolvedCount")) {
      $("#resolvedCount").textContent =
        items.filter((item) => item.status === "Resolved").length;
    }
  }

  // =======================================================
  // RENDER REPORT CARDS
  // =======================================================

  function renderItems() {
    if (!itemsGrid) {
      console.error('Missing HTML element: "#itemsGrid".');
      return;
    }

    const filteredItems = getFilteredItems();

    updateStatistics();

    const resultsText = $("#resultsText");

    if (resultsText) {
      resultsText.textContent =
        `Showing ${filteredItems.length} of ${items.length} items`;
    }

    if (emptyState) {
      emptyState.hidden = filteredItems.length !== 0;
    }

    itemsGrid.hidden = filteredItems.length === 0;

    if (filteredItems.length === 0) {
      itemsGrid.innerHTML = "";
      return;
    }

    const profile = window.travelNexusAuth?.profile;
    const canManageAll = ["authority", "admin"].includes(profile?.role);
    itemsGrid.innerHTML = filteredItems.map((item, index) => {
      const category = categoryIcons[item.category]
        ? item.category
        : "Other";

      const icon = categoryIcons[category];
      const iconClass = categoryClasses[category];
      const statusClass = getStatusClass(item.status);
      const typeClass = item.type.toLowerCase();

      const canManage = canManageAll || item.reportedBy === profile?.id;
      return `
        <article class="item-card"
                 style="animation-delay:${index * 35}ms">

          <div class="item-card-top">
            <div class="item-category-icon ${iconClass}">
              <i class="fa-solid ${icon}"></i>
            </div>

            <span class="type-badge ${typeClass}">
              <i class="fa-solid ${
                item.type === "Lost"
                  ? "fa-magnifying-glass"
                  : "fa-box-open"
              }"></i>
              ${escapeHTML(item.type)}
            </span>
          </div>

          <h3>${escapeHTML(item.name)}</h3>

          <p class="item-description">
            ${escapeHTML(
              item.description ||
              "No additional description provided."
            )}
          </p>

          <div class="item-meta">
            <div class="meta-row">
              <i class="fa-solid fa-location-dot"></i>
              <span>${escapeHTML(item.location)}</span>
            </div>

            <div class="meta-row">
              <i class="fa-regular fa-calendar"></i>
              <span>${escapeHTML(formatDate(item.date))}</span>
            </div>

            <div class="meta-row">
              <i class="fa-regular fa-user"></i>
              <span>${escapeHTML(item.reporter)}</span>
            </div>

            <div class="meta-row">
              <i class="fa-solid fa-tag"></i>
              <span>${escapeHTML(item.category)}</span>
            </div>
          </div>

          <div class="item-card-footer">
            <div>
              <div class="report-id">${escapeHTML(item.id)}</div>

              <span class="status-badge ${statusClass}">
                ${escapeHTML(item.status)}
              </span>
            </div>

            <div class="card-actions">
              <button class="card-action"
                      type="button"
                      data-action="details"
                      data-id="${escapeHTML(item.id)}"
                      title="View details">
                <i class="fa-regular fa-eye"></i>
              </button>

              ${canManage ? `<button class="card-action"
                      type="button"
                      data-action="edit"
                      data-id="${escapeHTML(item.id)}"
                      title="Edit item">
                <i class="fa-solid fa-pen"></i>
              </button>` : ""}

              ${canManage ? `<button class="card-action"
                      type="button"
                      data-action="status"
                      data-id="${escapeHTML(item.id)}"
                      title="Change status">
                <i class="fa-solid fa-arrow-rotate-right"></i>
              </button>` : ""}

              ${canManage ? `<button class="card-action danger"
                      type="button"
                      data-action="delete"
                      data-id="${escapeHTML(item.id)}"
                      title="Delete item">
                <i class="fa-regular fa-trash-can"></i>
              </button>` : ""}
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  // =======================================================
  // MODALS
  // =======================================================

  function openModal(modal) {
    if (!modal) return;

    lastFocusedElement = document.activeElement;

    modal.hidden = false;
    document.body.style.overflow = "hidden";

    const focusable = modal.querySelector(
      "input:not([type=hidden]), select, textarea, button"
    );

    if (focusable) {
      window.setTimeout(() => focusable.focus(), 50);
    }
  }

  function closeModal(modal) {
    if (!modal) return;

    modal.hidden = true;

    const anotherModalOpen =
      (itemModal && !itemModal.hidden) ||
      (detailsModal && !detailsModal.hidden);

    if (!anotherModalOpen) {
      document.body.style.overflow = "";
    }

    if (lastFocusedElement?.focus) {
      lastFocusedElement.focus();
    }
  }

  function openAddModal() {
    if (!itemModal || !itemForm) return;

    editingId = null;
    itemForm.reset();

    if ($("#editItemId")) $("#editItemId").value = "";

    if ($("#modalTitle")) {
      $("#modalTitle").textContent = "Report an Item";
    }

    if ($("#saveItemButton")) {
      $("#saveItemButton").innerHTML =
        '<i class="fa-solid fa-check"></i> Save Report';
    }

    if ($("#reportDate")) {
      $("#reportDate").value = getLocalDate();
    }
    const name = window.travelNexusAuth?.profile?.full_name || "";
    if ($("#reporterName")) $("#reporterName").value = name;

    if ($("#itemStatus")) $("#itemStatus").value = "Open";
    if ($("#itemType")) $("#itemType").value = "Lost";

    openModal(itemModal);
  }

  function openEditModal(item) {
    if (!itemForm || !itemModal) return;

    editingId = item.id;

    const setValue = (selector, value) => {
      const element = $(selector);
      if (element) element.value = value ?? "";
    };

    setValue("#editItemId", item.id);

    if ($("#modalTitle")) {
      $("#modalTitle").textContent = "Edit Item Report";
    }

    if ($("#saveItemButton")) {
      $("#saveItemButton").innerHTML =
        '<i class="fa-solid fa-check"></i> Update Report';
    }

    setValue("#itemName", item.name);
    setValue("#itemType", item.type);
    setValue("#itemCategory", item.category);
    setValue("#itemLocation", item.location);
    setValue("#reporterName", item.reporter);
    setValue("#reportDate", item.date || getLocalDate());
    setValue("#itemStatus", item.status);
    setValue("#itemReference", item.reference);
    setValue("#itemDescription", item.description);

    openModal(itemModal);
  }

  function showDetails(item) {
    if (!detailsModal) return;

    if ($("#detailsTitle")) {
      $("#detailsTitle").textContent = item.name;
    }

    const detailsContent = $("#detailsContent");

    if (!detailsContent) return;

    const fields = [
      ["Report ID", item.id],
      ["Item type", item.type],
      ["Category", item.category],
      ["Status", item.status],
      ["Location", item.location],
      ["Report date", formatDate(item.date)],
      ["Reported by", item.reporter],
      ["Reference / image", item.reference || "Not provided"],
      ["Description", item.description || "No description provided."]
    ];

    detailsContent.innerHTML = fields.map(([label, value]) => {
      const full =
        label === "Description" || label === "Location";

      return `
        <div class="detail-cell ${full ? "full" : ""}">
          <span class="detail-label">${escapeHTML(label)}</span>
          <div class="detail-value">${escapeHTML(value)}</div>
        </div>
      `;
    }).join("");

    openModal(detailsModal);
  }

  // =======================================================
  // FORM DATA TO DATABASE PAYLOAD
  // =======================================================

  function formToDatabasePayload(formData, existingItem = null) {
    return {
      item_name: formData.name,
      item_type: formData.category,
      description: formData.description || null,
      location_description: formData.location,
      report_type: formData.type.toLowerCase(),
      report_date: formData.date,
      reporter_contact: formData.reference || null
    };
  }

  // =======================================================
  // CREATE / UPDATE REPORT
  // =======================================================

  if (itemForm) {
    itemForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!itemForm.reportValidity()) return;

      if (!window.travelNexusAuth) {
        showToast("Sign in again to submit a report.", "error");
        return;
      }

      const saveButton = $("#saveItemButton");
      const originalButtonHTML = saveButton?.innerHTML || "Save";

      const value = (selector) => $(selector)?.value?.trim() || "";

      const formData = {
        name: value("#itemName"),
        type: value("#itemType"),
        category: value("#itemCategory"),
        location: value("#itemLocation"),
        reporter: value("#reporterName"),
        date: value("#reportDate"),
        status: value("#itemStatus") || "Open",
        reference: value("#itemReference"),
        description: value("#itemDescription")
      };

      if (
        !formData.name ||
        !formData.location ||
        !formData.type ||
        !formData.category
      ) {
        showToast("Please complete the required fields.", "error");
        return;
      }

      if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
      }

      const wasEditing = Boolean(editingId);

      try {
        const editingItem = editingId
          ? items.find((item) => item.id === editingId)
          : null;

        if (editingId && !editingItem) {
          throw new Error("The report could not be found.");
        }

        if (editingId && !editingItem.dbId) {
          throw new Error(
            "This report has no database ID and cannot be updated."
          );
        }

        const payload = formToDatabasePayload(
          formData,
          editingItem
        );

        if (editingItem) {
          await reportsRequest(`${encodeURIComponent(editingItem.dbId)}/`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          });

          showToast("Report updated in the database.");
        } else {
          await reportsRequest("", {
            method: "POST",
            body: JSON.stringify(payload)
          });

          showToast("Report saved to the database.");
        }

        notifyReportsChanged();
        closeModal(itemModal);
        itemForm.reset();
        editingId = null;

        await loadReportsFromDatabase();
      } catch (error) {
        showDatabaseError(error, wasEditing ? "update" : "create");
      } finally {
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.innerHTML = originalButtonHTML;
        }
      }
    });
  }

  // =======================================================
  // CARD ACTIONS
  // =======================================================

  if (itemsGrid) {
    itemsGrid.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");

      if (!button) return;

      const { action, id } = button.dataset;
      const item = items.find((entry) => entry.id === id);

      if (!item) {
        showToast("This report could not be found.", "error");
        return;
      }

      if (action === "details") {
        showDetails(item);
        return;
      }

      if (action === "edit") {
        openEditModal(item);
        return;
      }

      if (!window.travelNexusAuth || !item.dbId) {
        showToast("Database connection or report ID is missing.", "error");
        return;
      }

      if (action === "status") {
        const statuses = ["Open", "In Progress", "Resolved"];
        const currentIndex = statuses.indexOf(item.status);
        const nextStatus =
          statuses[(currentIndex + 1) % statuses.length];

        button.disabled = true;

        try {
          await reportsRequest(`${encodeURIComponent(item.dbId)}/`, {
            method: "PATCH",
            body: JSON.stringify({ status: statusToDatabase(nextStatus) })
          });

          notifyReportsChanged();
          await loadReportsFromDatabase();

          showToast(`Status changed to ${nextStatus}.`);
        } catch (error) {
          showDatabaseError(error, "status update");
        } finally {
          button.disabled = false;
        }

        return;
      }

      if (action === "delete") {
        const confirmed = window.confirm(
          `Delete "${item.name}" (${item.id}) from the database? This cannot be undone.`
        );

        if (!confirmed) return;

        button.disabled = true;

        try {
          await reportsRequest(`${encodeURIComponent(item.dbId)}/`, { method: "DELETE" });

          notifyReportsChanged();
          await loadReportsFromDatabase();

          showToast("Report deleted from the database.");
        } catch (error) {
          showDatabaseError(error, "deletion");
        } finally {
          button.disabled = false;
        }
      }
    });
  }

  // =======================================================
  // SEARCH AND FILTERS
  // =======================================================

  searchInput?.addEventListener("input", renderItems);
  typeFilter?.addEventListener("change", renderItems);
  statusFilter?.addEventListener("change", renderItems);

  if (categoryChips) {
    categoryChips.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-category]");

      if (!button) return;

      selectedCategory = button.dataset.category || "all";

      categoryChips.querySelectorAll(".category-chip").forEach((chip) => {
        chip.classList.toggle("active", chip === button);
      });

      renderItems();
    });
  }

  function resetFilters() {
    if (searchInput) searchInput.value = "";
    if (typeFilter) typeFilter.value = "all";
    if (statusFilter) statusFilter.value = "all";

    selectedCategory = "all";

    categoryChips?.querySelectorAll(".category-chip").forEach((chip) => {
      chip.classList.toggle(
        "active",
        chip.dataset.category === "all"
      );
    });

    renderItems();
  }

  $("#resetFiltersButton")?.addEventListener("click", resetFilters);

  // =======================================================
  // ADD REPORT BUTTONS
  // =======================================================

  $("#addItemButton")?.addEventListener("click", openAddModal);
  $("#emptyAddButton")?.addEventListener("click", openAddModal);

  // =======================================================
  // CLOSE MODALS
  // =======================================================

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      const modal = button.closest(".modal-backdrop");

      if (modal) closeModal(modal);
    });
  });

  [itemModal, detailsModal].filter(Boolean).forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (detailsModal && !detailsModal.hidden) {
        closeModal(detailsModal);
      } else if (itemModal && !itemModal.hidden) {
        closeModal(itemModal);
      }
    }

    if (
      event.key === "/" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement?.tagName
      )
    ) {
      event.preventDefault();
      searchInput?.focus();
    }
  });

  // =======================================================
  // EXPORT REPORTS AS CSV
  // =======================================================

  $("#exportButton")?.addEventListener("click", () => {
    if (items.length === 0) {
      showToast("There are no items to export.", "error");
      return;
    }

    const columns = [
      ["Report ID", "id"],
      ["Item Name", "name"],
      ["Type", "type"],
      ["Category", "category"],
      ["Location", "location"],
      ["Reporter", "reporter"],
      ["Report Date", "date"],
      ["Status", "status"],
      ["Reference", "reference"],
      ["Description", "description"]
    ];

    function csvCell(value) {
      let text = String(value ?? "");

      // Reduce the risk of CSV formula injection.
      if (/^[\s]*[=+\-@]/.test(text)) {
        text = "'" + text;
      }

      return `"${text.replace(/"/g, '""')}"`;
    }

    const csvRows = [
      columns.map(([heading]) => csvCell(heading)).join(","),
      ...items.map((item) =>
        columns.map(([, key]) => csvCell(item[key])).join(",")
      )
    ];

    const blob = new Blob(
      ["\uFEFF" + csvRows.join("\r\n")],
      { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      `travel-nexus-lost-found-${getLocalDate()}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showToast("CSV file exported successfully.");
  });

  // =======================================================
  // NOTIFICATION BUTTON
  // =======================================================

  // =======================================================
  // INITIALIZE AND LOAD REPORTS
  // =======================================================

  if (!window.__travelNexusLostFoundPolling) {
    window.__travelNexusLostFoundPolling = window.setInterval(() => {
      if (window.travelNexusAuth && document.getElementById("itemsGrid")) {
        loadReportsFromDatabase();
      }
    }, 5000);
  }
  window.addEventListener("focus", () => loadReportsFromDatabase());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadReportsFromDatabase();
  });
  loadReportsFromDatabase();
}

Promise.resolve(window.travelNexusAuthReady ?? true)
  .then((authenticated) => {
    if (!authenticated) return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initializeLostFoundModule, { once: true });
    } else {
      initializeLostFoundModule();
    }
  })
  .catch((error) => console.error("Lost & Found initialization failed:", error));
