// models/savings-settings.model.js
const pool = require('../config/db');

class SavingsSettings {

    // create savings settings for a user (called after signup or when user sets up savings for first time)
    static async create({ userId, savings_percentage, lock_duration_months, }) {
        const [result] = await pool.execute(
            `INSERT INTO savings_settings (userId, savings_percentage, lock_duration_months)
             VALUES (?, ?, ?)`,
            [userId, savings_percentage, lock_duration_months]
        );
        return { id: result.insertId, userId, savings_percentage, lock_duration_months };
    }

    // get savings settings for a user
    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM savings_settings WHERE userId = ?',
            [userId]
        );
        return rows[0] || null; // one row per user
    }

    // update savings settings — only takes effect from next month onwards
    // current month savings are already being tracked at the old percentage
    static async update(userId, { savings_percentage, lock_duration_months }) {
        const [result] = await pool.execute(
            `UPDATE savings_settings 
             SET savings_percentage = ?, lock_duration_months = ?, 
             WHERE userId = ?`,
            [savings_percentage, lock_duration_months, userId]
        );
        return result.affectedRows > 0;
    }

    // delete savings settings — user opts out of savings plan
    static async delete(userId) {
        const [result] = await pool.execute(
            'DELETE FROM savings_settings WHERE userId = ?',
            [userId]
        );
        return result.affectedRows > 0;
    }
}

module.exports = SavingsSettings;