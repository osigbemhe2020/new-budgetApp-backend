// savings.model.js
const pool = require('../config/db');

class Savings {

    static async create({ userId, monthId, savings_percentage, amount_saved, lock_duration_months, unlock_date, status = 'locked' }) {
        const [result] = await pool.execute(
            `INSERT INTO savings (userId, monthId, savings_percentage, amount_saved, lock_duration_months, unlock_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, monthId, savings_percentage, amount_saved, lock_duration_months, unlock_date, status]
        );
        return { id: result.insertId, userId, monthId, savings_percentage, amount_saved, lock_duration_months, unlock_date, status };
    }

    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM savings WHERE userId = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows;
    }

    static async findByMonthId(monthId) {
        const [rows] = await pool.execute(
            'SELECT * FROM savings WHERE monthId = ?',
            [monthId]
        );
        return rows;
    }

    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM savings WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    }

    // unlock savings when unlock_date is reached
    static async updateStatus(id, status) {
        const [result] = await pool.execute(
            'UPDATE savings SET status = ? WHERE id = ?',
            [status, id]
        );
        return result.affectedRows > 0;
    }

    static async delete(id) {
        const [result] = await pool.execute(
            'DELETE FROM savings WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }
}

module.exports = Savings;