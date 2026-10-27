package com.mindshift.service

import android.app.*
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.mindshift.MainApplication
import com.mindshift.MainActivity
import com.mindshift.data.TelemetryDatabase
import com.mindshift.data.TelemetryEvent
import com.mindshift.engine.InterventionManager
import com.mindshift.modules.UsageStatsModule
import com.mindshift.overlay.OverlayWindowManager
import kotlinx.coroutines.*
import java.util.concurrent.TimeUnit

/**
 * Persistent foreground service for MindShift.
 * Operates in two concurrent coroutine loops:
 * 1. Fast Foreground Loop (1500ms): Detects when target social apps enter the foreground
 *    (active only while PowerManager.isInteractive is true) and triggers real-time Context Engine interventions.
 * 2. Periodic Telemetry Loop (5 min): Batches UsageStats events to Room and purges records older than 7 days.
 */
class TelemetryService : Service() {

    companion object {
        const val TAG = "TelemetryService"
        const val NOTIFICATION_ID = 1001
        const val POLL_INTERVAL_MS = 5 * 60 * 1000L      // 5 minutes
        const val FAST_POLL_INTERVAL_MS = 1000L          // 1.0 second real-time response

        @Volatile
        var isRunning: Boolean = false
            private set
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var periodicPollingJob: Job? = null
    private var fastDetectionJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "TelemetryService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "TelemetryService onStartCommand")

        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        isRunning = true
        startMonitoringLoops()

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "TelemetryService destroyed")
        isRunning = false
        periodicPollingJob?.cancel()
        fastDetectionJob?.cancel()
        serviceScope.cancel()
        OverlayWindowManager.getInstance(applicationContext).dismissCurrentOverlay()
    }

    private fun buildNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, MainApplication.CHANNEL_ID)
            .setContentTitle("MindShift Active")
            .setContentText("Digital self-control & context engine active")
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    /**
     * Initiates both the fast foreground detection loop and the 5-min bulk telemetry loop.
     */
    private fun startMonitoringLoops() {
        // Loop 1: Periodic 5-minute bulk telemetry ingestion & SQLite cleanup
        periodicPollingJob?.cancel()
        periodicPollingJob = serviceScope.launch {
            while (isActive) {
                try {
                    pollAndStoreEvents()
                } catch (e: Exception) {
                    Log.e(TAG, "Error during periodic telemetry polling: ${e.message}", e)
                }
                delay(POLL_INTERVAL_MS)
            }
        }

        // Loop 2: Fast 1000ms real-time foreground detector (runs while screen is on)
        fastDetectionJob?.cancel()
        fastDetectionJob = serviceScope.launch {
            val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
            val interventionManager = InterventionManager.getInstance(applicationContext)
            val overlayManager = OverlayWindowManager.getInstance(applicationContext)
            var currentForegroundPackage: String? = null

            while (isActive) {
                val isInteractive = powerManager?.isInteractive ?: true
                if (isInteractive) {
                    try {
                        val latestResumedPkg = detectForegroundPackage()
                        if (latestResumedPkg != null && latestResumedPkg != currentForegroundPackage) {
                            currentForegroundPackage = latestResumedPkg

                            if (currentForegroundPackage in UsageStatsModule.TARGET_PACKAGES) {
                                Log.d(TAG, "Target social media package launched: $currentForegroundPackage")
                                interventionManager.evaluateAndTrigger(currentForegroundPackage)
                            } else {
                                // User switched to Launcher, Home, Chrome, MindShift, or other app
                                Log.d(TAG, "Switched to non-target package: $currentForegroundPackage. Dismissing overlay.")
                                overlayManager.dismissIfPackageNotActive(currentForegroundPackage)
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error in fast detection loop: ${e.message}", e)
                    }
                    delay(FAST_POLL_INTERVAL_MS)
                } else {
                    // Screen turned off: Dismiss any active overlay to prevent stuck overlays upon waking
                    overlayManager.dismissCurrentOverlay()
                    currentForegroundPackage = null
                    delay(3000L)
                }
            }
        }
    }

    /**
     * Determines the currently active foreground application using UsageStatsManager.
     * Returns the most recently resumed application package name.
     */
    private fun detectForegroundPackage(): String? {
        val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            ?: return null
        val now = System.currentTimeMillis()

        // Query events from the last 15 seconds in chronological order
        val events = usageStatsManager.queryEvents(now - 15000L, now)
        val event = UsageEvents.Event()
        var latestResumedPkg: String? = null
        var latestResumeTime = 0L

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED && event.timeStamp > latestResumeTime) {
                latestResumedPkg = event.packageName
                latestResumeTime = event.timeStamp
            }
        }

        return latestResumedPkg
    }

    private suspend fun pollAndStoreEvents() {
        val db = TelemetryDatabase.getInstance(applicationContext)
        val dao = db.telemetryEventDao()

        val lastTimestamp = dao.getLastEventTimestamp()
            ?: (System.currentTimeMillis() - TimeUnit.HOURS.toMillis(1))

        val now = System.currentTimeMillis()
        val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            ?: return

        val usageEvents = usageStatsManager.queryEvents(lastTimestamp, now)
        val event = UsageEvents.Event()
        val newEvents = mutableListOf<TelemetryEvent>()

        while (usageEvents.hasNextEvent()) {
            usageEvents.getNextEvent(event)

            if (event.packageName in UsageStatsModule.TARGET_PACKAGES &&
                event.timeStamp > lastTimestamp &&
                (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED ||
                 event.eventType == UsageEvents.Event.ACTIVITY_PAUSED)
            ) {
                newEvents.add(
                    TelemetryEvent(
                        packageName = event.packageName,
                        eventType = if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED)
                            "ACTIVITY_RESUMED" else "ACTIVITY_PAUSED",
                        timestamp = event.timeStamp,
                        duration = 0
                    )
                )
            }
        }

        if (newEvents.isNotEmpty()) {
            dao.insertAll(newEvents)
            Log.d(TAG, "Stored ${newEvents.size} new telemetry events in Room")
        }

        // Clean up synced events older than 7 days
        val sevenDaysAgo = now - TimeUnit.DAYS.toMillis(7)
        dao.deleteSyncedEventsBefore(sevenDaysAgo)
    }
}
