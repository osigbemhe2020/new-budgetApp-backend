// helpers/cycleUtils.js
const pool = require('../config/db');

// an active cycle = has at least one income AND one expense
const countActiveCycles = async (userId) => {
    const [rows] = await pool.execute(
        `SELECT m.id
         FROM months m
         WHERE m.userId = ?
         AND EXISTS (
             SELECT 1 FROM income_sources i
             WHERE i.monthId = m.id AND i.userId = ?
         )
         AND EXISTS (
             SELECT 1 FROM expenses e
             WHERE e.monthId = m.id AND e.userId = ?
         )
         ORDER BY m.cycle_start_date DESC`,
        [userId, userId, userId]
    );
    return rows; // returns array of active month rows, ordered newest first
};

// get the tier weight for a cycle based on its position in history
// position 1 = most recent active cycle
const getTierWeight = (position) => {
    const tier = Math.ceil(position / 6); // 6 cycles per tier
    const weights = {
        1: 100,  // cycles 1-6
        2: 85,   // cycles 7-12
        3: 70,   // cycles 13-18
        4: 55,   // cycles 19-24
        5: 40,   // cycles 25-30
        6: 25,   // cycles 31-36
    };
    return weights[tier] || 10; // beyond tier 6 → negligible weight
};

// determine which phase the credit score is in
// based on number of active cycles
const getPhase = (activeCycleCount) => {
    if (activeCycleCount <= 4) return 1;      // income + savings only
    if (activeCycleCount <= 6) return 2;      // + inflation
    if (activeCycleCount <= 11) return 3;     // + debt
    return 4;                                  // mature, all components
};

// get component weights for a given phase
const getPhaseWeights = (phase) => {
    const weights = {
        1: { income: 0.45, savings: 0.55, inflation: 0,    debt: 0    },
        2: { income: 0.40, savings: 0.35, inflation: 0.25, debt: 0    },
        3: { income: 0.30, savings: 0.25, inflation: 0.20, debt: 0.25 },
        4: { income: 0.25, savings: 0.25, inflation: 0.15, debt: 0.35 },
    };
    return weights[phase];
};

// determine band and interest rate from credit score
const getBandAndRate = (credit_score) => {
    if (credit_score >= 750) return { band: 'excellent', interest_rate: 5.00  };
    if (credit_score >= 650) return { band: 'good',      interest_rate: 10.00 };
    if (credit_score >= 550) return { band: 'fair',      interest_rate: 15.00 };
    if (credit_score >= 450) return { band: 'poor',      interest_rate: 20.00 };
    return                          { band: 'very_poor', interest_rate: 25.00 };
};

module.exports = {
    countActiveCycles,
    getTierWeight,
    getPhase,
    getPhaseWeights,
    getBandAndRate
};