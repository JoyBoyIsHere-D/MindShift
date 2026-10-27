package com.mindshift.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Room entity recording each intervention triggered by the Context Engine,
 * the mindlessness score that prompted it, and the user's behavioral response.
 */
@Entity(tableName = "intervention_logs")
data class InterventionLogEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    @ColumnInfo(name = "package_name")
    val packageName: String,

    @ColumnInfo(name = "timestamp")
    val timestamp: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "intervention_stage")
    val interventionStage: Int, // 1 = Ambient, 2 = Micro-Boundary, 3 = Friction Task, 4 = Hard Lock

    @ColumnInfo(name = "mindlessness_score")
    val mindlessnessScore: Double,

    @ColumnInfo(name = "user_action")
    val userAction: String, // "COMPLIED_CLOSED_APP", "OVERRIDDEN", "DISMISSED"

    @ColumnInfo(name = "synced")
    val synced: Boolean = false
)

