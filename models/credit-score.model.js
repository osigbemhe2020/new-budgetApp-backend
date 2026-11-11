// models/credit-score.model.js
const pool = require('../config/db');

class CreditScore {

    static async create({
        userId, monthId, phase,
        income_health_score, savings_score,
        debt_score, inflation_score,
        raw_score, credit_score, band, interest_rate,
        active_cycles_at_calculation, is_sufficient_history
    }) {
        const [result] = await pool.execute(
            `INSERT INTO credit_scores (
                userId, monthId, phase,
                income_health_score, savings_score,
                debt_score, inflation_score,
                raw_score, credit_score, band, interest_rate,
                active_cycles_at_calculation, is_sufficient_history
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId, monthId, phase,
                income_health_score, savings_score,
                debt_score, inflation_score,
                raw_score, credit_score, band, interest_rate,
                active_cycles_at_calculation, is_sufficient_history
            ]
        );
        return {
            id: result.insertId,
            userId, monthId, phase,
            income_health_score, savings_score,
            debt_score, inflation_score,
            raw_score, credit_score, band, interest_rate,
            active_cycles_at_calculation,
            is_sufficient_history
        };
    }

    // get latest credit score for a user
    static async findLatestByUserId(userId) {
        const [rows] = await pool.execute(
            `SELECT cs.*, m.cycle_start_date, m.cycle_end_date
             FROM credit_scores cs
             JOIN months m ON cs.monthId = m.id
             WHERE cs.userId = ?
             ORDER BY m.cycle_start_date DESC
             LIMIT 1`,
            [userId]
        );
        return rows[0] || null;
    }

    // get full credit score history for a user
    static async findAllByUserId(userId) {
        const [rows] = await pool.execute(
            `SELECT cs.*, m.cycle_start_date, m.cycle_end_date
             FROM credit_scores cs
             JOIN months m ON cs.monthId = m.id
             WHERE cs.userId = ?
             ORDER BY m.cycle_start_date DESC`,
            [userId]
        );
        return rows;
    }

    // get credit score for a specific month
    static async findByUserAndMonth(userId, monthId) {
        const [rows] = await pool.execute(
            `SELECT * FROM credit_scores
             WHERE userId = ? AND monthId = ?`,
            [userId, monthId]
        );
        return rows[0] || null;
    }

    // get the interest rate to apply to new debts
    // returns the rate from the most recent sufficient score
    // falls back to 15% (fair rate) if no score exists yet
    static async getCurrentInterestRate(userId) {
        const latest = await this.findLatestByUserId(userId);
        if (!latest || !latest.is_sufficient_history) return 15.00;
        return Number(latest.interest_rate);
    }
}

module.exports = CreditScore;