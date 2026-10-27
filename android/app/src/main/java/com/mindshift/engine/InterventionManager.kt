package com.mindshift.engine

import android.app.usage.UsageStatsManager
import android.content.Context
import android.util.Log
import com.mindshift.data.TelemetryDatabase
import com.mindshift.data.UserGoalEntity
import com.mindshift.overlay.OverlayWindowManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Calendar
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlin.math.exp
import kotlin.math.max

/**
 * Manages the algorithmic escalation policy, exponential decay allowances,
 * session cooldowns, and coordinates with OverlayWindowManager.
 */
class InterventionManager(private val context: Context) {

    companion object {
        const val TAG = "InterventionManager"
        const val COOLDOWN_DURATION_MS = 3 * 60 * 1000L // 3 minutes cooldown after override

        @Volatile
        private var instance: InterventionManager? = null

        fun getInstance(context: Context): InterventionManager {
            return instance ?: synchronized(this) {
                val inst = InterventionManager(context.applicationContext)
                instance = inst
                inst
            }
        }
    }

    private val contextEngine = ContextEngine(context)
    private val overlayManager = OverlayWindowManager.getInstance(context)

    // Maps packageName -> timestamp until which interventions for this app are silenced
    private val sessionCooldowns = ConcurrentHashMap<String, Long>()

    /**
     * Sets a temporary cooldown when user explicitly overrides Stage 2 or Stage 3.
     */
    fun setSessionCooldown(packageName: String, durationMs: Long = COOLDOWN_DURATION_MS) {
        sessionCooldowns[packageName] = System.currentTimeMillis() + durationMs
    }

    fun isUnderCooldown(packageName: String): Boolean {
        val expireTime = sessionCooldowns[packageName] ?: return false
        return System.currentTimeMillis() < expireTime
    }

    /**
     * Calculate today's Exponential Decay Allowance L_t = L_0 * e^(-lambda * t)
     */
    fun computeAllowedTimeToday(goal: UserGoalEntity?): Long {
        val baselineMs = goal?.baselineDailyMs ?: (45 * 60 * 1000L) // Default 45 mins
        val lambda = goal?.decayRateLambda ?: 0.02                    // Default 0.02 (~13% weekly decay)
        val startDate = goal?.startDateEpochMs ?: System.currentTimeMillis()

        val now = System.currentTimeMillis()
        val daysElapsed = max(0.0, (now - startDate).toDouble() / (24.0 * 3600.0 * 1000.0))

        val decayFactor = exp(-lambda * daysElapsed)
        val allowedMs = (baselineMs * decayFactor).toLong()

        // Floor to at least 5 minutes to avoid dividing by 0 or unreasonable lockdown
        return max(5 * 60 * 1000L, allowedMs)
    }

    /**
     * Queries Android UsageStatsManager for foreground milliseconds of package today (from 00:00:00).
     */
    fun getTodayUsageForPackage(packageName: String): Long {
        return try {
            val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
                ?: return 0L

            val calendar = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }
            val startOfDay = calendar.timeInMillis
            val now = System.currentTimeMillis()

            var foregroundMs = 0L

            // 1. Query aggregated map
            val statsMap = usageStatsManager.queryAndAggregateUsageStats(startOfDay, now)
            val aggregatedTime = statsMap[packageName]?.totalTimeInForeground ?: 0L
            if (aggregatedTime > foregroundMs) {
                foregroundMs = aggregatedTime
            }

            // 2. Query daily interval buckets (handles Android 14 rolling intervals)
            val dailyStats = usageStatsManager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startOfDay, now)
            if (dailyStats != null) {
                for (stat in dailyStats) {
                    if (stat.packageName == packageName && stat.totalTimeInForeground > foregroundMs) {
                        foregroundMs = stat.totalTimeInForeground
                    }
                }
            }

