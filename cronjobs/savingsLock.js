//cronjobs/savingsLock.job.js
const cron = require('node-cron');
const { lockMonth } = require('../services/savings.service');
const Savings = require('../models/savings.model');
const SavingsSettings = require('../models/savings-settings.model');
const Month = require('../models/month.model');
const pool = require('../config/db');
const Expense = require('../models/expense.model');
const ExpenseTemplate = require('../models/expense-template.model');
const { getOrCreateActiveMonth } = require('../services/month.service');

const startRecurringExpenseJob = () => {
    // runs every day at midnight
    cron.schedule('0 0 0 * * *', async () => {
        console.log('🔄 Recurring expense cron job fired:', new Date().toISOString());

        try {
            // get all recurring templates across all users
            const [templates] = await pool.execute(
                'SELECT * FROM expense_templates WHERE is_recurring = true'
            );

            for (const template of templates) {
                try {
                    // get active month for this user
                    const activeMonth = await getOrCreateActiveMonth(template.userId);

                    // calculate which day of the cycle we are on today
                    const cycleStart = new Date(activeMonth.cycle_start_date);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    cycleStart.setHours(0, 0, 0, 0);

                    const dayOfCycle = Math.floor(
                        (today - cycleStart) / (1000 * 60 * 60 * 24)
                    ) + 1; // day 1 = first day of cycle

                    // only fire if today matches this template's recurring_day
                    if (dayOfCycle !== template.recurring_day) continue;

                    // check if cycle is locked — skip if so
                    const existingSavings = await Savings.findByMonthId(activeMonth.id);
                    if (existingSavings.length > 0) {
                        console.log(`Cycle locked for user ${template.userId} — skipping recurring expense`);
                        continue;
                    }

                    // calculate default release_date for this auto-created expense
                    const { calculateDefaultReleaseDate } = require('../helpers/releaseDateHelper');
                    const settings = await GeneralSettings.findByUserId(template.userId);
                    const bufferDays = settings?.expense_release_buffer_days || 3;
                    const release_date = calculateDefaultReleaseDate(bufferDays, activeMonth.cycle_end_date)
                        || activeMonth.cycle_end_date; // fallback to cycle end if buffer doesn't fit

                    // create the expense from the template
                    await Expense.create({
                        userId: template.userId,
                        monthId: activeMonth.id,
                        expense_name: template.template_name,
                        amount: template.last_amount || template.default_amount,
                        category: template.category,
                        release_date
                    });

                    console.log(`✅ Auto-created recurring expense "${template.template_name}" for user ${template.userId}`);

                } catch (templateError) {
                    console.error(`❌ Failed recurring expense for template ${template.id}:`, templateError);
                }
            }

            console.log('✅ Recurring expense cron job completed');

        } catch (error) {
            console.error('❌ Recurring expense cron job failed:', error);
        }
    });
};
// runs every day at midnight to check for cycles that ended yesterday
const startSavingsLockJob = () => {
    cron.schedule('0 0 0 * * *', async () => {
        console.log('🔒 Savings lock cron job fired:', new Date().toISOString());

        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().slice(0, 10);

            // find all months whose cycle ended yesterday
            const [months] = await pool.execute(
                'SELECT * FROM months WHERE cycle_end_date = ?',
                [yesterdayStr]
            );

            for (const month of months) {
                try {
                    // skip if already locked
                    const existingSavings = await Savings.findByMonthId(month.id);
                    if (existingSavings.length > 0) {
                        console.log(`Month ${month.id} already locked — skipping`);
                        continue;
                    }

                    // skip if user has no savings settings
                    const savingsSettings = await SavingsSettings.findByUserId(month.userId);
                    if (!savingsSettings) {
                        console.log(`No savings settings for user ${month.userId} — skipping`);
                        continue;
                    }

                    // lock the month
                    await lockMonth(month.userId, month.id);
                    console.log(`✅ Locked savings for user ${month.userId} month ${month.id}`);

                } catch (monthError) {
                    console.error(`❌ Failed to lock month ${month.id}:`, monthError);
                }
            }

            console.log('✅ Savings lock cron job completed');

        } catch (error) {
            console.error('❌ Savings lock cron job failed:', error);
        }
    });
};

// runs every day at midnight to check for savings ready to unlock
const startSavingsUnlockJob = () => {
    cron.schedule('0 0 0 * * *', async () => {
        console.log('🔓 Savings unlock cron job fired:', new Date().toISOString());

        try {
            const today = new Date().toISOString().slice(0, 10);

            // find all locked savings whose unlock_date is today
            const [savingsToUnlock] = await pool.execute(
                'SELECT * FROM savings WHERE unlock_date = ? AND status = ?',
                [today, 'locked']
            );

            for (const saving of savingsToUnlock) {
                try {
                    await Savings.updateStatus(saving.id, 'unlocked');
                    console.log(`✅ Unlocked savings ${saving.id} for user ${saving.userId}`);
                } catch (err) {
                    console.error(`❌ Failed to unlock savings ${saving.id}:`, err);
                }
            }

            console.log('✅ Savings unlock cron job completed');

        } catch (error) {
            console.error('❌ Savings unlock cron job failed:', error);
        }
    });
};

const startExpenseReleaseJob = () => {
    cron.schedule('0 0 0 * * *', async () => {
        console.log('🔓 Expense release cron job fired:', new Date().toISOString());
        try {
            const released = await Expense.releaseExpiredExpenses();
            console.log(`✅ Released ${released} expense(s)`);
        } catch (error) {
            console.error('❌ Expense release cron job failed:', error);
        }
    });
};
// resets cycle_changes_this_month for all users
// runs on the 1st of every month at midnight
const startMonthlyResetJob = () => {
    cron.schedule('0 0 0 1 * *', async () => {
        console.log('🔄 Monthly cycle change reset job fired');
        try {
            const [users] = await pool.execute('SELECT userId FROM general_settings');
            for (const user of users) {
                await GeneralSettings.resetMonthlyChangeCount(user.userId);
            }
            console.log(`✅ Monthly reset complete for ${users.length} users`);
        } catch (error) {
            console.error('❌ Monthly reset job failed:', error);
        }
    });
};

// resets cycle_changes_this_year for all users
// runs on Jan 1st at midnight
const startYearlyResetJob = () => {
    cron.schedule('0 0 0 1 1 *', async () => {
        console.log('🔄 Yearly cycle change reset job fired');
        try {
            const [users] = await pool.execute('SELECT userId FROM general_settings');
            for (const user of users) {
                await GeneralSettings.resetYearlyChangeCount(user.userId);
            }
            console.log(`✅ Yearly reset complete for ${users.length} users`);
        } catch (error) {
            console.error('❌ Yearly reset job failed:', error);
        }
    });
};
module.exports = { startSavingsLockJob,
                startRecurringExpenseJob, 
                startSavingsUnlockJob, 
                startExpenseReleaseJob, 
                startMonthlyResetJob, 
                startYearlyResetJob };
