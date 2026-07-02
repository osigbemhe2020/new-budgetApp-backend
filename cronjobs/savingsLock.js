// jobs/savingsLock.job.js
// const cron = require('node-cron');
// const { lockMonth } = require('../services/savings.service');
// const Savings = require('../models/savings.model');
// const SavingsSettings = require('../models/savings-settings.model');
// const Month = require('../models/month.model');
// const pool = require('../config/db');

// // runs every day at midnight to check for cycles that ended yesterday
// const startSavingsLockJob = () => {
//     cron.schedule('0 0 0 * * *', async () => {
//         console.log('🔒 Savings lock cron job fired:', new Date().toISOString());

//         try {
//             const yesterday = new Date();
//             yesterday.setDate(yesterday.getDate() - 1);
//             const yesterdayStr = yesterday.toISOString().slice(0, 10);

//             // find all months whose cycle ended yesterday
//             const [months] = await pool.execute(
//                 'SELECT * FROM months WHERE cycle_end_date = ?',
//                 [yesterdayStr]
//             );

//             for (const month of months) {
//                 try {
//                     // skip if already locked
//                     const existingSavings = await Savings.findByMonthId(month.id);
//                     if (existingSavings.length > 0) {
//                         console.log(`Month ${month.id} already locked — skipping`);
//                         continue;
//                     }

//                     // skip if user has no savings settings
//                     const savingsSettings = await SavingsSettings.findByUserId(month.userId);
//                     if (!savingsSettings) {
//                         console.log(`No savings settings for user ${month.userId} — skipping`);
//                         continue;
//                     }

//                     // lock the month
//                     await lockMonth(month.userId, month.id);
//                     console.log(`✅ Locked savings for user ${month.userId} month ${month.id}`);

//                 } catch (monthError) {
//                     console.error(`❌ Failed to lock month ${month.id}:`, monthError);
//                 }
//             }

//             console.log('✅ Savings lock cron job completed');

//         } catch (error) {
//             console.error('❌ Savings lock cron job failed:', error);
//         }
//     });
// };

// // runs every day at midnight to check for savings ready to unlock
// const startSavingsUnlockJob = () => {
//     cron.schedule('0 0 0 * * *', async () => {
//         console.log('🔓 Savings unlock cron job fired:', new Date().toISOString());

//         try {
//             const today = new Date().toISOString().slice(0, 10);

//             // find all locked savings whose unlock_date is today
//             const [savingsToUnlock] = await pool.execute(
//                 'SELECT * FROM savings WHERE unlock_date = ? AND status = ?',
//                 [today, 'locked']
//             );

//             for (const saving of savingsToUnlock) {
//                 try {
//                     await Savings.updateStatus(saving.id, 'unlocked');
//                     console.log(`✅ Unlocked savings ${saving.id} for user ${saving.userId}`);
//                 } catch (err) {
//                     console.error(`❌ Failed to unlock savings ${saving.id}:`, err);
//                 }
//             }

//             console.log('✅ Savings unlock cron job completed');

//         } catch (error) {
//             console.error('❌ Savings unlock cron job failed:', error);
//         }
//     });
// };

// module.exports = { startSavingsLockJob, startSavingsUnlockJob };