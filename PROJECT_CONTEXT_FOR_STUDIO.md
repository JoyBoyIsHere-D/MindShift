# MindShift — BTP Telemetry Prototype Context File

> **Project Name:** MindShift  
> **Academic Context:** Bachelor Thesis Project (BTP) — Sem 7 / Sem 8  
> **Current Phase:** Phase 1: Pure Data Collection (Passive Telemetry & Baseline Tracking)  
> **Target OS:** Android Only (Android 14+ / API 34 & 35 compliant)  
> **Application ID / Package:** `com.mindshift`

---

## 1. Project Objective & Constraints
- **Primary Goal:** Track foreground screen time, launch frequency, and session velocity of target social media apps to establish pre-intervention behavioral baselines for future ML model training.
- **Strictly Passive:** No active interventions, no blocking overlays, no machine learning inferences running on-device in this phase.
- **Privacy & Safety:** Only logs package names, event types, timestamps, and durations. No screen content, notifications text, keystrokes, or messages are ever collected.

---

## 2. Tech Stack & Architecture

| Layer | Technology | Key Components / Implementation Details |
|---|---|---|
| **Frontend UI** | React Native 0.76 (Bare Workflow, standard bridge `newArchEnabled=false`) | TypeScript, AppState lifecycle listeners, tabbed UI (`OnboardingView`, `DashboardView`, `SyncControlsView`) |
| **Native Bridge** | Kotlin Native Modules | `UsageStatsModule`, `ServiceBridgeModule`, `SyncModule`, registered via `MindShiftPackage` |
| **Background Service** | Kotlin Foreground Service | `TelemetryService` (`specialUse` FGS type on Android 14+), persistent low-priority notification, coroutine polling (5 min) |
| **Local Database** | Android Room (SQLite) via `kapt` | `TelemetryDatabase`, `TelemetryEventDao`, `TelemetryEvent` entity |
| **Cloud Sync** | Native REST Client (`HttpURLConnection` + `Gson`) | Batch upload (100 rows/batch) via `POST /api/telemetry/sync`, transactionally marks rows as `synced = 1` |

---

## 3. Directory Layout & File Manifest

```
MindShift/
├── package.json                         # React 18.3.1, React Native 0.76.7, @react-native-community/cli
├── index.js                             # AppRegistry root entry
├── test-server/
│   └── server.js                        # Lightweight Node.js mock REST backend for testing sync
│
├── src/                                 # React Native JavaScript / TypeScript Layer
│   ├── App.tsx                          # Root container with tab switcher & auto AppState resume check
│   ├── native/
│   │   └── TelemetryBridge.ts           # Strongly typed TypeScript wrapper for all native bridge methods
│   └── components/
│       ├── OnboardingView.tsx           # BTP research info + AppOps usage access request button
│       ├── DashboardView.tsx            # Today's aggregated usage stats + raw event log inspector
│       └── SyncControlsView.tsx         # SQLite metrics, pending sync count, manual sync button
│
└── android/                             # Native Android Studio Project Root
    ├── build.gradle                     # Kotlin 1.9.24, AGP 8.6.1, compileSdk 35
    ├── settings.gradle                  # Autolinking & @react-native/gradle-plugin
    ├── gradle.properties                # newArchEnabled=false, hermesEnabled=true
    ├── local.properties                 # sdk.dir pointing to local Android SDK
    └── app/
        ├── build.gradle                 # Room 2.6.1 with kapt, Coroutines 1.7.3, Gson 2.10.1
        └── src/main/
            ├── AndroidManifest.xml       # Special permissions + Service + BootReceiver + usesCleartextTraffic
            └── java/com/mindshift/
                ├── MainActivity.kt      # Main ReactActivity
                ├── MainApplication.kt   # ReactApplication + notification channel creation
                ├── MindShiftPackage.kt  # ReactPackage registering the 3 native modules
                │
                ├── modules/
                │   ├── UsageStatsModule.kt    # Hooks into UsageStatsManager (AppOps, aggregated stats, raw events)
                │   ├── ServiceBridgeModule.kt # Start / stop / status check for TelemetryService
                │   └── SyncModule.kt          # Batch upload to REST API, DB count queries, endpoint configuration
                │
                ├── service/
                │   └── TelemetryService.kt    # START_STICKY foreground service, 5-min coroutine polling
                │
                ├── data/
                │   ├── TelemetryEvent.kt      # Room Entity: id, package_name, event_type, timestamp, duration, synced
                │   ├── TelemetryEventDao.kt   # Room DAO: insertAll, getUnsyncedEvents, markAsSynced, deleteSyncedEventsBefore
                │   └── TelemetryDatabase.kt   # Room Database singleton ("mindshift_telemetry.db")
                │
                └── receiver/
                    └── BootReceiver.kt        # Auto-restarts TelemetryService upon device reboot
```

---

## 4. Native Bridge Interface Specifications

