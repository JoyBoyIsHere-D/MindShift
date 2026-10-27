package com.mindshift.engine

import com.mindshift.modules.UsageStatsModule

/**
 * Detects rapid social media switching loops and computes transition matrices
 * between the 10 target social media applications over recent sessions.
 */
class MarkovLoopDetector {

    data class TransitionSummary(
        val fromPackage: String,
        val toPackage: String,
        val probability: Double,
        val count: Int
    )

    companion object {
        // Window defining a rapid multi-app hopping session
        const val RAPID_LOOP_WINDOW_MS = 3 * 60 * 1000L // 3 minutes
        const val MIN_DISTINCT_APPS_FOR_LOOP = 3
    }

    /**
     * Checks if the user is currently trapped in a rapid app-switching loop.
     * Criteria:
     * 1. At least 3 distinct target packages opened within the last 3 minutes, OR
     * 2. Rapid bounce-back pattern (e.g. App A -> App B -> App A within 3 minutes).
     *
     * @param recentResumes Chronological list of (packageName, timestamp) where latest is at the end
     */
    fun isRapidLoopDetected(recentResumes: List<Pair<String, Long>>): Boolean {
        if (recentResumes.size < 2) return false

        val latestTime = recentResumes.last().second
        val windowStart = latestTime - RAPID_LOOP_WINDOW_MS

        val windowEvents = recentResumes.filter { it.second >= windowStart }
        if (windowEvents.size < 2) return false

        // Check criterion 1: 3+ distinct target apps launched within 3 minutes
        val distinctApps = windowEvents.map { it.first }.toSet()
        if (distinctApps.size >= MIN_DISTINCT_APPS_FOR_LOOP) {
            return true
        }

        // Check criterion 2: Rapid bounce-back cycle (A -> B -> A)
        if (windowEvents.size >= 3) {
            val n = windowEvents.size
            val appCurrent = windowEvents[n - 1].first
            val appPrev1 = windowEvents[n - 2].first
            val appPrev2 = windowEvents[n - 3].first

            if (appCurrent == appPrev2 && appCurrent != appPrev1) {
                return true
            }
        }

        return false
    }

    /**
     * Builds an empirical transition probability matrix P(toPackage | fromPackage)
     * based on sequential app switch events in the provided list.
     *
     * @param chronologicalResumes Chronological list of (packageName, timestamp)
     */
    fun computeTransitionMatrix(
        chronologicalResumes: List<Pair<String, Long>>
    ): Map<Pair<String, String>, Double> {
        if (chronologicalResumes.size < 2) return emptyMap()

        val transitionCounts = mutableMapOf<Pair<String, String>, Int>()
        val fromCounts = mutableMapOf<String, Int>()

        for (i in 0 until chronologicalResumes.size - 1) {
            val fromPkg = chronologicalResumes[i].first
            val toPkg = chronologicalResumes[i + 1].first

            // We only track transitions between distinct target apps
            if (fromPkg != toPkg &&
                fromPkg in UsageStatsModule.TARGET_PACKAGES &&
                toPkg in UsageStatsModule.TARGET_PACKAGES
            ) {
                val pair = Pair(fromPkg, toPkg)
                transitionCounts[pair] = (transitionCounts[pair] ?: 0) + 1
                fromCounts[fromPkg] = (fromCounts[fromPkg] ?: 0) + 1
            }
        }

        val probabilities = mutableMapOf<Pair<String, String>, Double>()
        for ((pair, count) in transitionCounts) {
            val totalFrom = fromCounts[pair.first] ?: 1
            probabilities[pair] = count.toDouble() / totalFrom.toDouble()
        }

        return probabilities
    }

    /**
     * Extracts the top N most frequent app transition pairs for visualization in the UI.
     */
    fun getTopTransitions(
        chronologicalResumes: List<Pair<String, Long>>,
        limit: Int = 3
    ): List<TransitionSummary> {
        if (chronologicalResumes.size < 2) return emptyList()

        val transitionCounts = mutableMapOf<Pair<String, String>, Int>()
        val fromCounts = mutableMapOf<String, Int>()

        for (i in 0 until chronologicalResumes.size - 1) {
            val fromPkg = chronologicalResumes[i].first
            val toPkg = chronologicalResumes[i + 1].first

            if (fromPkg != toPkg &&
                fromPkg in UsageStatsModule.TARGET_PACKAGES &&
                toPkg in UsageStatsModule.TARGET_PACKAGES
            ) {
                val pair = Pair(fromPkg, toPkg)
                transitionCounts[pair] = (transitionCounts[pair] ?: 0) + 1
                fromCounts[fromPkg] = (fromCounts[fromPkg] ?: 0) + 1
            }
        }

        return transitionCounts.entries
            .sortedByDescending { it.value }
            .take(limit)
            .map { entry ->
                val totalFrom = fromCounts[entry.key.first] ?: 1
                TransitionSummary(
                    fromPackage = entry.key.first,
                    toPackage = entry.key.second,
                    probability = (entry.value.toDouble() / totalFrom.toDouble()),
                    count = entry.value
                )
            }
    }
}

