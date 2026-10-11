package com.mindshift.modules

import com.facebook.react.bridge.*
import com.mindshift.data.TelemetryDatabase
import com.mindshift.data.TelemetryEvent
import com.google.gson.Gson
import kotlinx.coroutines.*
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Module for syncing local telemetry data to the cloud backend.
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
     * Sync all unsynced telemetry events to the cloud backend.
     * Batches events, sends them as JSON, and marks them as synced.
     */
    @ReactMethod
    fun syncToCloud(promise: Promise) {
        scope.launch {
            try {
                val db = TelemetryDatabase.getInstance(reactApplicationContext)
                val dao = db.telemetryEventDao()

                var totalSynced = 0
                var unsyncedEvents = dao.getUnsyncedEvents(BATCH_SIZE)

                while (unsyncedEvents.isNotEmpty()) {
                    val success = pushBatchToServer(unsyncedEvents)

                    if (success) {
                        val ids = unsyncedEvents.map { it.id }
                        dao.markAsSynced(ids)
                        totalSynced += unsyncedEvents.size
                        unsyncedEvents = dao.getUnsyncedEvents(BATCH_SIZE)
                    } else {
                        promise.reject("SYNC_ERROR", "Failed to push batch to server")
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
     * Get the count of unsynced events.
     */
    @ReactMethod
    fun getUnsyncedCount(promise: Promise) {
        scope.launch {
            try {
                val db = TelemetryDatabase.getInstance(reactApplicationContext)
                val count = db.telemetryEventDao().getUnsyncedCount()
                promise.resolve(count)
            } catch (e: Exception) {
                promise.reject("COUNT_ERROR", e.message, e)
            }
        }
    }

    /**
     * Get total number of events stored locally.
     */
    @ReactMethod
    fun getTotalEventCount(promise: Promise) {
        scope.launch {
            try {
                val db = TelemetryDatabase.getInstance(reactApplicationContext)
                val count = db.telemetryEventDao().getTotalCount()
                promise.resolve(count)
            } catch (e: Exception) {
                promise.reject("COUNT_ERROR", e.message, e)
            }
        }
    }

    private fun pushBatchToServer(events: List<TelemetryEvent>): Boolean {
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

            val jsonPayload = gson.toJson(mapOf(
                "events" to events.map { event ->
                    mapOf(
                        "packageName" to event.packageName,
                        "eventType" to event.eventType,
                        "timestamp" to event.timestamp,
                        "duration" to event.duration,
                        "recordedAt" to event.recordedAt
                    )
                }
            ))

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
