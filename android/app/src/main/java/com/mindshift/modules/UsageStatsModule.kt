package com.mindshift.modules

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import com.facebook.react.bridge.*
import java.util.Calendar
import kotlin.math.max

/**
 * Native module that interfaces with Android's UsageStatsManager
 * to collect app usage telemetry data.
 */
class UsageStatsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "UsageStatsModule"

        // Target social media packages to track
        val TARGET_PACKAGES = setOf(
            "com.instagram.android",
            "com.google.android.youtube",
            "com.twitter.android",
            "com.zhiliaoapp.musically",    // TikTok
            "com.facebook.katana",          // Facebook
            "com.snapchat.android",
            "com.reddit.frontpage",
            "com.linkedin.android",
            "org.telegram.messenger",
            "com.whatsapp"
        )
    }

    override fun getName(): String = NAME

    /**
     * Check if the app has been granted Usage Stats permission.
     */
    @ReactMethod
    fun checkUsagePermission(promise: Promise) {
        try {
            val appOps = reactApplicationContext
                .getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                reactApplicationContext.packageName
            )
            promise.resolve(mode == AppOpsManager.MODE_ALLOWED)
        } catch (e: Exception) {
            promise.reject("PERMISSION_CHECK_ERROR", e.message, e)
        }
    }

    /**
     * Open the system Usage Access settings screen.
     */
    @ReactMethod
    fun requestUsagePermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PERMISSION_REQUEST_ERROR", e.message, e)
        }
    }

    /**
     * Returns the subset of TARGET_PACKAGES that are ACTUALLY INSTALLED on this device.
     */
    @ReactMethod
    fun getInstalledTargetPackages(promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val installedArray = Arguments.createArray()

            for (pkg in TARGET_PACKAGES) {
                try {
                    pm.getPackageInfo(pkg, 0)
                    installedArray.pushString(pkg)
                } catch (e: PackageManager.NameNotFoundException) {
                    // Not installed on this physical device/emulator
                }
            }

            promise.resolve(installedArray)
        } catch (e: Exception) {
            promise.reject("INSTALLED_PACKAGES_ERROR", e.message, e)
        }
    }

    /**
     * Query aggregated usage statistics for a given time window.
     * Combines queryAndAggregateUsageStats with queryUsageStats for 100% Android 14+ reliability.
     */
    @ReactMethod
    fun getAggregatedStats(startTime: Double, endTime: Double, promise: Promise) {
        try {
            val usageStatsManager = reactApplicationContext
                .getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

            val startMillis = startTime.toLong()
            val endMillis = endTime.toLong()

            // 1. Initial aggregation map
            val statsMap = usageStatsManager.queryAndAggregateUsageStats(startMillis, endMillis)
            val aggregated = mutableMapOf<String, UsageStats>()
            aggregated.putAll(statsMap)

            // 2. Fallback merge with daily bucket query for Android 14+ where rolling bucket may not be finalized
            val dailyStats = usageStatsManager.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY,
                startMillis,
                endMillis
            )
            if (dailyStats != null) {
                for (stat in dailyStats) {
                    if (stat.packageName in TARGET_PACKAGES) {
                        val existing = aggregated[stat.packageName]
                        if (existing == null || stat.totalTimeInForeground > existing.totalTimeInForeground) {
                            aggregated[stat.packageName] = stat
                        }
                    }
                }
            }

            val result = Arguments.createArray()

            for ((packageName, stats) in aggregated) {
                if (packageName in TARGET_PACKAGES && stats.totalTimeInForeground > 0) {
                    val entry = Arguments.createMap().apply {
                        putString("packageName", packageName)
                        putDouble("totalTimeInForeground", stats.totalTimeInForeground.toDouble())
                        putDouble("lastTimeUsed", stats.lastTimeUsed.toDouble())
                        putDouble("firstTimestamp", stats.firstTimeStamp.toDouble())
                        putDouble("lastTimestamp", stats.lastTimeStamp.toDouble())
                    }
                    result.pushMap(entry)
                }
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("AGGREGATED_STATS_ERROR", e.message, e)
        }
    }

    /**
     * Query raw usage events for a given time window.
     */
    @ReactMethod
    fun getRawEvents(startTime: Double, endTime: Double, promise: Promise) {
        try {
            val usageStatsManager = reactApplicationContext
                .getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

            val usageEvents = usageStatsManager.queryEvents(
                startTime.toLong(), endTime.toLong()
            )

            val result = Arguments.createArray()
            val event = UsageEvents.Event()

            while (usageEvents.hasNextEvent()) {
                usageEvents.getNextEvent(event)

                if (event.packageName in TARGET_PACKAGES &&
                    (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED ||
                     event.eventType == UsageEvents.Event.ACTIVITY_PAUSED)
                ) {
                    val entry = Arguments.createMap().apply {
                        putString("packageName", event.packageName)
                        putInt("eventType", event.eventType)
                        putString("eventTypeName",
                            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED)
                                "ACTIVITY_RESUMED" else "ACTIVITY_PAUSED"
                        )
                        putDouble("timestamp", event.timeStamp.toDouble())
                        putString("className", event.className ?: "")
                    }
                    result.pushMap(entry)
                }
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("RAW_EVENTS_ERROR", e.message, e)
        }
    }

    /**
     * Convenience method: get today's stats from midnight to now.
     */
    @ReactMethod
    fun getTodayStats(promise: Promise) {
        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val startTime = calendar.timeInMillis.toDouble()
        val endTime = System.currentTimeMillis().toDouble()
        getAggregatedStats(startTime, endTime, promise)
    }
}