            foregroundMs
        } catch (e: Exception) {
            Log.e(TAG, "Error querying today's usage for $packageName: ${e.message}")
            0L
        }
    }

    /**
     * Checks if a particular escalation overlay stage is opted-in by user.
     */
    fun isStageEnabled(stage: Int): Boolean {
        val prefs = context.getSharedPreferences("mindshift_overlay_prefs", Context.MODE_PRIVATE)
        return prefs.getBoolean("stage_${stage}_enabled", true)
    }

    /**
     * Finds the highest enabled intervention stage at or below the recommended stage.
     * If user opted out of a stage, gracefully steps down to a lighter enabled stage.
     */
    fun getEffectiveStage(recommendedStage: Int): Int {
        var stage = recommendedStage
        while (stage > 0) {
            if (isStageEnabled(stage)) {
                return stage
            }
            stage--
        }
        return 0
    }

    /**
     * Real-time evaluation triggered when a target package enters the foreground.
     */
    suspend fun evaluateAndTrigger(packageName: String) = withContext(Dispatchers.IO) {
        try {
            val db = TelemetryDatabase.getInstance(context)
            val goal = db.userGoalDao().getGoalForPackage(packageName)

            if (goal != null && !goal.enabled) {
                Log.d(TAG, "Interventions disabled for package $packageName")
                return@withContext
            }

            // 1. Calculate Exponential Decay Allowance & Today's Usage
            val allowedLimitMs = computeAllowedTimeToday(goal)
            val usedTodayMs = getTodayUsageForPackage(packageName)
            val usageRatio = usedTodayMs.toDouble() / allowedLimitMs.toDouble()

            // 2. Evaluate Context Engine
            val contextResult = contextEngine.evaluateForegroundApp(packageName)
            val score = contextResult.mindlessnessScore
            val isLoop = contextResult.isRapidLoop

            // 3. Select Intervention Stage based on Escalation Policy:
            // - Stage 4: Hard Lock (Limit exceeded)
            // - Stage 3: Progressive Friction (mindlessness >= 0.75 or 80-100% of daily limit)
            // - Stage 2: Micro-Boundary (Default mindful entry pause on target app launch)
            val recommendedStage = when {
                usageRatio >= 1.0 -> 4
                score >= 0.75 || usageRatio >= 0.80 -> 3
                else -> 2 // Breathing micro-boundary on social media launch
            }

            // 4. Respect user opt-in/opt-out toggles with graceful step-down
            val selectedStage = getEffectiveStage(recommendedStage)

            Log.d(TAG, "Evaluation for $packageName: score=%.2f, ratio=%.2f, rec=$recommendedStage, eff=$selectedStage"
                .format(score, usageRatio))

            if (selectedStage == 0) {
                // User opted out of all applicable overlays
                overlayManager.dismissCurrentOverlay()
                return@withContext
            }

            // 5. Check Cooldown for Stages 2 & 3
            if (isUnderCooldown(packageName) && (selectedStage == 2 || selectedStage == 3)) {
                Log.d(TAG, "Package $packageName is under cooldown. Showing Stage 1 pill if enabled.")
                if (isStageEnabled(1)) {
                    overlayManager.showOverlay(
                        stage = 1,
                        packageName = packageName,
                        mindlessnessScore = score,
                        triggerReason = contextResult.triggerReason,
                        usageRatio = usageRatio,
                        limitMs = allowedLimitMs,
                        usedMs = usedTodayMs
                    )
                }
                return@withContext
            }

            // Trigger selected stage
            overlayManager.showOverlay(
                stage = selectedStage,
                packageName = packageName,
                mindlessnessScore = score,
                triggerReason = contextResult.triggerReason,
                usageRatio = usageRatio,
                limitMs = allowedLimitMs,
                usedMs = usedTodayMs,
                isManual = false
            )

        } catch (e: Exception) {
            Log.e(TAG, "Error in evaluateAndTrigger for $packageName: ${e.message}", e)
        }
    }

    /**
     * Manual trigger for BTP presentation, demonstration, and debugging.
     */
    fun manualTriggerStage(stage: Int, packageName: String) {
        val goal = UserGoalEntity(
            packageName = packageName,
            baselineDailyMs = 45 * 60 * 1000L,
            decayRateLambda = 0.02
        )
        val limitMs = computeAllowedTimeToday(goal)
        val usedMs = (limitMs * (0.25 * stage)).toLong()
        val ratio = usedMs.toDouble() / limitMs.toDouble()

        val sampleReason = when (stage) {
            1 -> "Ambient baseline awareness: tracking session velocity"
            2 -> "Rapid app-switching loop detected (3+ target apps opened in 3 mins)"
            3 -> "High mindlessness velocity score (0.84) during deep-work hours"
            4 -> "Daily exponential step-down limit reached (45m max)"
            else -> "Manual evaluation trigger"
        }

        overlayManager.showOverlay(
            stage = stage,
            packageName = packageName,
            mindlessnessScore = 0.25 * stage,
            triggerReason = sampleReason,
            usageRatio = ratio,
            limitMs = limitMs,
            usedMs = usedMs,
            isManual = true
        )
    }
}

