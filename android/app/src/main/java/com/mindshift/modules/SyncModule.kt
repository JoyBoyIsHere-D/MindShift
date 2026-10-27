package com.mindshift.modules

import com.facebook.react.bridge.*
import com.mindshift.data.TelemetryDatabase
import com.mindshift.data.TelemetryEvent
import com.mindshift.data.InterventionLogEntity
import com.google.gson.Gson
import kotlinx.coroutines.*
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Module for syncing local telemetry data and intervention compliance logs to the cloud backend.
 * Batches unsynced rows and pushes them via REST API.
 */
class SyncModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "SyncModule"
        // Default to local mock server on Android Emulator (10.0.2.2 points to host localhost)
        var syncEndpoint: String = "http://10.0.2.2:3000/api/telemetry/sync"
        const val BATCH_SIZE = 100
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val gson = Gson()

    override fun getName(): String = NAME

    /**
     * Configure custom backend URL dynamically from React Native
     */
    @ReactMethod
    fun setSyncEndpoint(endpoint: String, promise: Promise) {
        syncEndpoint = endpoint
        promise.resolve(true)
    }

    /**
     * Sync all unsynced telemetry events and intervention logs to the cloud backend.
     */
    @ReactMethod
    fun syncToCloud(promise: Promise) {
        scope.launch {
            try {
                val db = TelemetryDatabase.getInstance(reactApplicationContext)
                val eventDao = db.telemetryEventDao()
                val logDao = db.interventionLogDao()

                var totalSynced = 0

                // 1. Sync telemetry events
                var unsyncedEvents = eventDao.getUnsyncedEvents(BATCH_SIZE)
                while (unsyncedEvents.isNotEmpty()) {
                    val success = pushBatchToServer(events = unsyncedEvents, logs = emptyList())
                    if (success) {
                        val ids = unsyncedEvents.map { it.id }
                        eventDao.markAsSynced(ids)
                        totalSynced += unsyncedEvents.size
                        unsyncedEvents = eventDao.getUnsyncedEvents(BATCH_SIZE)
                    } else {
                        promise.reject("SYNC_ERROR", "Failed to push telemetry events batch to server")
                        return@launch
                    }
                }

                // 2. Sync intervention compliance logs
                var unsyncedLogs = logDao.getUnsyncedLogs(BATCH_SIZE)
                while (unsyncedLogs.isNotEmpty()) {
                    val success = pushBatchToServer(events = emptyList(), logs = unsyncedLogs)
                    if (success) {
                        val ids = unsyncedLogs.map { it.id }
                        logDao.markAsSynced(ids)
                        totalSynced += unsyncedLogs.size
                        unsyncedLogs = logDao.getUnsyncedLogs(BATCH_SIZE)
                    } else {
                        promise.reject("SYNC_ERROR", "Failed to push intervention logs batch to server")
                        return@launch
                    }
                }

                val result = Arguments.createMap().apply {
                    putInt("syncedCount", totalSynced)
                    putBoolean("success", true)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("SYNC_ERROR", e.message, e)
            }
        }
    }

    /**
     * Get the combined count of unsynced events + intervention logs.
     */
    @ReactMethod
    fun getUnsyncedCount(promise: Promise) {
        scope.launch {
            try {
                val db = TelemetryDatabase.getInstance(reactApplicationContext)
                val eventCount = db.telemetryEventDao().getUnsyncedCount()
                val logCount = db.interventionLogDao().getUnsyncedCount()
                promise.resolve(eventCount + logCount)
            } catch (e: Exception) {
                promise.reject("COUNT_ERROR", e.message, e)
            }
        }
    }

    /**
     * Get total number of events and intervention logs stored locally.
     */
    @ReactMethod
    fun getTotalEventCount(promise: Promise) {
        scope.launch {
            try {
                val db = TelemetryDatabase.getInstance(reactApplicationContext)
                val eventCount = db.telemetryEventDao().getTotalCount()
                val logCount = db.interventionLogDao().getTotalCount()
                promise.resolve(eventCount + logCount)
            } catch (e: Exception) {
                promise.reject("COUNT_ERROR", e.message, e)
            }
        }
    }

    private fun pushBatchToServer(
        events: List<TelemetryEvent>,
        logs: List<InterventionLogEntity>
    ): Boolean {
        return try {
            val url = URL(syncEndpoint)
            val connection = url.openConnection() as HttpURLConnection
            connection.apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
                connectTimeout = 15000
                readTimeout = 15000
            }

            val payloadMap = mutableMapOf<String, Any>()

            if (events.isNotEmpty()) {
                payloadMap["events"] = events.map { event ->
                    mapOf(
                        "packageName" to event.packageName,
                        "eventType" to event.eventType,
                        "timestamp" to event.timestamp,
                        "duration" to event.duration,
                        "recordedAt" to event.recordedAt
                    )
                }
            }

            if (logs.isNotEmpty()) {
                payloadMap["interventionLogs"] = logs.map { log ->
                    mapOf(
                        "packageName" to log.packageName,
                        "timestamp" to log.timestamp,
                        "interventionStage" to log.interventionStage,
                        "mindlessnessScore" to log.mindlessnessScore,
                        "userAction" to log.userAction
                    )
                }
            }

            val jsonPayload = gson.toJson(payloadMap)

            val writer = OutputStreamWriter(connection.outputStream)
            writer.write(jsonPayload)
            writer.flush()
            writer.close()

            val responseCode = connection.responseCode
            connection.disconnect()

            responseCode in 200..299
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        scope.cancel()
    }
}
