// controllers/savings.controller.js
const SavingsSettings = require('../models/savings-settings.model');
const Month = require('../models/month.model');
const GeneralSettings = require('../models/general-settings.model');
const { getOrCreateActiveMonth } = require('../services/month.service');
const Savings = require('../models/savings.model');

const createSavingsSettings = async (req, res) => {
    try {
        const userId = req.user.id;
        const { savings_percentage, lock_duration_months } = req.body;

        // validate inputs exist
        if (savings_percentage == null || lock_duration_months == null) {
            return res.status(400).json({ 
                message: "savings_percentage and lock_duration_months are required" 
            });
        }

        // validate savings_percentage range (0% = no savings, max 100%)
        if (savings_percentage < 0 || savings_percentage > 100) {
            return res.status(400).json({ 
                message: "savings_percentage must be between 0 and 100" 
            });
        }

        // validate lock_duration_months is a positive number
        if (lock_duration_months < 1) {
            return res.status(400).json({ 
                message: "lock_duration_months must be at least 1" 
            });
        }

        // check if settings already exist for this user
        const existingSettings = await SavingsSettings.findByUserId(userId);
        if (existingSettings) {
            return res.status(400).json({ 
                message: "Savings settings already exist. Use PUT /settings to update." 
            });
        }

        // create the settings — lock_day defaults to 28 on the backend
        const settings = await SavingsSettings.create({
            userId,
            savings_percentage,
            lock_duration_months,
        });

        // calculate projected savings from current active month
        const now = new Date();
        const activeMonth = await Month.findCurrentMonth(userId, now.getFullYear(), now.getMonth() + 1);

        // if user has an active month, calculate projected savings on the fly
        const projected_savings = activeMonth 
            ? (activeMonth.total_income * savings_percentage / 100).toFixed(2)
            : 0;

        res.status(201).json({
            message: "Savings settings created successfully",
            settings,
            projected_savings: Number(projected_savings),
            cycle_end_date: activeMonth?.cycle_end_date || null  // ✅ from actual month data
        });

    } catch (error) {
        console.error('ERROR creating savings settings:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const updateSavingsSettings = async (req, res) => {
    try {
        const userId = req.user.id;
        const { savings_percentage, lock_duration_months } = req.body;

        // validate inputs exist
        if (savings_percentage == null || lock_duration_months == null) {
            return res.status(400).json({
                message: "savings_percentage and lock_duration_months are required"
            });
        }

        // validate savings_percentage range (0% = no savings, max 100%)
        if (savings_percentage < 0 || savings_percentage > 100) {
            return res.status(400).json({
                message: "savings_percentage must be between 0 and 100"
            });
        }

        // validate lock_duration_months is a positive number
        if (lock_duration_months < 1) {
            return res.status(400).json({
                message: "lock_duration_months must be at least 1"
            });
        }

        // check if settings exist — must use POST /settings first
        const existingSettings = await SavingsSettings.findByUserId(userId);
        if (!existingSettings) {
            return res.status(404).json({
                message: "No savings settings found. Use POST /settings to create first."
            });
        }

        // update the settings
        await SavingsSettings.update(userId, {
            savings_percentage,
            lock_duration_months,
        });

        // get active month — cycle_end_date tells us if cycle is locked
        const activeMonth = await getOrCreateActiveMonth(userId);

        // check if cycle is already locked (savings row exists)
        const existingSavings = await Savings.findByMonthId(activeMonth.id);
        const isCycleLocked = existingSavings.length > 0;

        // calculate projected savings only if cycle is still open
        const projected_savings = (!isCycleLocked && activeMonth)
            ? (activeMonth.total_income * savings_percentage / 100).toFixed(2)
            : 0;

        // figure out effective month name for the notice
        const cycleEndDate = new Date(activeMonth.cycle_end_date);
        const nextCycleStart = new Date(cycleEndDate);
        nextCycleStart.setDate(nextCycleStart.getDate() + 1);
        const effectiveMonthName = nextCycleStart.toLocaleString('default', {
            month: 'long',
            year: 'numeric'
        });

        res.status(200).json({
            message: "Savings settings updated successfully",
            settings: {
                userId,
                savings_percentage,
                lock_duration_months,
            },
            projected_savings: Number(projected_savings),
            // ✅ use cycle_end_date instead of hardcoded 28th
            notice: isCycleLocked
                ? `Current cycle is locked. Changes will take effect from ${effectiveMonthName}.`
                : `Changes take effect immediately. Current cycle ends: ${activeMonth.cycle_end_date}`
        });

    } catch (error) {
        console.error('ERROR updating savings settings:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const getSavingsSettings = async (req, res) => {
    try {
        const userId = req.user.id;

        // check if settings exist
        const settings = await SavingsSettings.findByUserId(userId);
        if (!settings) {
            return res.status(404).json({
                message: "No savings settings found. Use POST /settings to create one."
            });
        }

        // get active month — contains cycle dates
        const activeMonth = await getOrCreateActiveMonth(userId);

        // calculate projected savings on the fly
        const projected_savings = activeMonth
            ? (activeMonth.total_income * settings.savings_percentage / 100).toFixed(2)
            : 0;

        // ✅ check if cycle is locked via savings row not hardcoded day
        const existingSavings = await Savings.findByMonthId(activeMonth.id);
        const isCycleLocked = existingSavings.length > 0;

        // calculate unlock date from cycle_end_date + lock_duration_months
        const getUnlockDate = (cycle_end_date, lock_duration_months) => {
            const end = new Date(cycle_end_date);
            const unlock = new Date(
                end.getFullYear(),
                end.getMonth() + lock_duration_months,
                end.getDate()
            );
            return unlock.toISOString().slice(0, 10);
        };

        res.status(200).json({
            message: "Savings settings fetched successfully",
            settings,
            current_cycle_summary: {
                total_income: activeMonth ? activeMonth.total_income : 0,
                projected_savings: Number(projected_savings),
                cycle_start_date: activeMonth.cycle_start_date,
                cycle_end_date: activeMonth.cycle_end_date,
                // ✅ locked = savings row exists not date >= 28
                is_locked: isCycleLocked,
                unlock_date: isCycleLocked
                    ? getUnlockDate(activeMonth.cycle_end_date, settings.lock_duration_months)
                    : null
            }
        });

    } catch (error) {
        console.error('ERROR fetching savings settings:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};
// -----------------------------------------------
// GET /savings - all savings history
// -----------------------------------------------
const getAllSavings = async (req, res) => {
    try {
        const userId = req.user.id;

        const savings = await Savings.findByUserId(userId);

        // get current active month for projected savings
        const now = new Date();
        const generalSettings = await GeneralSettings.findByUserId(userId);
        const savingsSettings = await SavingsSettings.findByUserId(userId);
        const activeMonth = await getOrCreateActiveMonth(userId);

        // calculate projected savings for current cycle
        const projected_savings = (savingsSettings && activeMonth)
            ? (activeMonth.total_income * savingsSettings.savings_percentage / 100).toFixed(2)
            : 0;

        res.status(200).json({
            message: "Savings fetched successfully",
            count: savings.length,
            // current cycle summary
            current_cycle: {
                cycle_start_date: activeMonth.cycle_start_date,
                cycle_end_date: activeMonth.cycle_end_date,
                total_income: activeMonth.total_income,
                projected_savings: Number(projected_savings),
                is_locked: savings.some(s => s.monthId === activeMonth.id)
            },
            // full savings history
            savings
        });

    } catch (error) {
        console.error('ERROR fetching savings:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /savings/locked - only locked savings
// -----------------------------------------------
const getLockedSavings = async (req, res) => {
    try {
        const userId = req.user.id;

        const allSavings = await Savings.findByUserId(userId);

        // filter only locked ones
        const lockedSavings = allSavings.filter(s => s.status === 'locked');

        // calculate total locked amount across all cycles
        const total_locked = lockedSavings.reduce(
            (sum, s) => sum + Number(s.amount_saved), 0
        ).toFixed(2);

        res.status(200).json({
            message: "Locked savings fetched successfully",
            count: lockedSavings.length,
            total_locked: Number(total_locked),
            savings: lockedSavings
        });

    } catch (error) {
        console.error('ERROR fetching locked savings:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// POST /savings/unlock
// -----------------------------------------------
const unLockSavings = async (req, res) => {
    try {
        const userId = req.user.id;
        const { savingsId } = req.body;

        if (!savingsId) {
            return res.status(400).json({ message: "savingsId is required" });
        }

        // find the savings record
        const savings = await Savings.findById(savingsId);
        if (!savings) {
            return res.status(404).json({ message: "Savings record not found" });
        }

        // make sure this savings belongs to this user
        if (savings.userId !== userId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        // check if already unlocked
        if (savings.status === 'unlocked') {
            return res.status(400).json({ message: "Savings already unlocked" });
        }

        // check if unlock_date has passed
        const today = new Date();
        const unlockDate = new Date(savings.unlock_date);

        if (today < unlockDate) {
            return res.status(400).json({
                message: `Savings cannot be unlocked yet. Unlock date is ${savings.unlock_date}`,
                days_remaining: Math.ceil((unlockDate - today) / (1000 * 60 * 60 * 24))
            });
        }

        // unlock the savings
        await Savings.updateStatus(savingsId, 'unlocked');

        res.status(200).json({
            message: "Savings unlocked successfully 🔓",
            savings: {
                ...savings,
                status: 'unlocked'
            }
        });

    } catch (error) {
        console.error('ERROR unlocking savings:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// helper — calculates unlock date from lock date + duration
const getUnlockDate = (now, lock_duration_months) => {
    const unlockDate = new Date(now.getFullYear(), now.getMonth() + lock_duration_months, 28);
    return unlockDate.toISOString().slice(0, 10); // returns "YYYY-MM-DD"
};

module.exports = {
    createSavingsSettings,
    getSavingsSettings,
    getAllSavings,
    getLockedSavings,
    getUnlockDate,
    updateSavingsSettings,
    unLockSavings
};  