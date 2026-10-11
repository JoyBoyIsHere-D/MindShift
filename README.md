# MindShift — BTP Telemetry Prototype

> **Project Name:** MindShift  
> **Academic Context:** Bachelor Thesis Project (BTP) — Sem 7 / Sem 8  
> **Current Phase:** Phase 1: Pure Data Collection (Passive Telemetry & Baseline Tracking)  
> **Target OS:** Android Only (Android 14+ / API 34 & 35 compliant)

## 📋 Project Objective
MindShift is an Android application designed to track foreground screen time, launch frequency, and session velocity of target social media apps. The goal is to establish pre-intervention behavioral baselines for future ML model training. 

This phase is **strictly passive**: there are no active interventions, blocking overlays, or on-device machine learning inferences. It only logs package names, event types, timestamps, and durations. No screen content, notifications text, keystrokes, or messages are ever collected, ensuring complete privacy and safety.

## 🚀 Current Features

### 1. Passive Data Collection (`UsageStatsModule`)
*   **AppOps Integration:** Requests and verifies Android `USAGE_ACCESS_SETTINGS` permission from the user.
*   **Targeted Tracking:** Monitors specific social media packages (Instagram, YouTube, Twitter, TikTok, Facebook, Snapchat, Reddit, LinkedIn, Telegram, WhatsApp).
*   **Real-time Aggregation:** Aggregates foreground duration for the current day natively.
*   **Raw Event Logging:** Captures exact `ACTIVITY_RESUMED` and `ACTIVITY_PAUSED` timestamps natively via `UsageStatsManager`.

### 2. Persistent Background Tracking (`ServiceBridgeModule`)
*   **Android 14+ Compliant:** Runs a `specialUse` Foreground Service (FGS) to comply with modern Android background execution limits.
*   **Low-Priority Notification:** Maintains a persistent notification to keep the service alive in memory.
*   **Automated Polling:** Uses a SupervisorJob and Kotlin Coroutines to wake up every 5 minutes (`POLL_INTERVAL_MS = 300,000L`) to process data without killing the battery.
*   **Auto-Restart:** Integrates a `BootReceiver` to automatically restart the telemetry service when the device is rebooted.

### 3. Local Storage & Cloud Sync (`SyncModule`)
*   **Local Database:** Uses Android Room (SQLite) to safely store telemetry events locally (`mindshift_telemetry.db`).
*   **Batch Uploading:** Queries up to 100 unsynced events at a time and syncs them to the backend in a background `Dispatchers.IO` coroutine.
*   **Transactional Sync:** Marks rows as `synced = 1` only upon receiving a successful HTTP 2xx response from the server.
*   **Auto-Cleanup:** Automatically deletes synced rows older than 7 days during polling cycles to prevent storage bloat.
*   **Mock Backend Server:** Includes a lightweight Node.js server (`test-server/server.js`) to test the JSON REST API locally.

### 4. React Native User Interface
*   **OnboardingView:** Explains the BTP research context and handles the AppOps usage access request.
*   **DashboardView:** Displays today's aggregated usage stats and allows inspection of raw event logs.
*   **SyncControlsView:** Shows SQLite metrics, pending sync count, and provides a manual sync trigger button.

---

## 🛠️ How to Run & Test the App

Because of an environment variable bug in the Android Gradle Plugin on Windows, you must use the `No-Daemon` build command to safely deploy the app. Follow these exact steps to start the app from scratch.

### Step 1: Start the Backend Server
The app needs a place to send its telemetry data. We use a local Node.js mock server.
Open a terminal in the root of the project and run:
```bash
cd test-server
node server.js
```
*(Leave this terminal window open)*

### Step 2: Start the React Native Bundler
Open a **new** terminal tab in the root of the project and run:
```bash
npm start
```
*(Leave this terminal window open)*

### Step 3: Connect Your Device & Bridge the Ports
Connect your Android 14+ physical device via USB (ensure USB Debugging is enabled).
You must route your phone's network traffic to your computer's local servers. Open a **new** terminal tab and run:
```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
```
*   `8081` connects the app to the React Native UI bundler.
*   `3000` connects the native Android `SyncModule` to the Node.js test server.

### Step 4: Build and Install (The Safe Way)
To guarantee the Android build works without caching conflicts, use the native Gradle wrapper with the `--no-daemon` flag.
In that same terminal tab, run:
```bash
cd android
./gradlew installDebug --no-daemon
```

### Step 5: Launch the App
Once installed, you can launch it by tapping the app icon on your phone, or by running:
```bash
adb shell am start -n com.mindshift/com.mindshift.MainActivity
```

You can now navigate the UI, grant usage permissions, and press the manual sync button. Check your `test-server` terminal to see the telemetry JSON payloads arrive!