### `UsageStatsModule` (`com.mindshift.modules.UsageStatsModule`)
- `checkUsagePermission(): Promise<boolean>`  
  Checks `AppOpsManager.OPSTR_GET_USAGE_STATS` for `AppOpsManager.MODE_ALLOWED`.
- `requestUsagePermission(): Promise<boolean>`  
  Launches Intent for `Settings.ACTION_USAGE_ACCESS_SETTINGS`.
- `getTodayStats(): Promise<UsageStat[]>`  
  Aggregates foreground duration for today (midnight to now) for target packages.
- `getAggregatedStats(startTime: Double, endTime: Double): Promise<UsageStat[]>`  
  Calls `UsageStatsManager.queryAndAggregateUsageStats(start, end)`.
- `getRawEvents(startTime: Double, endTime: Double): Promise<RawUsageEvent[]>`  
  Calls `UsageStatsManager.queryEvents(start, end)`, filtering for `ACTIVITY_RESUMED` (1) and `ACTIVITY_PAUSED` (2).
- **Tracked Packages:**  
  `com.instagram.android`, `com.google.android.youtube`, `com.twitter.android`, `com.zhiliaoapp.musically` (TikTok), `com.facebook.katana`, `com.snapchat.android`, `com.reddit.frontpage`, `com.linkedin.android`, `org.telegram.messenger`, `com.whatsapp`.

### `ServiceBridgeModule` (`com.mindshift.modules.ServiceBridgeModule`)
- `startService(): Promise<boolean>`  
  Fires `startForegroundService(Intent(context, TelemetryService::class.java))`.
- `stopService(): Promise<boolean>`  
  Calls `stopService(...)`.
- `isServiceRunning(): Promise<boolean>`  
  Returns static volatile flag `TelemetryService.isRunning`.

### `SyncModule` (`com.mindshift.modules.SyncModule`)
- `setSyncEndpoint(url: String): Promise<boolean>`  
  Configures target URL. Defaults to `http://10.0.2.2:3000/api/telemetry/sync` for emulator.
- `syncToCloud(): Promise<{ syncedCount: Int, success: Boolean }>`  
  Runs in `Dispatchers.IO` coroutine. Queries up to 100 unsynced events, POSTs JSON, marks synced upon HTTP 2xx response.
- `getUnsyncedCount(): Promise<Int>`  
  Returns count of rows where `synced = 0`.
- `getTotalEventCount(): Promise<Int>`  
  Returns total row count in `telemetry_events`.

---

## 5. Local Database Schema (`mindshift_telemetry.db`)

**Table:** `telemetry_events`

| Column | Type | Constraints / Description |
|---|---|---|
| `id` | `INTEGER` | Primary Key, Auto-generate |
| `package_name` | `TEXT` | Target Android package name |
| `event_type` | `TEXT` | `ACTIVITY_RESUMED`, `ACTIVITY_PAUSED`, or `SESSION_SUMMARY` |
| `timestamp` | `INTEGER` | Event timestamp (epoch milliseconds) |
| `duration` | `INTEGER` | Session duration in ms (for summaries, 0 for raw events) |
| `recorded_at` | `INTEGER` | Timestamp when written to local DB |
| `synced` | `INTEGER` | Boolean flag (0 = pending sync, 1 = uploaded) |

---

## 6. Android 14+ Foreground Service Specifications
- **Service Name:** `com.mindshift.service.TelemetryService`
- **FGS Type:** `specialUse` (declared in `AndroidManifest.xml` with `PROPERTY_SPECIAL_USE_FGS_SUBTYPE="Research telemetry data collection for BTP academic project"`).
- **Service Type Code:** `ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE` used in `startForeground(...)` on API 34+.
- **Notification Channel:** `CHANNEL_ID = "mindshift_telemetry"`, `IMPORTANCE_LOW`, persistent `setOngoing(true)`.
- **Lifecycle:** `START_STICKY`. Uses `SupervisorJob() + Dispatchers.IO` coroutine polling every 5 minutes (`POLL_INTERVAL_MS = 300,000L`).
- **Data Cleanup:** Automatically deletes synced rows older than 7 days during polling cycles.

---

## 7. Cloud Sync REST Contract
- **HTTP Method:** `POST`
- **Endpoint:** `/api/telemetry/sync`
- **Headers:** `Content-Type: application/json`
- **Payload Schema:**
  ```json
  {
    "events": [
      {
        "packageName": "com.instagram.android",
        "eventType": "ACTIVITY_RESUMED",
        "timestamp": 1728654321000,
        "duration": 0,
        "recordedAt": 1728654325000
      }
    ]
  }
  ```
- **Expected Success Response:** HTTP `200`..`299`.

---

## 8. Verified Build Status
- **Android Studio Compatibility:** Fully builds with Android Studio Ladybug / Meerkat / Koala.
- **Build Command:** `./gradlew assembleDebug` (Status: `BUILD SUCCESSFUL`).
- **JDK:** Eclipse Temurin JDK 17 (Java 17).
- **Android SDK:** Compile SDK 35, Min SDK 24, Target SDK 35, NDK 27.1.12297006.
- **Architectures:** `armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`.

