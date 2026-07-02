// models/month.model.js
const pool = require('../config/db');

class Month {

    // create a new month cycle

    static async create({ userId, year, month, cycle_start_date, cycle_end_date, balance_brought_forward = 0 }) {
    const [result] = await pool.execute(
        `INSERT INTO months (userId, year, month, total_income, total_expense, money_saved, debt_cost, balance, balance_brought_forward, cycle_start_date, cycle_end_date)
         VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?)`,
        //                                  ^ use balance_brought_forward here too
        [userId, year, month, balance_brought_forward, balance_brought_forward, cycle_start_date, cycle_end_date]
    );
    return { 
        id: result.insertId, 
        userId, 
        year, 
        month, 
        total_income: 0,
        total_expense: 0,
        money_saved: 0,
        debt_cost: 0,
        balance: balance_brought_forward,  // ✅ matches what's actually in the DB
        balance_brought_forward,
        cycle_start_date, 
        cycle_end_date 
    };
}
    // find month by id
    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM months WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    }

    // find month by userId, year and month number
    static async findCurrentMonth(userId, year, month) {
        const [rows] = await pool.execute(
            'SELECT * FROM months WHERE userId = ? AND year = ? AND month = ?',
            [userId, year, month]
        );
        return rows[0] || null;
    }

    // find month by cycle — useful when record month differs from start month
    static async findByCycle(userId, cycle_start_date) {
        const [rows] = await pool.execute(
            'SELECT * FROM months WHERE userId = ? AND cycle_start_date = ?',
            [userId, cycle_start_date]
        );
        return rows[0] || null;
    }

    // find all months for a user — full history
    static async findAllByUser(userId) {
        const [rows] = await pool.execute(
            `SELECT * FROM months 
             WHERE userId = ? 
             ORDER BY cycle_start_date DESC`,
            [userId]
        );
        return rows;
    }

    // update month totals after income or expense changes
    static async updateTotals(id, { total_income, total_expense, money_saved, debt_cost, balance, balance_brought_forward }) {
    const [result] = await pool.execute(
        `UPDATE months 
         SET total_income = ?, 
             total_expense = ?, 
             money_saved = ?,
             debt_cost = ?,
             balance = ?,
             balance_brought_forward = ?
         WHERE id = ?`,
        [total_income, total_expense, money_saved, debt_cost, balance, balance_brought_forward, id]
    );
    return result.affectedRows > 0;
}
    // extend cycle end date when user changes cycle_start_day mid cycle
    static async updateCycleEndDate(id, cycle_end_date) {
        const [result] = await pool.execute(
            'UPDATE months SET cycle_end_date = ? WHERE id = ?',
            [cycle_end_date, id]
        );
        return result.affectedRows > 0;
    }

    static async updateCycleStartDate(id, cycle_start_date) {
    const [result] = await pool.execute(
        'UPDATE months SET cycle_start_date = ? WHERE id = ?',
        [cycle_start_date, id]
    );
    return result.affectedRows > 0;
}

    // delete month
    static async delete(id) {
        const [result] = await pool.execute(
            'DELETE FROM months WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }
}

module.exports = Month;