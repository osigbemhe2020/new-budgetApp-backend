// models/taxFiling.model.js
const pool = require('../config/db');

class TaxFiling {

    static async create({
        userId, period_type, period_start, period_end,
        gross_income, total_expenses, net_income,
        cra, pension_deduction, nhf_deduction,
        life_insurance_deduction, total_deductions,
        chargeable_income, tax_payable
    }) {
        const [result] = await pool.execute(
            `INSERT INTO tax_filings (
                userId, period_type, period_start, period_end,
                gross_income, total_expenses, net_income,
                cra, pension_deduction, nhf_deduction,
                life_insurance_deduction, total_deductions,
                chargeable_income, tax_payable, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing')`,
            [
                userId, period_type, period_start, period_end,
                gross_income, total_expenses, net_income,
                cra, pension_deduction, nhf_deduction,
                life_insurance_deduction, total_deductions,
                chargeable_income, tax_payable
            ]
        );
        return { id: result.insertId };
    }

    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            `SELECT * FROM tax_filings WHERE userId = ? ORDER BY created_at DESC`,
            [userId]
        );
        return rows;
    }

    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM tax_filings WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    }

    static async updatePdfPath(id, pdf_path, pdf_expires_at) {
        const [result] = await pool.execute(
            `UPDATE tax_filings SET pdf_path = ?, pdf_expires_at = ?, status = 'completed'
             WHERE id = ?`,
            [pdf_path, pdf_expires_at, id]
        );
        return result.affectedRows > 0;
    }

    static async updateEmailSent(id) {
        const [result] = await pool.execute(
            `UPDATE tax_filings SET email_sent = true, email_sent_at = NOW()
             WHERE id = ?`,
            [id]
        );
        return result.affectedRows > 0;
    }

    static async markFailed(id) {
        const [result] = await pool.execute(
            `UPDATE tax_filings SET status = 'failed' WHERE id = ?`,
            [id]
        );
        return result.affectedRows > 0;
    }
}

module.exports = TaxFiling;