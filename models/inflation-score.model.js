// models/inflation-score.model.js
const pool = require('../config/db');

class InflationScore {

    static async create({ userId, templateId, monthId, closing_price, previous_closing_price, inflation_percentage, change_type }) {
        const [result] = await pool.execute(
            `INSERT INTO inflation_scores 
             (userId, templateId, monthId, closing_price, previous_closing_price, inflation_percentage, change_type)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, templateId, monthId, closing_price, previous_closing_price, inflation_percentage, change_type]
        );
        return {
            id: result.insertId,
            userId,
            templateId,
            monthId,
            closing_price,
            previous_closing_price,
            inflation_percentage,
            change_type
        };
    }

    // get inflation score for a specific template in a specific cycle
    static async findByTemplateAndMonth(templateId, monthId) {
        const [rows] = await pool.execute(
            `SELECT * FROM inflation_scores 
             WHERE templateId = ? AND monthId = ?`,
            [templateId, monthId]
        );
        return rows[0] || null;
    }

    // get full inflation history for a template (all cycles)
    static async findByTemplateId(templateId) {
        const [rows] = await pool.execute(
            `SELECT is.*, m.cycle_start_date, m.cycle_end_date
             FROM inflation_scores is
             JOIN months m ON is.monthId = m.id
             WHERE is.templateId = ?
             ORDER BY m.cycle_start_date DESC`,
            [templateId]
        );
        return rows;
    }

    // get inflation history for a template within a window (number of cycles)
    static async findByTemplateIdWithWindow(templateId, userId, windowCycles) {
        const [rows] = await pool.execute(
            `SELECT is.*, m.cycle_start_date, m.cycle_end_date
             FROM inflation_scores is
             JOIN months m ON is.monthId = m.id
             WHERE is.templateId = ? AND is.userId = ?
             ORDER BY m.cycle_start_date DESC
             LIMIT ?`,
            [templateId, userId, windowCycles]
        );
        return rows;
    }

    // get the most recent inflation score for a template
    // used as previous_closing_price for the next cycle
    static async findLatestByTemplateId(templateId, userId) {
        const [rows] = await pool.execute(
            `SELECT is.* FROM inflation_scores is
             JOIN months m ON is.monthId = m.id
             WHERE is.templateId = ? AND is.userId = ?
             ORDER BY m.cycle_start_date DESC
             LIMIT 1`,
            [templateId, userId]
        );
        return rows[0] || null;
    }

    // get all inflation scores for a user in a specific cycle
    // used for the inflation summary endpoint
    static async findAllByUserAndMonth(userId, monthId) {
        const [rows] = await pool.execute(
            `SELECT is.*, et.template_name, et.category, et.is_basket, et.parent_basket_id
             FROM inflation_scores is
             JOIN expense_templates et ON is.templateId = et.id
             WHERE is.userId = ? AND is.monthId = ?
             ORDER BY is.inflation_percentage DESC`,
            [userId, monthId]
        );
        return rows;
    }

    // get latest inflation score for every template owned by a user
    // used for the summary endpoint
    static async findLatestAllByUser(userId) {
        const [rows] = await pool.execute(
            `SELECT is.*, et.template_name, et.category, et.is_basket,
                    et.parent_basket_id, et.last_amount,
                    m.cycle_start_date, m.cycle_end_date
             FROM inflation_scores is
             JOIN expense_templates et ON is.templateId = et.id
             JOIN months m ON is.monthId = m.id
             WHERE is.userId = ?
             AND is.id IN (
                 SELECT MAX(id) FROM inflation_scores
                 WHERE userId = ?
                 GROUP BY templateId
             )
             ORDER BY is.inflation_percentage DESC`,
            [userId, userId]
        );
        return rows;
    }
}

module.exports = InflationScore;