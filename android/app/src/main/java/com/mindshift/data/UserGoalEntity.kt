package com.mindshift.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Room entity representing user-defined or adaptive daily goals per package.
 * Implements exponential decay parameterization: L_t = L_0 * e^(-lambda * t)
 */
@Entity(tableName = "user_goals")
data class UserGoalEntity(
    @PrimaryKey
    @ColumnInfo(name = "package_name")
    val packageName: String,

    @ColumnInfo(name = "baseline_daily_ms")
    val baselineDailyMs: Long, // L_0 in milliseconds (e.g. 45 min = 2,700,000 ms)

    @ColumnInfo(name = "decay_rate_lambda")
    val decayRateLambda: Double = 0.02, // lambda (default 0.02/day ~13% weekly reduction)

    @ColumnInfo(name = "start_date_epoch_ms")
    val startDateEpochMs: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "enabled")
    val enabled: Boolean = true
)

