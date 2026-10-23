cd D:\Travel-Nexus\backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install Django django-cors-headers python-dotenv "psycopg[binary]"
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver

 py -m http.server 5501

## Face reports and live recognition

The face-report workflow does not require an admin sign-in. Its API and
protected photos are restricted to requests originating on the same computer;
keep Django bound to `127.0.0.1` and do not expose this development server to a
network. Reference photos and detection captures contain sensitive personal
data.

Keep these three servers running in separate PowerShell terminals:

**1. Django API and database**

```powershell
cd D:\Travel-Nexus
.\backend\.venv\Scripts\python.exe .\backend\manage.py migrate
.\backend\.venv\Scripts\python.exe .\backend\manage.py runserver 127.0.0.1:8000
```

**2. DeepFace recognition engine**

```powershell
cd D:\Travel-Nexus
.\deepface-master\.venv64\Scripts\python.exe .\backend\face_recognition_service.py
```

The engine listens on `http://127.0.0.1:8001`. Its first use may download
DeepFace model weights and take longer than later camera starts.

**3. Frontend**

```powershell
cd D:\Travel-Nexus
py -m http.server 5501
```

Then open `http://127.0.0.1:5501/pages/face-recognition.html`.

## Login, registration, and traveler location

Open `http://127.0.0.1:5501/pages/login.html` to sign in or create a
Traveler or Authority account. Authentication uses the same Supabase project
as the existing Travel Nexus database. The backend verifies each Supabase
access token before creating a `profiles` row and the corresponding
`traveler_profiles` or `authority_users` record. Authority registrations are
granted immediate Authority dashboard access.

Travelers are not tracked automatically. On the traveler dashboard, select
**Share my location** and grant the browser's location permission to display
the current position and save periodic location updates. The dashboard resolves
the shared coordinates to a nearby place name using OpenStreetMap's public
Nominatim service; this sends those coordinates to that service. The displayed
GPS accuracy helps identify approximate browser/device locations. Selecting
**Stop sharing** ends browser tracking; the last saved position remains in the
database for the Authority dashboard.

On the Authority dashboard, select **Enable SOS sound** once. New SOS alerts
received while the dashboard is open then show an alert dialog and play a short
sound. Browsers require this explicit user interaction before a page can play
audio.

The Authority dashboard is the single live-monitoring view: traveler locations,
recent-location counts, and active geofence circles refresh automatically. The
traveler dashboard also refreshes Authority safety zones and draws them on the
shared-location map. These dashboards poll the backend every five seconds;
location markers only appear after a traveler has saved a shared GPS reading.

Supabase email-confirmation behavior is controlled by the project owner in
**Authentication → Sign In / Providers → Email → Confirm email**. The
application cannot turn this project-level setting off. To sign in immediately
after registration, disable confirmation in the Supabase Dashboard. If
confirmation remains enabled, Supabase requires the user to confirm their
email before it returns an authenticated session.

Create a person report with a clear, authorized reference photo before
starting the camera. When a potential match stays in view for about three
seconds, the captured frame, case details, timestamp, and location (if
browser location permission is granted) are saved in the database. The
Reports page shows the reference reports and detections. Automated face
comparison can be wrong; every result must be independently reviewed.

http://127.0.0.1:5501/pages/authority.html


http://127.0.0.1:5501/Traveller_Module/index.html

## Geofence SMS alerts

Geofence-entry SMS is sent through the SMS Gateway for Android app using its
SMSGate cloud API. Add `SMSGATE_USERNAME`, `SMSGATE_PASSWORD`, and
`SMSGATE_DEVICE_ID` to `backend/.env` from the app's Home screen. Keep these
credentials private and restart Django after changing `.env`.

New traveler registrations collect a mobile number; existing travelers can add
or update it from **My Profile**. The backend queues one SMS on each detected
geofence entry and does not repeat it while the traveler stays inside the same
zone. Keep the Android gateway service running with Cloud server enabled and
internet access on the phone. SMS sending also requires an active SIM and the
phone's permission to send SMS. The message text can be changed with
`SMSGATE_GEOFENCE_TEMPLATE`; supported placeholders are `{traveler_name}`,
`{zone_name}`, and `{zone_type}`. Never put gateway credentials in browser code.
