const pool = require('../config/db');

class Debt {

    // create debt — interest_rate fixed at 15%, repayment plan not set yet
    static async create({ userId, monthId, debt_amount }) {
        const interest_rate = 15; // fixed for now
        const interest_amount = (debt_amount * interest_rate / 100).toFixed(2);
        const total_payable = (Number(debt_amount) + Number(interest_amount)).toFixed(2);

        const [result] = await pool.execute(
            `INSERT INTO debts (userId, monthId, debt_amount, interest_rate, interest_amount, total_payable, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, monthId, debt_amount, interest_rate, interest_amount, total_payable, 'pending']
        );

        return {
            id: result.insertId,
            userId,
            monthId,
            debt_amount,
            interest_rate,
            interest_amount: Number(interest_amount),
            total_payable: Number(total_payable),
            status: 'pending'
        };
    }

    static async findById(id) {
        const [rows] = await pool.execute('SELECT * FROM debts WHERE id = ?', [id]);
        return rows[0] || null;
    }

    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM debts WHERE userId = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows;
    }

    static async findByMonthId(monthId) {
        const [rows] = await pool.execute(
            'SELECT * FROM debts WHERE monthId = ?',
            [monthId]
        );
        return rows;
    }

    // only unpaid debts
    static async findActiveByUserId(userId) {
        const [rows] = await pool.execute(
            `SELECT * FROM debts WHERE userId = ? AND status = 'pending' ORDER BY created_at DESC`,
            [userId]
        );
        return rows;
    }

    // only paid debts
    static async findPaidByUserId(userId) {
        const [rows] = await pool.execute(
            `SELECT * FROM debts WHERE userId = ? AND status = 'paid' ORDER BY created_at DESC`,
            [userId]
        );
        return rows;
    }

    // set repayment plan — splits principal across months, interest charged monthly
    static async setRepaymentPlan(id, { repayment_months, monthly_principal, monthly_interest, next_payment_date }) {
        const [result] = await pool.execute(
            `UPDATE debts 
             SET repayment_months = ?, monthly_principal = ?, monthly_interest = ?, next_payment_date = ?
             WHERE id = ?`,
            [repayment_months, monthly_principal, monthly_interest, next_payment_date, id]
        );
        return result.affectedRows > 0;
    }

    // record a payment — increments months_paid, updates next_payment_date
    static async recordPayment(id, { months_paid, next_payment_date, debt_amount, status }) {
        const [result] = await pool.execute(
            `UPDATE debts 
             SET months_paid = ?, next_payment_date = ?, debt_amount = ?, status = ?
             WHERE id = ?`,
            [months_paid, next_payment_date, debt_amount, status, id]
        );
        return result.affectedRows > 0;
    }

    static async updateStatus(id, status) {
        const [result] = await pool.execute(
            'UPDATE debts SET status = ? WHERE id = ?',
            [status, id]
        );
        return result.affectedRows > 0;
    }

    static async delete(id) {
        const [result] = await pool.execute('DELETE FROM debts WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = Debt;