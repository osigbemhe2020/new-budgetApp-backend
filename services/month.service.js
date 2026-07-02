// services/month.service.js
const Month = require('../models/month.model');
const Savings = require('../models/savings.model');
const GeneralSettings = require('../models/general-settings.model');
const { calculateCycle, isCycleLocked } = require('../helpers/cycleCalculator');

const formatDate = (date) => {
    if (!date) return null;
    if (typeof date === 'string' && date.length === 10) return date;
    const d = new Date(date);
    // add timezone offset to prevent UTC shift
    const offset = d.getTimezoneOffset();
    const adjusted = new Date(d.getTime() - offset * 60 * 1000);
    return adjusted.toISOString().slice(0, 10);
};

// const getOrCreateActiveMonth = async (userId) => {
//     const now = new Date();

//     const settings = await GeneralSettings.findByUserId(userId);
//     const cycle_start_day = settings?.cycle_start_day || 1;

//     const cycle = calculateCycle(cycle_start_day, now);
//     console.log('cycle calculated:', cycle);

    
//     let activeMonth = await Month.findByCycle(userId, cycle.cycle_start_date);

//     if (!activeMonth) {
//         console.log(`no month found for cycle starting ${cycle.cycle_start_date} — creating one`);
//         activeMonth = await Month.create({
//             userId,
//             year: cycle.record_year,
//             month: cycle.record_month,
//             cycle_start_date: cycle.cycle_start_date,
//             cycle_end_date: cycle.cycle_end_date
//         });
//     }

//     // check if current month is locked
//     const existingSavings = await Savings.findByMonthId(activeMonth.id);
//     const isLocked = existingSavings.length > 0;

//     if (isLocked) {
//         console.log('current cycle is locked — moving to next cycle');

//         const nextCycleDate = new Date(cycle.cycle_end_date);
//         nextCycleDate.setDate(nextCycleDate.getDate() + 1);

//         const nextCycle = calculateCycle(cycle_start_day, nextCycleDate);

//         let nextMonth = await Month.findByCycle(userId, nextCycle.cycle_start_date);
//         if (!nextMonth) {
//             nextMonth = await Month.create({
//                 userId,
//                 year: nextCycle.record_year,
//                 month: nextCycle.record_month,
//                 cycle_start_date: nextCycle.cycle_start_date,
//                 cycle_end_date: nextCycle.cycle_end_date
//             });
//         }

//         return { 
//             ...nextMonth, 
//             isNextCycle: true,
//             cycle_start_date: formatDate(nextMonth.cycle_start_date),
//             cycle_end_date: formatDate(nextMonth.cycle_end_date)
//         };
//     }

//     return { 
//         ...activeMonth, 
//         isNextCycle: false,
//         cycle_start_date: formatDate(activeMonth.cycle_start_date),
//         cycle_end_date: formatDate(activeMonth.cycle_end_date)
//     };
// };

const getOrCreateActiveMonth = async (userId) => {
    const now = new Date();

    const settings = await GeneralSettings.findByUserId(userId);
    const cycle_start_day = settings?.cycle_start_day || 1;

    const cycle = calculateCycle(cycle_start_day, now);
    console.log('cycle calculated:', cycle);

    let activeMonth = await Month.findByCycle(userId, cycle.cycle_start_date);

    if (!activeMonth) {
        console.log(`no month found for cycle starting ${cycle.cycle_start_date} — creating one`);

        // pull forward the previous month's surplus, if any
        const priorMonths = await Month.findAllByUser(userId);
        const priorBalance = priorMonths.length > 0 ? Number(priorMonths[0].balance) : 0;
        const balance_brought_forward = priorBalance > 0 ? priorBalance : 0;

        activeMonth = await Month.create({
            userId,
            year: cycle.record_year,
            month: cycle.record_month,
            cycle_start_date: cycle.cycle_start_date,
            cycle_end_date: cycle.cycle_end_date,
            balance_brought_forward
        });
    }

    // check if current month is locked
    const existingSavings = await Savings.findByMonthId(activeMonth.id);
    const isLocked = existingSavings.length > 0;

    if (isLocked) {
        console.log('current cycle is locked — moving to next cycle');

        const nextCycleDate = new Date(cycle.cycle_end_date);
        nextCycleDate.setDate(nextCycleDate.getDate() + 1);

        const nextCycle = calculateCycle(cycle_start_day, nextCycleDate);

        let nextMonth = await Month.findByCycle(userId, nextCycle.cycle_start_date);
        if (!nextMonth) {
            // activeMonth here is the just-locked cycle — its balance carries forward
            const priorBalance = Number(activeMonth.balance);
            const balance_brought_forward = priorBalance > 0 ? priorBalance : 0;

            nextMonth = await Month.create({
                userId,
                year: nextCycle.record_year,
                month: nextCycle.record_month,
                cycle_start_date: nextCycle.cycle_start_date,
                cycle_end_date: nextCycle.cycle_end_date,
                balance_brought_forward
            });
        }

        return { 
            ...nextMonth, 
            isNextCycle: true,
            cycle_start_date: formatDate(nextMonth.cycle_start_date),
            cycle_end_date: formatDate(nextMonth.cycle_end_date)
        };
    }

    return { 
        ...activeMonth, 
        isNextCycle: false,
        cycle_start_date: formatDate(activeMonth.cycle_start_date),
        cycle_end_date: formatDate(activeMonth.cycle_end_date)
    };
};

// called when user changes cycle_start_day
// extends current cycle end date and updates going forward
const updateActiveCycle = async (userId, new_cycle_start_day) => {
    const now = new Date();
    const settings = await GeneralSettings.findByUserId(userId);
    const old_cycle_start_day = settings.cycle_start_day;

    // calculate what the new cycle end date should be
    // new cycle starts on new_cycle_start_day next occurrence
    const newCycle = calculateCycle(new_cycle_start_day, now);

    // find current active month
    const old_cycle = calculateCycle(old_cycle_start_day, now);
    const activeMonth = await Month.findByCycle(userId, old_cycle.cycle_start_date);

    if (activeMonth) {
        // extend current cycle end date to one day before new cycle starts
        const newEndDate = new Date(newCycle.cycle_start_date);
        newEndDate.setDate(newEndDate.getDate() - 1);
        const newCycleEndDate = newEndDate.toISOString().slice(0, 10);

        await Month.updateCycleEndDate(activeMonth.id, newCycleEndDate);
        console.log(`cycle extended: new end date = ${newCycleEndDate}`);
    }

    // update cycle_start_day in general settings
    await GeneralSettings.updateCycleStartDay(userId, new_cycle_start_day);
};

module.exports = { getOrCreateActiveMonth, updateActiveCycle };