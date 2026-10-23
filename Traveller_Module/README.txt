TRAVEL NEXUS — INTEGRATED MODULAR PROJECT

IMPORTANT: This is one integrated application, not seven independent websites.

HOW IT WORKS
- index.html is the single application shell and shared navigation.
- modules/*.html contain the individual module sections (fragments).
- js/module-loader.js loads every fragment into the same page BEFORE starting the shared application logic.
- js/app.js preserves the original shared application logic, maps, geolocation, geofence, SOS, and cross-module functions.
- js/modules/alerts.js contains the original alert filtering/details logic.
- js/modules/*.js are separate module initialization files, including live-location.js; existing shared actions remain in app.js to preserve cross-module behavior.
- css/style.css contains the original styling; css/modules/*.css are reserved for module-specific overrides.
- Live location is part of the original dashboard/geofence workflow, so it shares the same location state instead of becoming a disconnected separate website.

RUN
1. Extract the ZIP.
2. Open the extracted folder in VS Code.
3. Install/use the Live Server extension if needed.
4. Right-click index.html and choose Open with Live Server.
5. Do not open index.html with file:// directly; module fragments are fetched at runtime.

Leaflet map tiles require internet. Live tracking requires location permission. The SOS modal is a UI confirmation and does not automatically contact emergency services.
