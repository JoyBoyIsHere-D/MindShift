package com.mindshift.engine

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import com.mindshift.data.TelemetryDatabase
import com.mindshift.modules.UsageStatsModule
import java.util.Calendar

data class ContextEvaluationResult(
    val packageName: String,
    val mindlessnessScore: Double,
    val launchCount30m: Int,
    val sessionVelocityDwellMs: Long,
    val isRapidLoop: Boolean,
    val isDeepWorkHour: Boolean,
    val isLateNightHour: Boolean,
    val timeOfDayMultiplier: Double,
    val triggerReason: String
)

class ContextEngine(
    private val context: Context,
    private val classifier: IntentClassifier = HeuristicIntentClassifier(),
    private val loopDetector: MarkovLoopDetector = MarkovLoopDetector()
) {

    companion object {
        const val LAUNCH_WINDOW_30M = 30 * 60 * 1000L
        const val LOOKBACK_WINDOW_24H = 24 * 60 * 60 * 1000L
    }

    /**
     * Evaluates real-time behavioral features SPECIFIC to the given target application.
     */
    suspend fun evaluateForegroundApp(packageName: String): ContextEvaluationResult {
        val now = System.currentTimeMillis()
        val db = TelemetryDatabase.getInstance(context)
        val dao = db.telemetryEventDao()

        // 1. Fetch recent events from Room DB + UsageStatsManager for the last 24h
        val events24h = dao.getEventsBetween(now - LOOKBACK_WINDOW_24H, now)
        val liveEvents = queryLiveUsageEvents(now - (15 * 60 * 1000L), now)

        val allResumedEvents = mutableListOf<Pair<String, Long>>()
        val combinedResumes = (events24h.filter { it.eventType == "ACTIVITY_RESUMED" }
            .map { Pair(it.packageName, it.timestamp) } +
            liveEvents.filter { it.eventType == "ACTIVITY_RESUMED" }
            .map { Pair(it.packageName, it.timestamp) })
            .distinctBy { "${it.first}_${it.second}" }
            .sortedBy { it.second }
        allResumedEvents.addAll(combinedResumes)

        val allPausedEvents = (events24h.filter { it.eventType == "ACTIVITY_PAUSED" }
            .map { Pair(it.packageName, it.timestamp) } +
            liveEvents.filter { it.eventType == "ACTIVITY_PAUSED" }
            .map { Pair(it.packageName, it.timestamp) })
            .distinctBy { "${it.first}_${it.second}" }
            .sortedBy { it.second }

        // 2. Package-specific Launch Frequency in the last 30 minutes
        val window30mStart = now - LAUNCH_WINDOW_30M
        val packageResumes = allResumedEvents.filter { it.first == packageName }
        val launchCount30m = packageResumes.count { it.second >= window30mStart }

        // 3. Package-specific Session Velocity & Dwell Time:
        // Find when THIS specific package was paused
        val packagePaused = allPausedEvents.filter { it.first == packageName }
        val lastPausedTime = packagePaused.lastOrNull()?.second ?: 0L
        val sessionVelocityDwellMs = if (lastPausedTime > 0L) {
            (now - lastPausedTime).coerceAtLeast(0L)
        } else {
            0L
        }

        // 4. Markov Switching Loop:
        // Detect if user is in a rapid multi-app loop that INVOLVES this specific package
        val isGlobalLoop = loopDetector.isRapidLoopDetected(allResumedEvents)
        val isRapidLoop = isGlobalLoop && allResumedEvents.takeLast(4).any { it.first == packageName }

        // 5. Time-of-Day Check
        val calendar = Calendar.getInstance()
        val hour = calendar.get(Calendar.HOUR_OF_DAY)
        val isDeepWorkHour = hour in 9..16
        val isLateNightHour = hour >= 23 || hour < 4
        val timeMultiplier = if (isDeepWorkHour || isLateNightHour) {
            HeuristicIntentClassifier.TIME_OF_DAY_VULNERABILITY_MULTIPLIER
        } else {
            1.0
        }

        // 6. Build BehavioralFeatures & Classify
        val features = BehavioralFeatures(
            packageName = packageName,
            launchCount30m = launchCount30m,
            sessionVelocityDwellMs = sessionVelocityDwellMs,
            lastSessionDurationMs = 0L,
            isRapidLoop = isRapidLoop,
            isDeepWorkHour = isDeepWorkHour,
            isLateNightHour = isLateNightHour
        )

        val mindlessnessScore = classifier.classify(features)

        // 7. Formulate App-Specific Reason
        val appName = getAppShortName(packageName)
        val triggerReason = when {
            isRapidLoop -> "Rapid social switching loop involving $appName"
            sessionVelocityDwellMs in 1..59_999 -> "Compulsive reopening: $appName reopened ${sessionVelocityDwellMs / 1000}s after exit"
            launchCount30m >= 3 && (isDeepWorkHour || isLateNightHour) -> "High velocity: $launchCount30m launches of $appName in 30m during vulnerable hours"
            launchCount30m >= 3 -> "High launch velocity: $launchCount30m launches of $appName in 30m"
            launchCount30m > 0 && isLateNightHour -> "Late-night usage of $appName (circadian risk)"
            launchCount30m > 0 && isDeepWorkHour -> "$appName opened during academic deep-work window"
            launchCount30m > 0 -> "Normal recent usage ($launchCount30m launches in 30m)"
            else -> "Idle baseline (0 launches of $appName in last 30m)"
        }

        return ContextEvaluationResult(
            packageName = packageName,
            mindlessnessScore = mindlessnessScore,
            launchCount30m = launchCount30m,
            sessionVelocityDwellMs = sessionVelocityDwellMs,
            isRapidLoop = isRapidLoop,
            isDeepWorkHour = isDeepWorkHour,
            isLateNightHour = isLateNightHour,
            timeOfDayMultiplier = timeMultiplier,
            triggerReason = triggerReason
        )
    }

    /**
     * Helper to retrieve top Markov transition pairs over the last 24h.
     */
    suspend fun getTopTransitions(limit: Int = 3): List<MarkovLoopDetector.TransitionSummary> {
        val now = System.currentTimeMillis()
        val db = TelemetryDatabase.getInstance(context)
        val dao = db.telemetryEventDao()

        val events = dao.getEventsBetween(now - LOOKBACK_WINDOW_24H, now)
        val resumes = events
            .filter { it.eventType == "ACTIVITY_RESUMED" && it.packageName in UsageStatsModule.TARGET_PACKAGES }
            .sortedBy { it.timestamp }
            .map { Pair(it.packageName, it.timestamp) }

        return loopDetector.getTopTransitions(resumes, limit)
    }

    private fun queryLiveUsageEvents(startTime: Long, endTime: Long): List<LiveEventItem> {
        val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            ?: return emptyList()

        val events = usageStatsManager.queryEvents(startTime, endTime)
        val list = mutableListOf<LiveEventItem>()
        val ev = UsageEvents.Event()

        while (events.hasNextEvent()) {
            events.getNextEvent(ev)
            if (ev.packageName in UsageStatsModule.TARGET_PACKAGES) {
                if (ev.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                    list.add(LiveEventItem(ev.packageName, "ACTIVITY_RESUMED", ev.timeStamp))
                } else if (ev.eventType == UsageEvents.Event.ACTIVITY_PAUSED) {
                    list.add(LiveEventItem(ev.packageName, "ACTIVITY_PAUSED", ev.timeStamp))
                }
            }
        }
        return list
    }

    private fun getAppShortName(packageName: String): String {
        return when (packageName) {
            "com.instagram.android" -> "Instagram"
            "com.google.android.youtube" -> "YouTube"
            "com.twitter.android" -> "X/Twitter"
            "com.zhiliaoapp.musically" -> "TikTok"
            "com.facebook.katana" -> "Facebook"
            "com.snapchat.android" -> "Snapchat"
            "com.reddit.frontpage" -> "Reddit"
            "com.linkedin.android" -> "LinkedIn"
            "org.telegram.messenger" -> "Telegram"
            "com.whatsapp" -> "WhatsApp"
            else -> packageName.split('.').lastOrNull() ?: packageName
        }
    }

    private data class LiveEventItem(
        val packageName: String,
        val eventType: String,
        val timestamp: Long
    )
}
