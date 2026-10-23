/* Geofence module initialization. The shared Leaflet map and geofence logic are in ../app.js. */
document.addEventListener("travelnexus:ready", () => {
  if (window.map && typeof window.map.invalidateSize === "function") window.map.invalidateSize();
});
