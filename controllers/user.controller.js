// controllers/user.controller.js
const GeneralSettings = require('../models/general-settings.model');
const SavingsSettings = require('../models/savingsSettings.model');
const CreditScore = require('../models/creditScore.model');
const { getOrCreateActiveMonth } = require('../services/month.service');
const { countActiveCycles } = require('../helpers/cycleUtils');
const pool = require('../config/db');

const getMe = async (req, res) => {
    try {
        const userId = req.user.id;

        // get user info
        const [userRows] = await pool.execute(
            'SELECT userId, username, email, created_at FROM user_info WHERE userId = ?',
            [userId]
        );
        const user = userRows[0];
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // get general settings
        const settings = await GeneralSettings.findByUserId(userId);

        // get active month
        const activeMonth = await getOrCreateActiveMonth(userId);

        // get savings settings for projected savings
        const savingsSettings = await SavingsSettings.findByUserId(userId);
        const projected_savings = savingsSettings && activeMonth
            ? Number((activeMonth.total_income * savingsSettings.savings_percentage / 100).toFixed(2))
            : 0;

        // get active cycle count for debt eligibility
        const activeCycles = await countActiveCycles(userId);
        const activeCycleCount = activeCycles.length;
        const debtEligible = activeCycleCount >= 6;
        const cycles_until_debt = debtEligible ? 0 : 6 - activeCycleCount;

        // get latest credit score (internal only — just get interest rate)
        const latestScore = await CreditScore.findLatestByUserId(userId);
        const current_interest_rate = latestScore?.interest_rate || 15.00;

        // check if cycle is locked
        const [savingsRows] = await pool.execute(
            'SELECT * FROM savings WHERE monthId = ?',
            [activeMonth.id]
        );
        const cycleLocked = savingsRows.length > 0;

        res.status(200).json({
            message: "User profile fetched successfully",
            user: {
                userId: user.userId,
                username: user.username,
                email: user.email,
                created_at: user.created_at
            },
            current_cycle: {
                cycle_start_date: activeMonth.cycle_start_date,
                cycle_end_date: activeMonth.cycle_end_date,
                is_locked: cycleLocked,
                is_next_cycle: activeMonth.isNextCycle,
                total_income: activeMonth.total_income,
                total_expense: activeMonth.total_expense,
                balance: activeMonth.balance,
                balance_brought_forward: activeMonth.balance_brought_forward,
                debt_cost: activeMonth.debt_cost,
                projected_savings
            },
            financial_standing: {
                active_cycles: activeCycleCount,
                debt_eligible: debtEligible,
                cycles_until_debt: cycles_until_debt,
                current_interest_rate,
                // band hidden for now — just interest rate visible
                savings_percentage: savingsSettings?.savings_percentage || null
            },
            settings: {
                currency: settings?.currency || 'NGN',
                language: settings?.language || 'en',
                timezone: settings?.timezone || 'Africa/Lagos',
                notifications: settings?.notifications ?? true,
                cycle_start_day: settings?.cycle_start_day,
                expense_release_buffer_days: settings?.expense_release_buffer_days || 3
            }
        });

    } catch (error) {
        console.error('ERROR fetching user profile:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = { getMe };