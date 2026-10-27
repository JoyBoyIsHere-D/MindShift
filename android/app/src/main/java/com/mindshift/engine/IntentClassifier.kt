package com.mindshift.engine

import kotlin.math.min
import kotlin.math.max

/**
 * Normalized behavioral features extracted for a specific target package.
 */
data class BehavioralFeatures(
    val packageName: String,
    val launchCount30m: Int,
    val sessionVelocityDwellMs: Long, // Time elapsed since this specific app paused (rapid reopen)
    val lastSessionDurationMs: Long,  // Duration of the immediate prior session
    val isRapidLoop: Boolean,          // Whether this app is part of an active Markov switching loop
    val isDeepWorkHour: Boolean,       // Academic/deep-work hours: 09:00 - 17:00
    val isLateNightHour: Boolean       // Late-night doomscrolling hours: 23:00 - 04:00
)

/**
 * Interface for mindlessness intent classification.
 */
interface IntentClassifier {
    fun classify(features: BehavioralFeatures): Double
}

/**
 * Multi-factor heuristic classifier computing package-specific mindlessness scores.
 */
class HeuristicIntentClassifier : IntentClassifier {

    companion object {
        const val TIME_OF_DAY_VULNERABILITY_MULTIPLIER = 1.30
        const val RAPID_REOPEN_THRESHOLD_MS = 60_000L     // < 1 min is very high mindlessness
        const val MODERATE_REOPEN_THRESHOLD_MS = 300_000L // < 5 mins
    }

    override fun classify(features: BehavioralFeatures): Double {
        // If app hasn't been launched recently and is not in an active loop, baseline is minimal
        if (features.launchCount30m == 0 && !features.isRapidLoop && features.sessionVelocityDwellMs <= 0L) {
            return 0.05 // 5% nominal baseline
        }

        // 1. Launch frequency normalized for this package (e.g. 5+ launches in last 30m = 1.0)
        val launchFreqScore = min(1.0, features.launchCount30m / 5.0)

        // 2. Dwell time / session velocity score:
        // Rapidly reopening within 60s of pausing indicates compulsive habitual checking
        val dwellScore = when {
            features.sessionVelocityDwellMs <= 0L -> 0.0
            features.sessionVelocityDwellMs < RAPID_REOPEN_THRESHOLD_MS -> 1.0
            features.sessionVelocityDwellMs < MODERATE_REOPEN_THRESHOLD_MS -> 0.50
            else -> 0.10
        }

        // 3. Markov rapid loop flag
        val loopScore = if (features.isRapidLoop) 1.0 else 0.0

        // 4. Combined base score (weighted combination)
        val baseScore = (0.40 * launchFreqScore) + (0.35 * dwellScore) + (0.25 * loopScore)

        // 5. Time-of-day vulnerability multiplier only applies if there is actual activity
        val multiplier = if ((features.isDeepWorkHour || features.isLateNightHour) && baseScore > 0.1) {
            TIME_OF_DAY_VULNERABILITY_MULTIPLIER
        } else {
            1.0
        }

        val adjustedScore = baseScore * multiplier
        return max(0.0, min(1.0, adjustedScore))
    }
}
