"use strict";

const PERSON_REPORTS_URL = "http://127.0.0.1:8000/api/authority/face/cases/";
const personReportList = document.getElementById("personReportList");

function escapePersonReportText(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}

async function loadPersonReports() {
    if (!personReportList) return;
    personReportList.innerHTML = '<div class="content-card person-reports-loading"><span class="report-loader"></span><p>Loading authority safety reports…</p></div>';
    try {
        const response = await fetch(PERSON_REPORTS_URL, {
            cache: "no-store",
            headers: { Accept: "application/json" }
        });
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.cases)) {
            throw new Error(result.error || result.message || "Could not load person reports.");
        }
        if (!result.cases.length) {
            personReportList.innerHTML = '<div class="content-card person-reports-empty"><span><i class="fa-solid fa-clipboard-check"></i></span><h2>No active notices</h2><p>The Authority has no active missing-person or suspicious-person reports to share right now.</p></div>';
            return;
        }
        personReportList.innerHTML = result.cases.map(report => {
            const photo = /^https?:\/\//i.test(report.reference_photo || "") ? report.reference_photo : "";
            const type = String(report.report_type || "other").toLowerCase().replace(/[^a-z0-9-]/g, "");
            const date = report.created_at ? new Date(report.created_at).toLocaleDateString() : "Date unavailable";
            const name = escapePersonReportText(report.name || "Name unavailable");
            return `<article class="content-card person-report-card" data-case-type="${escapePersonReportText(type)}">
                ${photo
                    ? `<img src="${escapePersonReportText(photo)}" alt="Authority reference photo for ${name}" loading="lazy">`
                    : '<div class="person-report-photo-fallback"><i class="fa-solid fa-user-shield"></i></div>'}
                <div class="person-report-details">
                    <span class="person-report-type ${escapePersonReportText(type)}">${escapePersonReportText(report.report_type_label || "Safety report")}</span>
                    <h2>${name}</h2>
                    <div class="person-report-meta"><i class="fa-regular fa-calendar"></i> Reported ${escapePersonReportText(date)}</div>
                    <p>${escapePersonReportText(report.description || "No additional description provided.")}</p>
                </div>
            </article>`;
        }).join("");
    } catch (error) {
        console.error("Could not load person reports:", error);
        personReportList.innerHTML = `<div class="content-card person-reports-error"><h2>Reports unavailable</h2><p>${escapePersonReportText(error.message)} Ensure the Authority service is available.</p></div>`;
    }
}

document.getElementById("refreshPersonReports")?.addEventListener("click", loadPersonReports);
loadPersonReports();
window.setInterval(loadPersonReports, 30000);
