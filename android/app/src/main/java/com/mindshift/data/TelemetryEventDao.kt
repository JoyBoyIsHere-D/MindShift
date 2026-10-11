package com.mindshift.data

import androidx.room.*

/**
 * Data Access Object for telemetry events.
 */
@Dao
interface TelemetryEventDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(event: TelemetryEvent): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(events: List<TelemetryEvent>)

    @Query("SELECT * FROM telemetry_events WHERE synced = 0 ORDER BY timestamp ASC LIMIT :limit")
    suspend fun getUnsyncedEvents(limit: Int): List<TelemetryEvent>

    @Query("UPDATE telemetry_events SET synced = 1 WHERE id IN (:ids)")
    suspend fun markAsSynced(ids: List<Long>)

    @Query("SELECT COUNT(*) FROM telemetry_events WHERE synced = 0")
    suspend fun getUnsyncedCount(): Int

    @Query("SELECT COUNT(*) FROM telemetry_events")
    suspend fun getTotalCount(): Int

    @Query("SELECT * FROM telemetry_events WHERE timestamp >= :startTime AND timestamp <= :endTime ORDER BY timestamp ASC")
    suspend fun getEventsBetween(startTime: Long, endTime: Long): List<TelemetryEvent>

    @Query("SELECT MAX(timestamp) FROM telemetry_events WHERE event_type != 'SESSION_SUMMARY'")
    suspend fun getLastEventTimestamp(): Long?

    @Query("DELETE FROM telemetry_events WHERE synced = 1 AND recorded_at < :beforeTimestamp")
    suspend fun deleteSyncedEventsBefore(beforeTimestamp: Long)
}
