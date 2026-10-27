package com.mindshift.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Room database for storing telemetry events, user goals, and intervention logs locally.
 * Uses a singleton pattern for thread safety.
 */
@Database(
    entities = [
        TelemetryEvent::class,
        UserGoalEntity::class,
        InterventionLogEntity::class
    ],
    version = 2,
    exportSchema = false
)
abstract class TelemetryDatabase : RoomDatabase() {

    abstract fun telemetryEventDao(): TelemetryEventDao
    abstract fun userGoalDao(): UserGoalDao
    abstract fun interventionLogDao(): InterventionLogDao

    companion object {
        @Volatile
        private var INSTANCE: TelemetryDatabase? = null

        fun getInstance(context: Context): TelemetryDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    TelemetryDatabase::class.java,
                    "mindshift_telemetry.db"
                )
                .fallbackToDestructiveMigration()
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
