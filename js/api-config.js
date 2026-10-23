// Use the local API during development and the deployed Django API online.
(function () {
  const localHosts = new Set(["localhost", "127.0.0.1"]);
  window.TRAVEL_NEXUS_API_ORIGIN = localHosts.has(window.location.hostname)
    ? "http://127.0.0.1:8000"
    : "https://travel-nexus.onrender.com";
})();
