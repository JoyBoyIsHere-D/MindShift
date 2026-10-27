package com.mindshift.data

import androidx.room.*

/**
 * Data Access Object for user goals and baseline limits.
 */
@Dao
interface UserGoalDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertGoal(goal: UserGoalEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertGoals(goals: List<UserGoalEntity>)

    @Query("SELECT * FROM user_goals WHERE package_name = :packageName LIMIT 1")
    suspend fun getGoalForPackage(packageName: String): UserGoalEntity?

    @Query("SELECT * FROM user_goals")
    suspend fun getAllGoals(): List<UserGoalEntity>

    @Query("DELETE FROM user_goals WHERE package_name = :packageName")
    suspend fun deleteGoal(packageName: String)
}

