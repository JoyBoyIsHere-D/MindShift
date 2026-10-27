package com.mindshift.data

import androidx.room.*

/**
 * Data Access Object for recording and querying intervention events and user compliance.
 */
@Dao
interface InterventionLogDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(log: InterventionLogEntity): Long

    @Query("SELECT * FROM intervention_logs WHERE synced = 0 ORDER BY timestamp ASC LIMIT :limit")
    suspend fun getUnsyncedLogs(limit: Int): List<InterventionLogEntity>

    @Query("UPDATE intervention_logs SET synced = 1 WHERE id IN (:ids)")
    suspend fun markAsSynced(ids: List<Long>)

    @Query("SELECT * FROM intervention_logs WHERE package_name = :packageName AND timestamp >= :since ORDER BY timestamp DESC")
    suspend fun getRecentLogsForPackage(packageName: String, since: Long): List<InterventionLogEntity>

    @Query("SELECT * FROM intervention_logs ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getRecentLogs(limit: Int): List<InterventionLogEntity>

    @Query("SELECT COUNT(*) FROM intervention_logs WHERE synced = 0")
    suspend fun getUnsyncedCount(): Int

    @Query("SELECT COUNT(*) FROM intervention_logs")
    suspend fun getTotalCount(): Int

    @Query("SELECT COUNT(*) FROM intervention_logs WHERE intervention_stage = :stage AND user_action = 'COMPLIED_CLOSED_APP'")
    suspend fun getComplianceCountForStage(stage: Int): Int

    @Query("SELECT COUNT(*) FROM intervention_logs WHERE intervention_stage = :stage")
    suspend fun getTotalCountForStage(stage: Int): Int
}

