// helpers/cycleCalculator.js

// returns the last day of a given month
const getLastDayOfMonth = (year, month) => {
    return new Date(year, month, 0).getDate(); // day 0 of next month = last day of current month
};

// returns the actual cycle start day accounting for short months
// e.g. cycle_start_day = 31, month = June (30 days) → returns 30
const getActualCycleDay = (cycle_start_day, year, month) => {
    const lastDay = getLastDayOfMonth(year, month);
    return Math.min(cycle_start_day, lastDay);
};

// calculates cycle_start_date and cycle_end_date for a given cycle
// also determines which month is the RECORD month (the one with more days)
const calculateCycle = (cycle_start_day, referenceDate = new Date()) => {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth() + 1; // 1-12
    const day = referenceDate.getDate();

    // get actual start day for current month (handles short months)
    const actualStartDay = getActualCycleDay(cycle_start_day, year, month);

    let cycleStartYear, cycleStartMonth, cycleStartDay;
    let cycleEndYear, cycleEndMonth, cycleEndDay;
    let recordYear, recordMonth;

    // determine if we are before or after the cycle start day this month
    if (day >= actualStartDay) {
        // we are in the current cycle e.g. today is June 20, cycle starts June 15
        // cycle started this month
        cycleStartYear = year;
        cycleStartMonth = month;
        cycleStartDay = actualStartDay;
    } else {
        // we are before the cycle start day e.g. today is June 10, cycle starts June 15
        // cycle started last month
        const prevMonthDate = new Date(year, month - 2, 1); // first day of previous month
        cycleStartYear = prevMonthDate.getFullYear();
        cycleStartMonth = prevMonthDate.getMonth() + 1;
        cycleStartDay = getActualCycleDay(cycle_start_day, cycleStartYear, cycleStartMonth);
    }

    // cycle end = one day before next cycle start
    const nextCycleStartDate = new Date(cycleStartYear, cycleStartMonth, cycleStartDay);
    // subtract 1 day to get cycle end
    const cycleEndDate = new Date(nextCycleStartDate - 1);
    cycleEndYear = cycleEndDate.getFullYear();
    cycleEndMonth = cycleEndDate.getMonth() + 1;
    cycleEndDay = cycleEndDate.getDate();

    // format dates as YYYY-MM-DD
    const cycle_start_date = `${cycleStartYear}-${String(cycleStartMonth).padStart(2, '0')}-${String(cycleStartDay).padStart(2, '0')}`;
    const cycle_end_date = `${cycleEndYear}-${String(cycleEndMonth).padStart(2, '0')}-${String(cycleEndDay).padStart(2, '0')}`;

    // determine record month (month with most days in cycle)
    const daysInStartMonth = getLastDayOfMonth(cycleStartYear, cycleStartMonth) - cycleStartDay + 1;
    const daysInEndMonth = cycleEndDay;

    // special exception: cycle_start_day = 15 on February
    // february gets the record regardless of day count
    const isFebruaryException = cycle_start_day === 15 && cycleStartMonth === 2;

    if (isFebruaryException) {
        recordYear = cycleStartYear;
        recordMonth = cycleStartMonth; // february gets the record
    } else if (daysInStartMonth >= daysInEndMonth) {
        recordYear = cycleStartYear;
        recordMonth = cycleStartMonth;
    } else {
        recordYear = cycleEndYear;
        recordMonth = cycleEndMonth;
    }

    return {
        cycle_start_date,
        cycle_end_date,
        record_year: recordYear,
        record_month: recordMonth,
        days_in_start_month: daysInStartMonth,
        days_in_end_month: daysInEndMonth
    };
};

// checks if a given date is within a cycle
const isDateInCycle = (date, cycle_start_date, cycle_end_date) => {
    const d = new Date(date);
    const start = new Date(cycle_start_date);
    const end = new Date(cycle_end_date);
    return d >= start && d <= end;
};

// checks if the current cycle is locked (past cycle_end_date)
const isCycleLocked = (cycle_end_date) => {
    const today = new Date();
    const end = new Date(cycle_end_date);
    return today > end;
};

module.exports = {
    calculateCycle,
    getActualCycleDay,
    getLastDayOfMonth,
    isDateInCycle,
    isCycleLocked
};