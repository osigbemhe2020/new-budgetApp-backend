// models/tax-profile.model.js
const pool = require('../config/db');

class TaxProfile {

    static async create(userId) {
        const [result] = await pool.execute(
            `INSERT INTO tax_profiles (userId) VALUES (?)`,
            [userId]
        );
        return { id: result.insertId, userId };
    }

    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM tax_profiles WHERE userId = ?',
            [userId]
        );
        return rows[0] || null;
    }

    static async update(userId, {
        account_type,
        tin,
        date_of_birth,
        gender,
        phone,
        phone_number,
        address,
        state_of_residence,
        lga,
        occupation,
        employer_name,
        pension_contribution,
        nhf_contribution,
        life_insurance_premium
    } = {}) {
        const resolvedPhone = phone || phone_number || null;
        // check if profile is complete enough for tax filing
        const is_complete = !!(tin && address && state_of_residence && occupation);

        const [result] = await pool.execute(
            `UPDATE tax_profiles SET
                account_type = ?,
                tin = ?,
                date_of_birth = ?,
                gender = ?,
                phone = ?,
                address = ?,
                state_of_residence = ?,
                lga = ?,
                occupation = ?,
                employer_name = ?,
                pension_contribution = ?,
                nhf_contribution = ?,
                life_insurance_premium = ?,
                is_complete = ?
             WHERE userId = ?`,
            [
                account_type || 'personal',
                tin || null,
                date_of_birth || null,
                gender || null,
                resolvedPhone,
                address || null,
                state_of_residence || null,
                lga || null,
                occupation || null,
                employer_name || null,
                pension_contribution || 0,
                nhf_contribution || 0,
                life_insurance_premium || 0,
                is_complete,
                userId
            ]
        );
        return result.affectedRows > 0;
    }
}

module.exports = TaxProfile;