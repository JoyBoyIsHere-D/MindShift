package com.mindshift.modules

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.*
import com.mindshift.service.TelemetryService

/**
 * Bridge module to start/stop the TelemetryService from JavaScript.
 */
class ServiceBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ServiceBridgeModule"
    }

    override fun getName(): String = NAME

    /**
     * Start the persistent telemetry foreground service.
     */
    @ReactMethod
    fun startService(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, TelemetryService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SERVICE_START_ERROR", e.message, e)
        }
    }

    /**
     * Stop the telemetry foreground service.
     */
    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, TelemetryService::class.java)
            reactApplicationContext.stopService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SERVICE_STOP_ERROR", e.message, e)
        }
    }

    /**
     * Check if the service is currently running.
     */
    @ReactMethod
    fun isServiceRunning(promise: Promise) {
        promise.resolve(TelemetryService.isRunning)
    }
}
