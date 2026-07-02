// models/generalSettings.model.js
const pool = require('../config/db');

class GeneralSettings {

    // created automatically at signup with defaults
    static async create(userId) {
        const [result] = await pool.execute(
            `INSERT INTO general_settings (userId) VALUES (?)`,
            [userId]
        );
        return { 
            id: result.insertId, 
            userId,
            cycle_start_day: null,
            currency: 'NGN',
            language: 'en',
            timezone: 'Africa/Lagos',
            notifications: true,
            cycle_changes_this_year: 0,
            cycle_changes_this_month: 0,
            last_cycle_change_date: null,
            cycle_change_year: null
        };
    }

    // get settings for a user
    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM general_settings WHERE userId = ?',
            [userId]
        );
        return rows[0] || null;
    }

    // update cycle_start_day — called on first income or when user changes it
    static async updateCycleStartDay(userId, cycle_start_day) {
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const year = now.getFullYear();

        const [result] = await pool.execute(
            `UPDATE general_settings 
             SET cycle_start_day = ?,
                 last_cycle_change_date = ?,
                 cycle_change_year = ?,
                 cycle_changes_this_year = cycle_changes_this_year + 1,
                 cycle_changes_this_month = cycle_changes_this_month + 1
             WHERE userId = ?`,
            [cycle_start_day, today, year, userId]
        );
        return result.affectedRows > 0;
    }

    // reset cycle_changes_this_month — called by cron job on 1st of every month
    static async resetMonthlyChangeCount(userId) {
        const [result] = await pool.execute(
            `UPDATE general_settings 
             SET cycle_changes_this_month = 0
             WHERE userId = ?`,
            [userId]
        );
        return result.affectedRows > 0;
    }

    // reset cycle_changes_this_year — called by cron job on Jan 1st every year
    static async resetYearlyChangeCount(userId) {
        const [result] = await pool.execute(
            `UPDATE general_settings 
             SET cycle_changes_this_year = 0,
                 cycle_change_year = ?
             WHERE userId = ?`,
            [new Date().getFullYear(), userId]
        );
        return result.affectedRows > 0;
    }

    // update general preferences (currency, language, timezone, notifications)
    static async updatePreferences(userId, { currency, language, timezone, notifications }) {
        const [result] = await pool.execute(
            `UPDATE general_settings 
             SET currency = ?, language = ?, timezone = ?, notifications = ?
             WHERE userId = ?`,
            [currency, language, timezone, notifications, userId]
        );
        return result.affectedRows > 0;
    }

    // check if user can change cycle_start_day
    static async canChangeCycle(userId) {
        const settings = await this.findByUserId(userId);
        if (!settings) return { allowed: false, reason: 'No settings found' };

        const now = new Date();
        const currentYear = now.getFullYear();

        // reset yearly count if it's a new year
        if (settings.cycle_change_year && settings.cycle_change_year < currentYear) {
            await this.resetYearlyChangeCount(userId);
            settings.cycle_changes_this_year = 0;
            settings.cycle_changes_this_month = 0;
        }

        // check yearly limit (max 3 per year)
        if (settings.cycle_changes_this_year >= 3) {
            return { 
                allowed: false, 
                reason: `You have reached your maximum of 3 cycle changes per year` 
            };
        }

        // check monthly limit (max 1 per month)
        if (settings.cycle_changes_this_month >= 1) {
            return { 
                allowed: false, 
                reason: 'You can only change your cycle once per month' 
            };
        }

        return { allowed: true };
    }
}

module.exports = GeneralSettings;