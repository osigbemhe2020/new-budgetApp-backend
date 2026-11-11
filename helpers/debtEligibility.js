// helpers/debtEligibility.js
const CreditScore = require('../models/credit-score.model');
const { countActiveCycles } = require('./cycleUtils');

const checkDebtEligibility = async (userId) => {
    const activeCycles = await countActiveCycles(userId);
    const count = activeCycles.length;

    if (count < 6) {
        return {
            eligible: false,
            active_cycles: count,
            cycles_remaining: 6 - count,
            message: `Debt feature unlocks after 6 active cycles. You have completed ${count} so far.`
        };
    }

    return { eligible: true, active_cycles: count };
};

const getCurrentInterestRate = async (userId) => {
    return await CreditScore.getCurrentInterestRate(userId);
};

module.exports = { checkDebtEligibility, getCurrentInterestRate };