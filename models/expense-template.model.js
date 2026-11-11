// models/expenseTemplate.model.js
const pool = require('../config/db');

class ExpenseTemplate {

    static async create({ userId, template_name, default_amount, category, is_recurring, recurring_day, release_date, is_basket, parent_basket_id }) {
        const [result] = await pool.execute(
            `INSERT INTO expense_templates 
         (userId, template_name, default_amount, category, is_recurring, recurring_day, release_date, is_basket, parent_basket_id, last_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                template_name,
                default_amount || null,  // ✅ null for baskets
                category || null,
                is_recurring || false,
                recurring_day || null,
                release_date || null,
                is_basket || false,
                parent_basket_id || null,
                default_amount || null   // ✅ last_amount also null for baskets
            ]
        );
        return {
            id: result.insertId,
            userId,
            template_name,
            default_amount: default_amount || null,
            category: category || null,
            is_recurring: is_recurring || false,
            recurring_day: recurring_day || null,
            release_date: release_date || null,
            is_basket: is_basket || false,
            parent_basket_id: parent_basket_id || null,
            last_amount: default_amount || null
        };
    }
    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM expense_templates WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    }

    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            `SELECT * FROM expense_templates 
             WHERE userId = ? AND parent_basket_id IS NULL
             ORDER BY created_at DESC`,
            [userId]
        );
        return rows;
    }

    // get all items inside a basket
    static async findBasketItems(basketId) {
        const [rows] = await pool.execute(
            'SELECT * FROM expense_templates WHERE parent_basket_id = ?',
            [basketId]
        );
        return rows;
    }

    static async update(id, { template_name, default_amount, category, release_date }) {
        const [result] = await pool.execute(
            `UPDATE expense_templates 
             SET template_name = ?, default_amount = ?, category = ?, release_date = ?
             WHERE id = ?`,
            [template_name, default_amount, category, release_date, id]
        );
        return result.affectedRows > 0;
    }

    // called when user hits +/- button — updates last_amount
    static async updateLastAmount(id, last_amount) {
        const [result] = await pool.execute(
            'UPDATE expense_templates SET last_amount = ? WHERE id = ?',
            [last_amount, id]
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
// const pool = require('../config/db');

// class ExpenseTemplate {

//     // templates are not linked to a month — they are reusable across months
//     static async create({ userId, template_name, default_amount, category }) {
//         const [result] = await pool.execute(
//             `INSERT INTO expense_templates (userId, template_name, default_amount, category)
//              VALUES (?, ?, ?, ?)`,
//             [userId, template_name, default_amount, category || null]
//         );
//         return { id: result.insertId, userId, template_name, default_amount, category };
//     }

//     static async findByUserId(userId) {
//         const [rows] = await pool.execute(
//             'SELECT * FROM expense_templates WHERE userId = ? ORDER BY created_at DESC',
//             [userId]
//         );
//         return rows;
//     }

//     static async findById(id) {
//         const [rows] = await pool.execute(
//             'SELECT * FROM expense_templates WHERE id = ?',
//             [id]
//         );
//         return rows[0] || null;
//     }

//     static async update(id, { template_name, default_amount, category }) {
//         const [result] = await pool.execute(
//             `UPDATE expense_templates SET template_name = ?, default_amount = ?, category = ? WHERE id = ?`,
//             [template_name, default_amount, category, id]
//         );
//         return result.affectedRows > 0;
//     }

//     static async delete(id) {
//         const [result] = await pool.execute(
//             'DELETE FROM expense_templates WHERE id = ?',
//             [id]
//         );
//         return result.affectedRows > 0;
//     }
// }

// module.exports = ExpenseTemplate;