// models/expense.model.js
const pool = require('../config/db');

class Expense {

    static async create({ userId, monthId, expense_name, amount, category, release_date }) {
        const [result] = await pool.execute(
            `INSERT INTO expenses (userId, monthId, expense_name, amount, category, release_date)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, monthId, expense_name, amount, category || null, release_date]
        );
        return {
            id: result.insertId,
            userId,
            monthId,
            expense_name,
            amount,
            category: category || null,
            release_date,
            is_released: false
        };
    }

    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM expenses WHERE id = ?',
            [id]
        );
        return rows[0] || null;
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

    // called by daily cron job — flips is_released on all due expenses
    static async releaseExpiredExpenses() {
        const today = new Date().toISOString().slice(0, 10);
        const [result] = await pool.execute(
            `UPDATE expenses 
             SET is_released = true 
             WHERE release_date <= ? AND is_released = false`,
            [today]
        );
        return result.affectedRows; // returns how many were released
    }

    // find all unreleased expenses for a month
    static async findUnreleasedByMonthId(monthId) {
        const [rows] = await pool.execute(
            'SELECT * FROM expenses WHERE monthId = ? AND is_released = false',
            [monthId]
        );
        return rows;
    }
}

module.exports = Expense;
// const pool = require('../config/db');

// class Expense {

//     static async create({ userId, monthId, expense_name, amount, category, date }) {
//         const [result] = await pool.execute(
//             `INSERT INTO expenses (userId, monthId, expense_name, amount, category, created_at)
//              VALUES (?, ?, ?, ?, ?, ?)`,
//             [userId, monthId, expense_name, amount, category || null, date]
//         );
//         return { id: result.insertId, userId, monthId, expense_name, amount, category };
//     }

//     static async findByUserId(userId) {
//         const [rows] = await pool.execute(
//             'SELECT * FROM expenses WHERE userId = ? ORDER BY created_at DESC',
//             [userId]
//         );
//         return rows;
//     }

//     static async findByMonthId(monthId) {
//         const [rows] = await pool.execute(
//             'SELECT * FROM expenses WHERE monthId = ?',
//             [monthId]
//         );
//         return rows;
//     }

//     static async findById(id) {
//         const [rows] = await pool.execute(
//             'SELECT * FROM expenses WHERE id = ?',
//             [id]
//         );
//         return rows[0] || null;
//     }

//     static async update(id, { expense_name, amount, category }) {
//         const [result] = await pool.execute(
//             `UPDATE expenses SET expense_name = ?, amount = ?, category = ? WHERE id = ?`,
//             [expense_name, amount, category, id]
//         );
//         return result.affectedRows > 0;
//     }

//     static async delete(id) {
//         const [result] = await pool.execute(
//             'DELETE FROM expenses WHERE id = ?',
//             [id]
//         );
//         return result.affectedRows > 0;
//     }
// }

// module.exports = Expense;