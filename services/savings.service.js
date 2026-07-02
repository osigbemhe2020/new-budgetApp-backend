
const Savings = require('../models/savings.model');
const SavingsSettings = require('../models/savings-settings.model');
const Month = require('../models/Month.model');
const { getOrCreateActiveMonth } = require('./month.service');

const lockMonth = async (userId, monthId) => {

    const settings = await SavingsSettings.findByUserId(userId);
    if (!settings) throw new Error('No savings settings found for this user');

    const activeMonth = await Month.findById(monthId);
    if (!activeMonth) throw new Error('Month not found');

    // calculate final amount_saved
    const amount_saved = (activeMonth.total_income * settings.savings_percentage / 100).toFixed(2);

    // unlock_date = cycle_end_date + lock_duration_months
    const cycleEnd = new Date(activeMonth.cycle_end_date);
    const unlockDate = new Date(
        cycleEnd.getFullYear(),
        cycleEnd.getMonth() + settings.lock_duration_months,
        cycleEnd.getDate()
    );
    const unlock_date = unlockDate.toISOString().slice(0, 10);

    // create permanent locked savings record
    const savings = await Savings.create({
        userId,
        monthId,
        savings_percentage: settings.savings_percentage,
        amount_saved: Number(amount_saved),
        lock_duration_months: settings.lock_duration_months,
        unlock_date,
        status: 'locked'
    });

    return savings;
};

const lockSavings = async (req, res) => {
    try {
        const userId = req.user.id;

        // check if savings settings exist
        const settings = await SavingsSettings.findByUserId(userId);
        if (!settings) {
            return res.status(404).json({
                message: "No savings settings found. Use POST /settings to create one."
            });
        }

        // get current active month
        const activeMonth = await getOrCreateActiveMonth(userId);

        // only allow manual lock on or after cycle_end_date
        const today = new Date();
        const cycleEndDate = new Date(activeMonth.cycle_end_date);

        if (today < cycleEndDate) {
            return res.status(400).json({
                message: `Cannot lock before cycle ends. Your cycle ends on ${activeMonth.cycle_end_date}`
            });
        }

        // check if month is already locked
        const existingSavings = await Savings.findByMonthId(activeMonth.id);
        if (existingSavings.length > 0) {
            return res.status(400).json({
                message: "This cycle is already locked.",
                savings: existingSavings[0]
            });
        }

        // lock the month using shared function
        const savings = await lockMonth(userId, activeMonth.id);

        res.status(201).json({
            message: "Savings locked successfully 🔒",
            savings
        });

    } catch (error) {
        console.error('ERROR locking savings:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};
module.exports = {
    lockMonth,
    lockSavings
};