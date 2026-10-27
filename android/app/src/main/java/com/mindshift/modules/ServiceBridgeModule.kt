package com.mindshift.modules

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import com.mindshift.data.TelemetryDatabase
import com.mindshift.data.UserGoalEntity
import com.mindshift.engine.ContextEngine
import com.mindshift.engine.InterventionManager
import com.mindshift.overlay.OverlayWindowManager
import com.mindshift.service.TelemetryService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * React Native Bridge Module for MindShift:
 * - Service lifecycle (start, stop, status)
 * - System overlay permission checks and requests (SYSTEM_ALERT_WINDOW)
 * - User goal configuration (Exponential decay L_0 and lambda)
 * - Context Engine real-time behavioral metrics & Markov transitions
 * - Interactive manual overlay trigger for BTP presentation/testing
 */
class ServiceBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ServiceBridgeModule"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = NAME

    // =========================================================================
    // Foreground Service Management
    // =========================================================================
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

    @ReactMethod
    fun isServiceRunning(promise: Promise) {
        promise.resolve(TelemetryService.isRunning)
    }

    // =========================================================================
    // Overlay Permissions (SYSTEM_ALERT_WINDOW)
    // =========================================================================
    @ReactMethod
    fun hasOverlayPermission(promise: Promise) {
        try {
            val hasPermission = Settings.canDrawOverlays(reactApplicationContext)
            promise.resolve(hasPermission)
        } catch (e: Exception) {
            promise.reject("OVERLAY_PERMISSION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${reactApplicationContext.packageName}")
            ).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OVERLAY_REQUEST_ERROR", e.message, e)
        }
    }

    // =========================================================================
    // User Goals & Exponential Decay Configuration
    // =========================================================================
    @ReactMethod
    fun getUserGoals(promise: Promise) {
        scope.launch {
            try {
                val db = TelemetryDatabase.getInstance(reactApplicationContext)
                val goals = db.userGoalDao().getAllGoals()
                val array = Arguments.createArray()

                for (g in goals) {
                    val map = Arguments.createMap().apply {
                        putString("packageName", g.packageName)
                        putDouble("baselineDailyMinutes", (g.baselineDailyMs / 60000.0))
                        putDouble("decayRateLambda", g.decayRateLambda)
                        putDouble("startDateEpochMs", g.startDateEpochMs.toDouble())
                        putBoolean("enabled", g.enabled)
                    }
                    array.pushMap(map)
                }
                promise.resolve(array)
            } catch (e: Exception) {
                promise.reject("GET_GOALS_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun saveUserGoal(
        packageName: String,
        baselineMinutes: Double,
        decayRateLambda: Double,
        enabled: Boolean,
        promise: Promise
    ) {
        scope.launch {
            try {
                val db = TelemetryDatabase.getInstance(reactApplicationContext)
                val goal = UserGoalEntity(
                    packageName = packageName,
                    baselineDailyMs = (baselineMinutes * 60 * 1000).toLong(),
                    decayRateLambda = decayRateLambda,
                    startDateEpochMs = System.currentTimeMillis(),
                    enabled = enabled
                )
                db.userGoalDao().upsertGoal(goal)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SAVE_GOAL_ERROR", e.message, e)
            }
        }
    }

    // =========================================================================
    // Context Engine Real-Time Behavioral Metrics
    // =========================================================================
    @ReactMethod
    fun getContextMetrics(packageName: String, promise: Promise) {
        scope.launch {
            try {
                val engine = ContextEngine(reactApplicationContext)
                val manager = InterventionManager.getInstance(reactApplicationContext)
                val db = TelemetryDatabase.getInstance(reactApplicationContext)

                val goal = db.userGoalDao().getGoalForPackage(packageName)
                val allowedLimitMs = manager.computeAllowedTimeToday(goal)
                val usedTodayMs = manager.getTodayUsageForPackage(packageName)
                val usageRatio = usedTodayMs.toDouble() / allowedLimitMs.toDouble()

                val eval = engine.evaluateForegroundApp(packageName)

                val result = Arguments.createMap().apply {
                    putString("packageName", eval.packageName)
                    putDouble("mindlessnessScore", eval.mindlessnessScore)
                    putInt("launchCount30m", eval.launchCount30m)
                    putDouble("sessionVelocityDwellMs", eval.sessionVelocityDwellMs.toDouble())
                    putBoolean("isRapidLoop", eval.isRapidLoop)
                    putBoolean("isDeepWorkHour", eval.isDeepWorkHour)
                    putBoolean("isLateNightHour", eval.isLateNightHour)
                    putDouble("allowedLimitMinutes", (allowedLimitMs / 60000.0))
                    putDouble("usedTodayMinutes", (usedTodayMs / 60000.0))
                    putDouble("usageRatio", usageRatio)
                    putString("triggerReason", eval.triggerReason)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("CONTEXT_METRICS_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getTopTransitions(limit: Int, promise: Promise) {
        scope.launch {
            try {
                val engine = ContextEngine(reactApplicationContext)
                val transitions = engine.getTopTransitions(limit)
                val array = Arguments.createArray()

                for (t in transitions) {
                    val map = Arguments.createMap().apply {
                        putString("fromPackage", t.fromPackage)
                        putString("toPackage", t.toPackage)
                        putDouble("probability", t.probability)
                        putInt("count", t.count)
                    }
                    array.pushMap(map)
                }
                promise.resolve(array)
            } catch (e: Exception) {
                promise.reject("TRANSITIONS_ERROR", e.message, e)
            }
        }
    }

    // =========================================================================
    // Manual Overlay Trigger (BTP Evaluation & Testing)
    // =========================================================================
    @ReactMethod
    fun testTriggerOverlay(stage: Int, packageName: String, promise: Promise) {
        try {
            val manager = InterventionManager.getInstance(reactApplicationContext)
            manager.manualTriggerStage(stage, packageName)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OVERLAY_TEST_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun dismissOverlay(promise: Promise) {
        try {
            OverlayWindowManager.getInstance(reactApplicationContext).dismissCurrentOverlay()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DISMISS_ERROR", e.message, e)
        }
    }

    // =========================================================================
    // Overlay Intervention Stage Opt-In / Opt-Out Configuration
    // =========================================================================
    @ReactMethod
    fun getOverlayConfig(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("mindshift_overlay_prefs", Context.MODE_PRIVATE)
            val map = Arguments.createMap().apply {
                putBoolean("stage1Enabled", prefs.getBoolean("stage_1_enabled", true))
                putBoolean("stage2Enabled", prefs.getBoolean("stage_2_enabled", true))
                putBoolean("stage3Enabled", prefs.getBoolean("stage_3_enabled", true))
                putBoolean("stage4Enabled", prefs.getBoolean("stage_4_enabled", true))
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("GET_OVERLAY_CONFIG_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setOverlayStageEnabled(stage: Int, enabled: Boolean, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("mindshift_overlay_prefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("stage_${stage}_enabled", enabled).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SET_OVERLAY_CONFIG_ERROR", e.message, e)
        }
    }

    // =========================================================================
    // Intervention Logs Query
    // =========================================================================
    @ReactMethod
    fun getRecentInterventionLogs(limit: Int, promise: Promise) {
        scope.launch {
            try {
                val db = TelemetryDatabase.getInstance(reactApplicationContext)
                val logs = db.interventionLogDao().getRecentLogs(limit)
                val array = Arguments.createArray()

                for (l in logs) {
                    val map = Arguments.createMap().apply {
                        putDouble("id", l.id.toDouble())
                        putString("packageName", l.packageName)
                        putDouble("timestamp", l.timestamp.toDouble())
                        putInt("interventionStage", l.interventionStage)
                        putDouble("mindlessnessScore", l.mindlessnessScore)
                        putString("userAction", l.userAction)
                        putBoolean("synced", l.synced)
                    }
                    array.pushMap(map)
                }
                promise.resolve(array)
            } catch (e: Exception) {
                promise.reject("LOGS_ERROR", e.message, e)
            }
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        scope.cancel()
    }
}
