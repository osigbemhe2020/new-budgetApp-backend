// controllers/generalSettings.controller.js
const GeneralSettings = require('../models/general-settings.model');
const { updateActiveCycle } = require('../services/month.service');

// -----------------------------------------------
// GET /api/settings
// -----------------------------------------------
const getSettings = async (req, res) => {
    try {
        const userId = req.user.id;

        const settings = await GeneralSettings.findByUserId(userId);
        if (!settings) {
            return res.status(404).json({ message: "Settings not found" });
        }

        res.status(200).json({
            message: "Settings fetched successfully",
            settings: {
                currency: settings.currency,
                language: settings.language,
                timezone: settings.timezone,
                notifications: settings.notifications,
                cycle_start_day: settings.cycle_start_day,
                expense_release_buffer_days: settings.expense_release_buffer_days,
                cycle_changes_this_year: settings.cycle_changes_this_year,
                cycle_changes_this_month: settings.cycle_changes_this_month,
                last_cycle_change_date: settings.last_cycle_change_date
            }
        });

    } catch (error) {
        console.error('ERROR fetching settings:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// PUT /api/settings
// updates currency, language, timezone, notifications
// -----------------------------------------------
const updateSettings = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currency, language, timezone, notifications } = req.body;

        const settings = await GeneralSettings.findByUserId(userId);
        if (!settings) {
            return res.status(404).json({ message: "Settings not found" });
        }

        // use existing values as fallback if field not provided
        await GeneralSettings.updatePreferences(userId, {
            currency:      currency      ?? settings.currency,
            language:      language      ?? settings.language,
            timezone:      timezone      ?? settings.timezone,
            notifications: notifications ?? settings.notifications
        });

        res.status(200).json({
            message: "Settings updated successfully",
            settings: {
                currency:      currency      ?? settings.currency,
                language:      language      ?? settings.language,
                timezone:      timezone      ?? settings.timezone,
                notifications: notifications ?? settings.notifications
            }
        });

    } catch (error) {
        console.error('ERROR updating settings:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// PUT /api/settings/cycle
// changes cycle_start_day with limits enforced
// -----------------------------------------------
const updateCycleStartDay = async (req, res) => {
    try {
        const userId = req.user.id;
        const { cycle_start_day } = req.body;

        if (!cycle_start_day || cycle_start_day < 1 || cycle_start_day > 31) {
            return res.status(400).json({
                message: "cycle_start_day must be between 1 and 31"
            });
        }

        const settings = await GeneralSettings.findByUserId(userId);
        if (!settings) {
            return res.status(404).json({ message: "Settings not found" });
        }

        // check if cycle_start_day has been set yet
        // if not set (null), this is the initial set — no limits apply
        const isInitialSet = settings.cycle_start_day === null;

        if (!isInitialSet) {
            // check change limits
            const eligibility = await GeneralSettings.canChangeCycle(userId);
            if (!eligibility.allowed) {
                return res.status(400).json({
                    message: eligibility.reason,
                    cycle_changes_this_year: settings.cycle_changes_this_year,
                    cycle_changes_this_month: settings.cycle_changes_this_month
                });
            }
        }

        // update the active cycle dates + general_settings
        await updateActiveCycle(userId, cycle_start_day);

        res.status(200).json({
            message: isInitialSet
                ? "Cycle start day set successfully"
                : "Cycle start day updated successfully",
            cycle_start_day,
            notice: isInitialSet
                ? null
                : "Your current cycle has been extended to accommodate the new start day. Changes take effect from the next cycle.",
            remaining_changes_this_year: isInitialSet
                ? 3
                : 3 - (settings.cycle_changes_this_year + 1)
        });

    } catch (error) {
        console.error('ERROR updating cycle start day:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// PUT /api/settings/release-buffer
// changes expense_release_buffer_days
// -----------------------------------------------
const updateReleaseBuffer = async (req, res) => {
    try {
        const userId = req.user.id;
        const { expense_release_buffer_days } = req.body;

        if (!expense_release_buffer_days || expense_release_buffer_days < 1) {
            return res.status(400).json({
                message: "expense_release_buffer_days must be at least 1"
            });
        }

        // cap at 27 — must leave room for at least one valid release day in any cycle
        if (expense_release_buffer_days > 27) {
            return res.status(400).json({
                message: "expense_release_buffer_days cannot exceed 27"
            });
        }

        const settings = await GeneralSettings.findByUserId(userId);
        if (!settings) {
            return res.status(404).json({ message: "Settings not found" });
        }

        await GeneralSettings.updatePreferences(userId, {
            currency: settings.currency,
            language: settings.language,
            timezone: settings.timezone,
            notifications: settings.notifications,
            expense_release_buffer_days
        });

        res.status(200).json({
            message: "Release buffer updated successfully",
            expense_release_buffer_days,
            notice: `New expenses will now be released ${expense_release_buffer_days} days after creation by default`
        });

    } catch (error) {
        console.error('ERROR updating release buffer:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    getSettings,
    updateSettings,
    updateCycleStartDay,
    updateReleaseBuffer
};