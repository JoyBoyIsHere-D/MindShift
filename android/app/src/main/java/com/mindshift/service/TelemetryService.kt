package com.mindshift.service

import android.app.*
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.mindshift.MainApplication
import com.mindshift.MainActivity
import com.mindshift.data.TelemetryDatabase
import com.mindshift.data.TelemetryEvent
import com.mindshift.modules.UsageStatsModule
import kotlinx.coroutines.*
import java.util.concurrent.TimeUnit

/**
 * Persistent foreground service that periodically polls UsageStatsManager
 * for new events and writes them to the local Room database.
 *
 * Compliant with Android 14+ foreground service restrictions by using
 * the FOREGROUND_SERVICE_SPECIAL_USE type.
 *
 * Polling interval: 5 minutes (configurable)
 */
class TelemetryService : Service() {

    companion object {
        const val TAG = "TelemetryService"
        const val NOTIFICATION_ID = 1001
        const val POLL_INTERVAL_MS = 5 * 60 * 1000L  // 5 minutes

        @Volatile
        var isRunning: Boolean = false
            private set
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var pollingJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "TelemetryService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "TelemetryService onStartCommand")

        // Start as foreground with persistent notification
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14+: specify the foreground service type
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        isRunning = true
        startPolling()

        // If killed, restart automatically
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "TelemetryService destroyed")
        isRunning = false
        pollingJob?.cancel()
        serviceScope.cancel()
    }

    /**
     * Build the persistent low-priority notification.
     */
    private fun buildNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, MainApplication.CHANNEL_ID)
            .setContentTitle("MindShift")
            .setContentText("Telemetry active for BTP")
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    /**
     * Start the periodic polling coroutine.
     * Polls UsageStatsManager every POLL_INTERVAL_MS and writes new events to Room.
     */
    private fun startPolling() {
        pollingJob?.cancel()
        pollingJob = serviceScope.launch {
            while (isActive) {
                try {
                    pollAndStoreEvents()
                } catch (e: Exception) {
                    Log.e(TAG, "Error during polling: ${e.message}", e)
                }
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    /**
     * Query UsageStatsManager for events since the last recorded event
     * and store new ones in the Room database.
     */
    private suspend fun pollAndStoreEvents() {
        val db = TelemetryDatabase.getInstance(applicationContext)
        val dao = db.telemetryEventDao()

        // Get the timestamp of the last recorded event, or default to 1 hour ago
        val lastTimestamp = dao.getLastEventTimestamp()
            ?: (System.currentTimeMillis() - TimeUnit.HOURS.toMillis(1))

        val now = System.currentTimeMillis()

        val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            ?: run {
                Log.e(TAG, "UsageStatsManager not available")
                return
            }

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
                        duration = 0  // Duration is computed during analysis, not collection
                    )
                )
            }
        }

        if (newEvents.isNotEmpty()) {
            dao.insertAll(newEvents)
            Log.d(TAG, "Stored ${newEvents.size} new telemetry events")
        } else {
            Log.d(TAG, "No new events found in this polling cycle")
        }

        // Housekeeping: clean up synced events older than 7 days
        val sevenDaysAgo = now - TimeUnit.DAYS.toMillis(7)
        dao.deleteSyncedEventsBefore(sevenDaysAgo)
    }
}
