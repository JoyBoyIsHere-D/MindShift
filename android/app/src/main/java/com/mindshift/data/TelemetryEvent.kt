package com.mindshift.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.ColumnInfo

/**
 * Room entity representing a single telemetry event.
 * Stores app usage events with timestamps and sync status.
 */
@Entity(tableName = "telemetry_events")
data class TelemetryEvent(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    @ColumnInfo(name = "package_name")
    val packageName: String,

    @ColumnInfo(name = "event_type")
    val eventType: String,   // "ACTIVITY_RESUMED", "ACTIVITY_PAUSED", "SESSION_SUMMARY"

    @ColumnInfo(name = "timestamp")
    val timestamp: Long,     // epoch millis when the event occurred

    @ColumnInfo(name = "duration")
    val duration: Long = 0,  // duration in millis (for SESSION_SUMMARY events)

    @ColumnInfo(name = "recorded_at")
    val recordedAt: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "synced")
    val synced: Boolean = false
)
