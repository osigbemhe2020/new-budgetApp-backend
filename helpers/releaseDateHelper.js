// helpers/releaseDateHelper.js

// calculates the default release_date = today + buffer_days
// returns null if it would fall outside the cycle
const calculateDefaultReleaseDate = (bufferDays, cycleEndDate) => {
    const today = new Date();
    const defaultDate = new Date(today);
    defaultDate.setDate(defaultDate.getDate() + bufferDays);

    const defaultStr = defaultDate.toISOString().slice(0, 10);
    const cycleEnd = cycleEndDate instanceof Date
        ? cycleEndDate.toISOString().slice(0, 10)
        : cycleEndDate;

    // if default falls outside the cycle, return null (caller handles soft warning)
    if (defaultStr > cycleEnd) return null;

    return defaultStr;
};

// validates a manually provided release_date
// returns { valid: true } or { valid: false, message: '...' }
const validateReleaseDate = (release_date, cycleEndDate) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const cycleEnd = cycleEndDate instanceof Date
        ? cycleEndDate.toISOString().slice(0, 10)
        : cycleEndDate;

    if (release_date < tomorrowStr) {
        return {
            valid: false,
            message: `release_date must be at least tomorrow (${tomorrowStr})`
        };
    }

    if (release_date > cycleEnd) {
        return {
            valid: false,
            message: `release_date cannot exceed cycle end date (${cycleEnd})`
        };
    }

    return { valid: true };
};

// builds the valid_range object returned in the soft warning response
const getValidReleaseDateRange = (cycleEndDate) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const cycleEnd = cycleEndDate instanceof Date
        ? cycleEndDate.toISOString().slice(0, 10)
        : cycleEndDate;

    // no valid range exists if tomorrow is already past cycle end
    if (tomorrowStr > cycleEnd) return null;

    return {
        earliest: tomorrowStr,
        latest: cycleEnd
    };
};

module.exports = {
    calculateDefaultReleaseDate,
    validateReleaseDate,
    getValidReleaseDateRange
};