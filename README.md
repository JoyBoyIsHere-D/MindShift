# MindShift — BTP Telemetry & Context Engine Prototype

> **Project Name:** MindShift  
> **Academic Context:** Bachelor Thesis Project (BTP) — Sem 7 / Sem 8  
> **Current Phase:** Phase 2: The Context Engine, Algorithmic Architecture & 4-Stage Adaptive Escalation Overlays  
> **Target OS:** Android Only (Android 14+ / API 34 & 35 compliant)  
> **Application ID / Package:** `com.mindshift`

---

## 📋 Table of Contents
1. [Project Objective & Core Principles](#-project-objective--core-principles)
2. [Phase 2 Architecture & Technical Specifications](#-phase-2-architecture--technical-specifications)
3. [Project Directory Layout & Manifest](#-project-directory-layout--manifest)
4. [Native Android Implementation (Kotlin)](#-native-android-implementation-kotlin)
   - [Real-Time App Launch Detection](#1-real-time-app-launch-detection-telemetryservicekt)
   - [Context Engine & Algorithmic Scoring](#2-context-engine--algorithmic-scoring-engine)
   - [Markov Chain Switching Loop Detector](#3-markov-chain-switching-loop-detector)
   - [Exponential Decay & Escalation Policy](#4-exponential-decay--escalation-policy-interventionmanagerkt)
   - [Native System Overlays](#5-native-system-overlays-overlaywindowmanagerkt)
   - [Room SQLite Database Schema (v2)](#6-room-sqlite-database-schema-v2)
   - [Cloud Sync Engine](#7-cloud-sync-engine-syncmodulekt)
5. [Cloud Sync REST API & CSV Export Contract](#-cloud-sync-rest-api--csv-export-contract)
6. [React Native Frontend (TypeScript)](#-react-native-frontend-typescript)
   - [Native Bridge Interface](#1-native-bridge-interface-telemetrybridgets)
   - [UI Components & Views](#2-ui-components--views)
7. [Mock Backend Test Server](#-mock-backend-test-server)
8. [Step-by-Step Setup, Build & Testing Guide](#-step-by-step-setup-build--testing-guide)
9. [Build Environment & Verified Compatibility](#-build-environment--verified-compatibility)

---

## 🎯 Project Objective & Core Principles

**MindShift** is an Android Digital Self-Control Tool (DSCT) built for an academic Bachelor Thesis Project (BTP). It moves beyond crude daily hard limits by dynamically measuring **mindlessness velocity** and applying **contextual, 4-stage adaptive escalation interventions**:

* **Phase 1 (Complete):** High-fidelity passive telemetry collection, Room database logging, Android 14+ foreground service, and REST batch syncing.
* **Phase 2 (Active):** Real-time interactive app launch detection (1500ms loop), Context Engine with Markov switching loop detector, heuristic intent classification, exponential step-down decay ($L_t = L_0 \cdot e^{-\lambda t}$), and 4 native `TYPE_APPLICATION_OVERLAY` escalation tiers.
* **Phase 3 (Upcoming):** On-device Random Forest / LightGBM ML inference using `onnxruntime-android`.

---

## 🏗️ Phase 2 Architecture & Technical Specifications

| Layer | Technology | Key Components / Implementation Details |
|---|---|---|
| **Frontend UI** | React Native 0.76 (Bare Workflow, standard bridge `newArchEnabled=false`) | TypeScript, AppState lifecycle listeners, 4 tabs: `OnboardingView`, `DashboardView`, `GoalsAndContextView`, `SyncControlsView` |
| **Native Bridge** | Kotlin Native Modules | `UsageStatsModule`, `ServiceBridgeModule`, `SyncModule`, registered via `MindShiftPackage` |
| **Detection Engine** | Dual-Loop Foreground Service | `TelemetryService` (`specialUse` FGS): 1500ms interactive foreground detector (`PowerManager.isInteractive`) + 5-minute bulk SQLite telemetry backup |
| **Context Engine** | Heuristic Multi-Factor Classifier | `ContextEngine`, `MarkovLoopDetector` (24h transition matrix), `IntentClassifier` ($[0.0, 1.0]$ score with $1.3\times$ circadian/deep-work vulnerability multiplier) |
| **Escalation Policy** | Adaptive Escalation Manager | `InterventionManager`: Exponential decay allowance ($L_t = L_0 \cdot e^{-\lambda t}$), 3-minute post-override cooldowns, policy stage selector |
| **System Overlays** | Native `WindowManager` Views | `OverlayWindowManager` (`TYPE_APPLICATION_OVERLAY`): Stage 1 (Floating Pill), Stage 2 (6s Breathing Pause), Stage 3 (Mindful Typing Friction), Stage 4 (Hard Lockout) |
| **Local Database** | Android Room (SQLite v2) via `kapt` | `TelemetryDatabase`: `telemetry_events`, `user_goals`, and `intervention_logs` |
| **Cloud Sync & ML** | REST Client + Mock Node.js Server | Batch JSON upload to `/api/telemetry/sync` + CSV export for scikit-learn training at `/api/telemetry/export-csv` |

---

## 📂 Project Directory Layout & Manifest

```
MindShift/
├── README.md                            # Comprehensive project documentation
├── PROJECT_CONTEXT_FOR_STUDIO.md        # Technical architectural context & specifications
├── package.json                         # React 18.3.1, React Native 0.76.7, community CLI
├── index.js                             # AppRegistry root entry point
├── babel.config.js                      # Metro / Babel preset configuration
├── metro.config.js                      # Metro bundler configuration
├── tsconfig.json                        # TypeScript compiler options (strict, type-safe)
│
├── test-server/                         # Lightweight Mock REST Backend
│   ├── server.js                        # Node.js server handling health check, sync & CSV export
│   └── received_telemetry.json          # Persisted sync payloads (generated on receipt)
│
├── src/                                 # React Native JavaScript / TypeScript Layer
│   ├── App.tsx                          # Root container: tab management, state verification, AppState listener
│   ├── native/
│   │   └── TelemetryBridge.ts           # Strongly typed TypeScript bridge to native Kotlin modules
│   └── components/
│       ├── OnboardingView.tsx           # BTP scope, Usage Access & Overlay permissions, service controls
│       ├── DashboardView.tsx            # Aggregated usage stats, percentage bars, raw event log viewer
│       ├── GoalsAndContextView.tsx      # Real-time Context Engine metrics, goal setup & Stage 1–4 debug triggers
│       └── SyncControlsView.tsx         # SQLite metrics, pending sync count, manual sync button
│
└── android/                             # Native Android Studio Project Root
    ├── build.gradle                     # Top-level Gradle: Kotlin 1.9.24, AGP 8.6.1, compileSdk 35
    ├── settings.gradle                  # Autolinking & @react-native/gradle-plugin
    ├── gradle.properties                # newArchEnabled=false, hermesEnabled=true
    ├── local.properties                 # sdk.dir pointing to Android SDK
    └── app/
        ├── build.gradle                 # Room 2.6.1 with kapt, Coroutines 1.7.3, Gson 2.10.1
        └── src/main/
            ├── AndroidManifest.xml      # FGS specialUse, SYSTEM_ALERT_WINDOW, BootReceiver, usesCleartextTraffic
            ├── res/                     # Android app resources (strings, styles)
            └── java/com/mindshift/
                ├── MainActivity.kt      # Main ReactActivity host
                ├── MainApplication.kt   # ReactApplication initializing telemetry notification channel
                ├── MindShiftPackage.kt  # ReactPackage registering native modules
                │
                ├── modules/
                │   ├── UsageStatsModule.kt    # AppOps permissions & UsageStatsManager queries
                │   ├── ServiceBridgeModule.kt # Service lifecycle, overlay permissions, goal CRUD, metrics, overlay triggers
                │   └── SyncModule.kt          # Batch upload of telemetry & intervention logs to REST API
                │
                ├── service/
                │   └── TelemetryService.kt    # Dual-loop FGS (1500ms interactive detector + 5m persistent logger)
                │
                ├── engine/
                │   ├── BehavioralFeatures.kt  # Feature vector data classes
                │   ├── IntentClassifier.kt    # IntentClassifier interface & HeuristicIntentClassifier
                │   ├── MarkovLoopDetector.kt  # 10x10 transition matrix & rapid switching loop detector
                │   ├── ContextEngine.kt       # Real-time feature extractor combining Room & live events
                │   └── InterventionManager.kt # Exponential decay computation & 4-stage escalation coordinator
                │
                ├── overlay/
                │   └── OverlayWindowManager.kt# Programmatic native UI views for Stages 1, 2, 3, and 4
                │
                ├── data/
                │   ├── TelemetryEvent.kt      # Room Entity: id, package_name, event_type, timestamps, synced
                │   ├── TelemetryEventDao.kt   # Room DAO for telemetry events
                │   ├── UserGoalEntity.kt      # Room Entity: package_name, baselineDailyMs, decayRateLambda, enabled
                │   ├── UserGoalDao.kt         # Room DAO for user goals
                │   ├── InterventionLogEntity.kt# Room Entity: id, package_name, stage, score, userAction, synced
                │   ├── InterventionLogDao.kt  # Room DAO for intervention logs & compliance counts
                │   └── TelemetryDatabase.kt   # Room Database v2 singleton ("mindshift_telemetry.db")
                │
                └── receiver/
                    └── BootReceiver.kt        # Auto-restarts TelemetryService upon device reboot
```

---

## ⚙️ Native Android Implementation (Kotlin)

### 1. Real-Time App Launch Detection (`TelemetryService.kt`)
Operates two concurrent coroutine loops on `Dispatchers.IO + SupervisorJob()`:
1. **Interactive Fast Loop (1500ms):**
   * Active only when the device screen is on (`powerManager.isInteractive`).
   * Inspects `UsageStatsManager.queryEvents` for `ACTIVITY_RESUMED` events in the last 5 seconds.
   * If a target social app is detected entering the foreground, it evaluates the Context Engine and triggers the required overlay stage.
   * If the user switches away from the target app, any active overlay is automatically dismissed.
   * When screen is off, throttles back to 5000ms intervals to preserve battery.
2. **Periodic Telemetry Loop (5 minutes):**
   * Ingests bulk events into Room SQLite and purges synced records older than 7 days.

### 2. Context Engine & Algorithmic Scoring (`engine/`)
Whenever a target app enters foreground, `ContextEngine.kt` computes real-time behavioral features:
* **Launch Frequency (`launchCount30m`):** Total launches of target apps in the last 30 minutes.
* **Session Velocity & Dwell Time (`sessionVelocityDwellMs`):** Elapsed time since the last `ACTIVITY_PAUSED` event. Reopening within $< 60\text{s}$ indicates compulsive habitual loops.
* **Circadian & Deep-Work Multipliers:** Applies a $1.3\times$ vulnerability factor during academic deep-work hours (09:00–17:00) and late-night doomscrolling hours (23:00–04:00).
* **`IntentClassifier` Interface:** Normalized multi-factor feature scoring outputs `mindlessnessScore` $\in [0.0, 1.0]$. Built as an interface to support drop-in replacement with an ONNX Runtime Random Forest model in Phase 3.

### 3. Markov Chain Switching Loop Detector (`MarkovLoopDetector.kt`)
* Dynamically constructs an empirical transition matrix $P(\text{App}_B \mid \text{App}_A)$ across the 10 target social media packages from the last 24 hours.
* Detects **Rapid Switching Loops**:
  * 3+ distinct target social media apps launched within a 3-minute window, OR
  * High-frequency bounce-back loops ($A \to B \to A$).
* Exposes top transition pairs to the frontend for visualization.

### 4. Exponential Decay & Escalation Policy (`InterventionManager.kt`)
* **Exponential Decay Allowance:**
  $$L_t = L_0 \cdot e^{-\lambda \cdot t}$$
  where $L_0$ is the baseline daily allowance (default: 45 min), $\lambda$ is the step-down rate (default: $0.02/\text{day}$ for $\approx 13\%$ weekly reduction), and $t$ is days elapsed.
* **Escalation Policy Matrix:**
  * **Stage 4 (Hard Lockout):** $\text{usedTodayMs} \ge L_t$ AND `mindlessnessScore >= 0.55` (or $>1.2\times L_t$).
  * **Stage 3 (Progressive Friction):** `mindlessnessScore >= 0.75` OR usage at $80\%–100\%$ of $L_t$.
  * **Stage 2 (Micro-Boundary):** `mindlessnessScore >= 0.55` OR rapid Markov switching loop detected.
  * **Stage 1 (Ambient Awareness):** `mindlessnessScore >= 0.35` OR usage at $50\%–80\%$ of $L_t$.
  * **Stage 0 (No Intervention):** Mindful, intentional baseline.
* **Cooldown Protection:** If the user overrides Stage 2 or Stage 3, a 3-minute cooldown is active during which modal overlays are suppressed or downgraded to Stage 1.

### 5. Native System Overlays (`OverlayWindowManager.kt`)
Programmatically constructed native Android views using `WindowManager` and `TYPE_APPLICATION_OVERLAY`:
* **Stage 1 (Ambient Awareness):** Non-blocking floating pill at the top-right (`FLAG_NOT_FOCUSABLE`), displaying the app name, % of daily allowance, a live-updating session timer, and a dismiss button.
* **Stage 2 (Micro-Boundary):** Full-screen dark translucent overlay with a **6-second animated breathing circle** (pulsating scale with "Breathe in... Breathe out..."). After 6 seconds, presents:
  * **"Close App (Mindful)"** $\to$ Exits to Android Home screen and records `COMPLIED_CLOSED_APP`.
  * **"Continue for 5m"** $\to$ Sets a 3-minute cooldown and records `OVERRIDDEN`.
* **Stage 3 (Friction Restraint):** Requires the user to type a 25-character mindful sentence accurately into an input field (e.g., *"I choose mindful presence"*) to activate the "Unlock for 5m" button, or exit to Home at any time.
* **Stage 4 (Hard Lockout):** Strict lockout screen detailing the reached Exponential Decay limit trajectory, redirecting back to the Android Home screen.

### 6. Room SQLite Database Schema (v2)
* **`telemetry_events`:** `id`, `package_name`, `event_type`, `timestamp`, `duration`, `recorded_at`, `synced`.
* **`user_goals`:** `package_name` (PK), `baseline_daily_ms` ($L_0$), `decay_rate_lambda` ($\lambda$), `start_date_epoch_ms`, `enabled`.
* **`intervention_logs`:** `id`, `package_name`, `timestamp`, `intervention_stage` (1–4), `mindlessness_score`, `user_action` (`COMPLIED_CLOSED_APP`, `OVERRIDDEN`, `DISMISSED`), `synced`.

### 7. Cloud Sync Engine (`SyncModule.kt`)
* Batches unsynced `telemetry_events` and `intervention_logs` (100 rows/batch).
* Pushes to `POST /api/telemetry/sync` and transactionally marks them as `synced = 1` upon HTTP 2xx.

---

## 🌐 Cloud Sync REST API & CSV Export Contract

### 1. Ingestion Endpoint
* **Method:** `POST`
* **Path:** `/api/telemetry/sync`
* **Headers:** `Content-Type: application/json`
* **Payload Schema:**
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
  ],
  "interventionLogs": [
    {
      "packageName": "com.instagram.android",
      "timestamp": 1728654322000,
      "interventionStage": 2,
      "mindlessnessScore": 0.68,
      "userAction": "COMPLIED_CLOSED_APP"
    }
  ]
}
```

### 2. Machine Learning CSV Export Endpoint
* **Method:** `GET`
* **Path:** `/api/telemetry/export-csv`
* **Headers:** `Content-Type: text/csv; charset=utf-8`
* **Columns:** `timestamp,datetime_iso,record_type,package_name,event_or_stage,duration_ms,mindlessness_score,user_action`
* Directly ingestible into Python pandas / scikit-learn training pipelines!

---

## 📱 React Native Frontend (TypeScript)

### 1. Native Bridge Interface (`TelemetryBridge.ts`)
Fully typed methods for permissions, service controls, goal management, real-time context metrics, Markov transitions, and overlay testing:
* `hasOverlayPermission(): Promise<boolean>`
* `requestOverlayPermission(): Promise<boolean>`
* `getUserGoals(): Promise<UserGoal[]>`
* `saveUserGoal(packageName, baselineMinutes, decayLambda, enabled): Promise<boolean>`
* `getContextMetrics(packageName): Promise<ContextMetrics>`
* `getTopTransitions(limit): Promise<MarkovTransition[]>`
* `testTriggerOverlay(stage, packageName): Promise<boolean>`
* `dismissOverlay(): Promise<boolean>`
* `getRecentInterventionLogs(limit): Promise<InterventionLog[]>`

### 2. UI Components & Views
1. **`OnboardingView.tsx`:** Manages dual permissions (Usage Access + System Alert Window) with real-time indicators and launch triggers.
2. **`DashboardView.tsx`:** Aggregated foreground times, comparative percentage bars, and raw `ACTIVITY_RESUMED`/`PAUSED` event logs.
3. **`GoalsAndContextView.tsx`:**
   * **Real-time Mindlessness Gauge:** Visual percentage indicator, trigger reason, launch count, velocity dwell time, Markov loop status.
   * **Exponential Step-Down Goals:** Displays today's $L_t$ target vs. actual usage and allows customizing $L_0$ and $\lambda$.
   * **Markov Transition Matrix:** Top app-switching pairs over the last 24h.
   * **BTP Evaluation & Demonstration Card:** 4 buttons to directly test Stages 1, 2, 3, and 4 overlays!
4. **`SyncControlsView.tsx`:** Shows Room DB counts, pending queue, and manual cloud sync.

---

## 🖥️ Mock Backend Test Server

Located in `test-server/server.js`:
* `node test-server/server.js` (port 3000)
* `/health`: Health status.
* `POST /api/telemetry/sync`: Ingests and prints formatted summaries for events and intervention compliance.
* `GET /api/telemetry/export-csv`: Streams clean training CSV for scikit-learn.
* `GET /api/telemetry/logs`: Returns raw JSON batches.

---

## 🛠️ Step-by-Step Setup, Build & Testing Guide

### Step 1: Start the Backend Server
```bash
cd test-server
node server.js
```

### Step 2: Start the React Native Bundler
```bash
npm start
```

### Step 3: Forward Ports via ADB
```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
```

### Step 4: Build & Install Native App (No-Daemon)
```bash
cd android
./gradlew installDebug --no-daemon
```

### Step 5: Launch the App
```bash
adb shell am start -n com.mindshift/com.mindshift.MainActivity
```

### Step 6: Testing Flow for BTP Evaluation
1. **Grant Permissions:** In the **Perms** tab, enable both **Usage Access** and **Display Over Other Apps**.
2. **Start Service:** Tap **"Start Context Engine Service"** to activate the 1500ms detection loop and foreground service notification.
3. **Test Context & Overlays:** Navigate to the **Context & Overlays** tab:
   * Select any tracked app (e.g. Instagram).
   * Review the real-time mindlessness gauge, velocity dwell time, and Markov transitions.
   * Tap **"Stage 1: Ambient Pill"** to see the floating session timer pill appear.
   * Tap **"Stage 2: Micro-Boundary"** to test the 6-second animated breathing pause and mindful exit buttons.
   * Tap **"Stage 3: Friction Task"** to test the 25-character mindful phrase typing challenge.
   * Tap **"Stage 4: Hard Lockout"** to test the strict exponential limit screen.
4. **Test Real App Launch:** Open YouTube or Instagram. Watch the service detect the foreground change within 1.5 seconds and trigger the appropriate intervention!
5. **Sync & Export CSV:** In the **Sync** tab, tap **"Sync Now to Cloud"**, then visit `http://localhost:3000/api/telemetry/export-csv` in your browser to download the training CSV!

---

## 🔍 Build Environment & Verified Compatibility

* **JDK:** Eclipse Temurin JDK 17 (Java 17)
* **Compile SDK:** 35 (Android 15)
* **Target SDK:** 35
* **Min SDK:** 24 (Android 7.0)
* **Android Gradle Plugin:** 8.6.1
* **Kotlin:** 1.9.24
* **Room Database:** 2.6.1 with KAPT
* **React Native:** 0.76.7 (Bare Workflow, Hermes enabled, `newArchEnabled=false`)
* **Build Verification Status:** `BUILD SUCCESSFUL` (Verified with `./gradlew compileDebugSources --no-daemon`)
