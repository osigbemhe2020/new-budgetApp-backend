const pool = require('../config/db');

class Expense {

    static async create({ userId, monthId, expense_name, amount, category, date }) {
        const [result] = await pool.execute(
            `INSERT INTO expenses (userId, monthId, expense_name, amount, category, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, monthId, expense_name, amount, category || null, date]
        );
        return { id: result.insertId, userId, monthId, expense_name, amount, category };
    }

    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM expenses WHERE userId = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows;
    }

    static async findByMonthId(monthId) {
        const [rows] = await pool.execute(
            'SELECT * FROM expenses WHERE monthId = ?',
            [monthId]
        );
        return rows;
    }

    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM expenses WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    }

    static async update(id, { expense_name, amount, category }) {
        const [result] = await pool.execute(
            `UPDATE expenses SET expense_name = ?, amount = ?, category = ? WHERE id = ?`,
            [expense_name, amount, category, id]
        );
        return result.affectedRows > 0;
    }

    static async delete(id) {
        const [result] = await pool.execute(
            'DELETE FROM expenses WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }
}

module.exports = Expense;