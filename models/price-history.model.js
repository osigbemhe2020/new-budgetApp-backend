// models/price-history.model.js
const pool = require('../config/db');

class PriceHistory {

    static async create({ templateId, userId, monthId, old_amount, new_amount, change_percentage, change_type }) {
        const [result] = await pool.execute(
            `INSERT INTO price_history 
             (templateId, userId, monthId, old_amount, new_amount, change_percentage, change_type)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [templateId, userId, monthId, old_amount, new_amount, change_percentage, change_type]
        );
        return {
            id: result.insertId,
            templateId,
            userId,
            monthId,
            old_amount,
            new_amount,
            change_percentage,
            change_type
        };
    }

    // get all price history for a template
    static async findByTemplateId(templateId) {
        const [rows] = await pool.execute(
            `SELECT * FROM price_history 
             WHERE templateId = ? 
             ORDER BY created_at DESC`,
            [templateId]
        );
        return rows;
    }

    // get price history for a template within a specific window (in cycles)
    static async findByTemplateIdWithWindow(templateId, monthIds) {
        if (!monthIds.length) return [];
        const placeholders = monthIds.map(() => '?').join(', ');
        const [rows] = await pool.execute(
            `SELECT * FROM price_history 
             WHERE templateId = ? AND monthId IN (${placeholders})
             ORDER BY created_at DESC`,
            [templateId, ...monthIds]
        );
        return rows;
    }

    // get the LAST price history entry for a template in a specific cycle
    // used at cycle lock to get the closing price
    static async findLastInCycle(templateId, monthId) {
        const [rows] = await pool.execute(
            `SELECT * FROM price_history 
             WHERE templateId = ? AND monthId = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [templateId, monthId]
        );
        return rows[0] || null;
    }

    // get all adjustments made in a specific cycle for a user
    // used at lock time to know which templates were adjusted
    static async findAllInCycle(userId, monthId) {
        const [rows] = await pool.execute(
            `SELECT DISTINCT templateId FROM price_history
             WHERE userId = ? AND monthId = ?`,
            [userId, monthId]
        );
        return rows.map(r => r.templateId);
    }
}

module.exports = PriceHistory;