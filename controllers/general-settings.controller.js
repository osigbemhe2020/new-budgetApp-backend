// controllers/general-settings.controller.js
const GeneralSettings = require('../models/general-settings.model');
const { updateActiveCycle } = require('../services/month.service');

// Must match the limit enforced in GeneralSettings.canChangeCycle
const MAX_CYCLE_CHANGES_PER_YEAR = 3;
const MIN_RELEASE_BUFFER_DAYS = 1;
const MAX_RELEASE_BUFFER_DAYS = 27; // leaves room for a valid release day in any cycle

const badRequest = (res, message, field, extra = {}) =>
    res.status(400).json({ message, ...(field && { field }), ...extra });

const isValidTimezone = (tz) => {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch (error) {
        return false;
    }
};

// A non-empty string, trimmed, no longer than the column allows
const validText = (value, maxLength) =>
    typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;

// -----------------------------------------------
// GET /settings
// -----------------------------------------------
const getSettings = async (req, res) => {
    try {
        const settings = await GeneralSettings.findByUserId(req.user.id);
        if (!settings) {
            return res.status(404).json({ message: 'Settings not found' });
        }

        return res.status(200).json({
            message: 'Settings fetched successfully',
            settings: {
                currency: settings.currency,
                language: settings.language,
                timezone: settings.timezone,
                notifications: Boolean(settings.notifications),
                cycle_start_day: settings.cycle_start_day,
                expense_release_buffer_days: settings.expense_release_buffer_days,
                cycle_changes_this_year: settings.cycle_changes_this_year,
                cycle_changes_this_month: settings.cycle_changes_this_month,
                last_cycle_change_date: settings.last_cycle_change_date
            }
        });
    } catch (error) {
        console.error('ERROR fetching settings:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

// -----------------------------------------------
// PUT /settings
// updates currency, language, timezone, notifications
// Any subset may be sent; fields left out keep their current value.
// Does NOT touch cycle_start_day or expense_release_buffer_days.
// -----------------------------------------------
const updateSettings = async (req, res) => {
    try {
        const { currency, language, timezone, notifications } = req.body || {};
        const updates = {};

        if (currency !== undefined) {
            if (!validText(currency, 10)) {
                return badRequest(res, 'currency must be a non-empty string of at most 10 characters', 'currency');
            }
            updates.currency = currency.trim();
        }

        if (language !== undefined) {
            if (!validText(language, 10)) {
                return badRequest(res, 'language must be a non-empty string of at most 10 characters', 'language');
            }
            updates.language = language.trim();
        }

        if (timezone !== undefined) {
            if (!validText(timezone, 50) || !isValidTimezone(timezone.trim())) {
                return badRequest(res, 'timezone must be a valid IANA timezone name, such as Africa/Lagos', 'timezone');
            }
            updates.timezone = timezone.trim();
        }

        if (notifications !== undefined) {
            if (typeof notifications !== 'boolean') {
                return badRequest(res, 'notifications must be true or false', 'notifications');
            }
            updates.notifications = notifications;
        }

        if (Object.keys(updates).length === 0) {
            return badRequest(res, 'Provide at least one of: currency, language, timezone, notifications');
        }

        const settings = await GeneralSettings.findByUserId(req.user.id);
        if (!settings) {
            return res.status(404).json({ message: 'Settings not found' });
        }

        const merged = {
            currency: updates.currency ?? settings.currency,
            language: updates.language ?? settings.language,
            timezone: updates.timezone ?? settings.timezone,
            notifications: updates.notifications ?? Boolean(settings.notifications)
        };

        // updatePreferences also writes expense_release_buffer_days (and falls back
        // to 3 when it is missing), so pass the current value or it would be reset.
        await GeneralSettings.updatePreferences(req.user.id, {
            ...merged,
            expense_release_buffer_days: settings.expense_release_buffer_days
        });

        return res.status(200).json({
            message: 'Settings updated successfully',
            settings: merged
        });
    } catch (error) {
        console.error('ERROR updating settings:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

// -----------------------------------------------
// PUT /settings/cycle
// sets or changes cycle_start_day, with change limits enforced
// -----------------------------------------------
const updateCycleStartDay = async (req, res) => {
    try {
        const userId = req.user.id;
        const { cycle_start_day } = req.body || {};

        if (!Number.isInteger(cycle_start_day) || cycle_start_day < 1 || cycle_start_day > 31) {
            return badRequest(res, 'cycle_start_day must be a whole number between 1 and 31', 'cycle_start_day');
        }

        const settings = await GeneralSettings.findByUserId(userId);
        if (!settings) {
            return res.status(404).json({ message: 'Settings not found' });
        }

        // cycle_start_day is null until it is set for the first time.
        // The first set is not subject to the change limits.
        const isInitialSet = settings.cycle_start_day === null;

        if (!isInitialSet) {
            // Setting the same day again would use up a change for nothing
            if (settings.cycle_start_day === cycle_start_day) {
                return badRequest(res, `cycle_start_day is already ${cycle_start_day}`, 'cycle_start_day');
            }

            const eligibility = await GeneralSettings.canChangeCycle(userId);
            if (!eligibility.allowed) {
                return badRequest(res, eligibility.reason, undefined, {
                    cycle_changes_this_year: settings.cycle_changes_this_year,
                    cycle_changes_this_month: settings.cycle_changes_this_month
                });
            }
        }

        // updates the active cycle dates and general_settings
        await updateActiveCycle(userId, cycle_start_day);

        // Read the counter back instead of guessing, so the number is right
        // whether or not the first set counts as a change.
        const updated = await GeneralSettings.findByUserId(userId);
        const used = updated ? updated.cycle_changes_this_year : settings.cycle_changes_this_year;

        return res.status(200).json({
            message: isInitialSet
                ? 'Cycle start day set successfully'
                : 'Cycle start day updated successfully',
            cycle_start_day,
            notice: isInitialSet
                ? null
                : 'Your current cycle has been extended to accommodate the new start day. Changes take effect from the next cycle.',
            remaining_changes_this_year: Math.max(0, MAX_CYCLE_CHANGES_PER_YEAR - used)
        });
    } catch (error) {
        console.error('ERROR updating cycle start day:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

// -----------------------------------------------
// PUT /settings/release-buffer
// changes expense_release_buffer_days
// -----------------------------------------------
const updateReleaseBuffer = async (req, res) => {
    try {
        const { expense_release_buffer_days } = req.body || {};

        if (!Number.isInteger(expense_release_buffer_days)) {
            return badRequest(res, 'expense_release_buffer_days must be a whole number', 'expense_release_buffer_days');
        }
        if (expense_release_buffer_days < MIN_RELEASE_BUFFER_DAYS) {
            return badRequest(res, 'expense_release_buffer_days must be at least 1', 'expense_release_buffer_days');
        }
        if (expense_release_buffer_days > MAX_RELEASE_BUFFER_DAYS) {
            return badRequest(res, 'expense_release_buffer_days cannot exceed 27', 'expense_release_buffer_days');
        }

        const settings = await GeneralSettings.findByUserId(req.user.id);
        if (!settings) {
            return res.status(404).json({ message: 'Settings not found' });
        }

        await GeneralSettings.updatePreferences(req.user.id, {
            currency: settings.currency,
            language: settings.language,
            timezone: settings.timezone,
            notifications: settings.notifications,
            expense_release_buffer_days
        });

        return res.status(200).json({
            message: 'Release buffer updated successfully',
            expense_release_buffer_days,
            notice: `New expenses will now be released ${expense_release_buffer_days} days after creation by default`
        });
    } catch (error) {
        console.error('ERROR updating release buffer:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    getSettings,
    updateSettings,
    updateCycleStartDay,
    updateReleaseBuffer
};