# MindShift — BTP Telemetry Prototype Context File

> **Project Name:** MindShift  
> **Academic Context:** Bachelor Thesis Project (BTP) — Sem 7 / Sem 8  
> **Current Phase:** Phase 2: The Context Engine, Algorithmic Architecture & 4-Stage Adaptive Escalation Overlays  
> **Target OS:** Android Only (Android 14+ / API 34 & 35 compliant)  
> **Application ID / Package:** `com.mindshift`

---

## 1. Project Objective & Constraints
- **Primary Goal:** Real-time behavioral mindlessness classification, Markov switching loop detection, and 4-stage adaptive escalation overlays based on exponential step-down daily allowances.
- **Privacy & Safety:** Only logs package names, event types, timestamps, durations, and compliance actions. No screen content, notifications text, keystrokes, or messages are ever collected.

---

## 2. Tech Stack & Architecture

| Layer | Technology | Key Components / Implementation Details |
|---|---|---|
| **Frontend UI** | React Native 0.76 (Bare Workflow, standard bridge `newArchEnabled=false`) | TypeScript, AppState lifecycle listeners, tabbed UI (`OnboardingView`, `DashboardView`, `GoalsAndContextView`, `SyncControlsView`) |
| **Native Bridge** | Kotlin Native Modules | `UsageStatsModule`, `ServiceBridgeModule`, `SyncModule`, registered via `MindShiftPackage` |
| **Background Service** | Kotlin Foreground Service | `TelemetryService` (`specialUse` FGS type on Android 14+): 1500ms interactive foreground detector + 5-min bulk logger |
| **Context Engine** | Heuristic Classifier + Markov Detector | `ContextEngine`, `MarkovLoopDetector`, `IntentClassifier`, `InterventionManager` |
| **System Overlays** | Native `WindowManager` Views | `OverlayWindowManager`: Stage 1 (Pill), Stage 2 (6s Breathing), Stage 3 (Friction Phrase), Stage 4 (Lockout) |
| **Local Database** | Android Room (SQLite v2) via `kapt` | `TelemetryDatabase`: `telemetry_events`, `user_goals`, `intervention_logs` |
| **Cloud Sync** | Native REST Client (`HttpURLConnection` + `Gson`) | Batch upload to `POST /api/telemetry/sync` + CSV ML export at `GET /api/telemetry/export-csv` |

---

## 3. Directory Layout & File Manifest

```
MindShift/
├── package.json                         # React 18.3.1, React Native 0.76.7, @react-native-community/cli
├── index.js                             # AppRegistry root entry
├── test-server/
│   └── server.js                        # Node.js backend: sync ingest + CSV export
│
├── src/                                 # React Native JavaScript / TypeScript Layer
│   ├── App.tsx                          # Root container with 4 tabs & AppState resume check
│   ├── native/
│   │   └── TelemetryBridge.ts           # Strongly typed TypeScript wrapper for all native bridge methods
│   └── components/
│       ├── OnboardingView.tsx           # BTP research info + Usage Access & Overlay permissions
│       ├── DashboardView.tsx            # Today's aggregated usage stats + raw event log inspector
│       ├── GoalsAndContextView.tsx      # Real-time Context Engine metrics, goal setup & Stage 1–4 debug triggers
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
            ├── AndroidManifest.xml       # SYSTEM_ALERT_WINDOW, specialUse FGS, BootReceiver
            └── java/com/mindshift/
                ├── MainActivity.kt      # Main ReactActivity
                ├── MainApplication.kt   # ReactApplication + notification channel creation
                ├── MindShiftPackage.kt  # ReactPackage registering the 3 native modules
                │
                ├── modules/
                │   ├── UsageStatsModule.kt    # Hooks into UsageStatsManager
                │   ├── ServiceBridgeModule.kt # Service lifecycle, overlay permissions, goal CRUD, metrics, overlay triggers
                │   └── SyncModule.kt          # Batch upload to REST API, DB count queries, endpoint configuration
                │
                ├── service/
                │   └── TelemetryService.kt    # START_STICKY foreground service: 1500ms fast loop + 5m bulk loop
                │
                ├── engine/
                │   ├── IntentClassifier.kt    # IntentClassifier interface & HeuristicIntentClassifier
                │   ├── MarkovLoopDetector.kt  # 10x10 transition matrix & rapid switching loop detector
                │   ├── ContextEngine.kt       # Real-time feature extractor
                │   └── InterventionManager.kt # Exponential decay computation & 4-stage escalation coordinator
                │
                ├── overlay/
                │   └── OverlayWindowManager.kt# Programmatic native UI views for Stages 1, 2, 3, and 4
                │
                ├── data/
                │   ├── TelemetryEvent.kt      # Room Entity: id, package_name, event_type, timestamp, duration, synced
                │   ├── TelemetryEventDao.kt   # Room DAO: insertAll, getUnsyncedEvents, markAsSynced
                │   ├── UserGoalEntity.kt      # Room Entity: package_name, baselineDailyMs, decayRateLambda, enabled
                │   ├── UserGoalDao.kt         # Room DAO: upsertGoal, getAllGoals, getGoalForPackage
                │   ├── InterventionLogEntity.kt# Room Entity: id, package_name, stage, score, userAction, synced
                │   ├── InterventionLogDao.kt  # Room DAO: insert, getUnsyncedLogs, markAsSynced, compliance stats
                │   └── TelemetryDatabase.kt   # Room Database v2 singleton ("mindshift_telemetry.db")
                │
                └── receiver/
                    └── BootReceiver.kt        # Auto-restarts TelemetryService upon device reboot
```

---

## 4. Local Database Schema (`mindshift_telemetry.db`, Version 2)

**Table:** `telemetry_events`
`id` (PK, auto), `package_name`, `event_type`, `timestamp`, `duration`, `recorded_at`, `synced`.

**Table:** `user_goals`
`package_name` (PK), `baseline_daily_ms` ($L_0$), `decay_rate_lambda` ($\lambda$), `start_date_epoch_ms`, `enabled`.

**Table:** `intervention_logs`
`id` (PK, auto), `package_name`, `timestamp`, `intervention_stage` (1–4), `mindlessness_score`, `user_action`, `synced`.

---

## 5. Cloud Sync REST Contract
- `POST /api/telemetry/sync`: Ingests `events` and `interventionLogs`.
- `GET /api/telemetry/export-csv`: Generates and downloads full dataset for Python scikit-learn models.
