const pool = require('../config/db');

class ExpenseTemplate {

    // templates are not linked to a month — they are reusable across months
    static async create({ userId, template_name, default_amount, category }) {
        const [result] = await pool.execute(
            `INSERT INTO expense_templates (userId, template_name, default_amount, category)
             VALUES (?, ?, ?, ?)`,
            [userId, template_name, default_amount, category || null]
        );
        return { id: result.insertId, userId, template_name, default_amount, category };
    }

    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM expense_templates WHERE userId = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows;
    }

    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM expense_templates WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    }

    static async update(id, { template_name, default_amount, category }) {
        const [result] = await pool.execute(
            `UPDATE expense_templates SET template_name = ?, default_amount = ?, category = ? WHERE id = ?`,
            [template_name, default_amount, category, id]
        );
        return result.affectedRows > 0;
    }

    static async delete(id) {
        const [result] = await pool.execute(
            'DELETE FROM expense_templates WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }
}

module.exports = ExpenseTemplate;