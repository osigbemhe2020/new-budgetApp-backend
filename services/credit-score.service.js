// services/creditScore.service.js
const pool = require('../config/db');
const CreditScore = require('../models/credit-score.model');
const InflationScore = require('../models/inflation-score.model');
const SavingsSettings = require('../models/savings-settings.model');
const {
    countActiveCycles,
    getTierWeight,
    getPhase,
    getPhaseWeights,
    getBandAndRate
} = require('../helpers/cycleUtils');

// -----------------------------------------------
// COMPONENT SCORERS
// each returns 0-100
// -----------------------------------------------

const scoreIncomeHealth = (cycleData) => {
    const { total_income, total_expense, prev_income } = cycleData;

    // consistency — did they have income this cycle?
    const consistency = total_income > 0 ? 40 : 0;

    // growth — is income growing vs last cycle?
    let growth = 0;
    if (prev_income === null) {
        growth = 25; // first cycle, neutral
    } else if (total_income > prev_income) {
        growth = 40;
    } else if (total_income === prev_income) {
        growth = 25;
    } else {
        growth = 5; // shrinking income
    }

    // expense ratio — how much of income is spent?
    let expense_ratio = 0;
    if (total_income > 0) {
        const ratio = total_expense / total_income;
        expense_ratio = Math.max(0, Math.min(20, (1 - ratio) * 20));
    }

    return Math.min(100, consistency + growth + expense_ratio);
};

const scoreSavings = async (userId, cycleData, activeCycles) => {
    const { amount_saved, monthId } = cycleData;

    // has savings settings been set up?
    const settings = await SavingsSettings.findByUserId(userId);
    const has_settings = settings ? 10 : 0;

    // did they actually save this cycle?
    const [savingsRows] = await pool.execute(
        'SELECT * FROM savings WHERE userId = ? AND monthId = ?',
        [userId, monthId]
    );
    const did_save = savingsRows.length > 0 ? 30 : 0;

    // savings rate bonus
    const rate_bonus = settings
        ? Math.min(40, settings.savings_percentage * 0.4)
        : 0;

    // savings amount vs avg income of last 6 active cycles
    let savings_vs_income = 0;
    if (amount_saved > 0 && activeCycles.length > 0) {
        const last6 = activeCycles.slice(0, 6);
        const avg_income = last6.reduce((sum, c) => sum + Number(c.total_income), 0) / last6.length;

        if (avg_income > 0) {
            const ratio = (amount_saved / avg_income) * 100;
            if (ratio >= 20) savings_vs_income = 20;
            else if (ratio >= 10) savings_vs_income = 15;
            else if (ratio >= 5) savings_vs_income = 10;
            else if (ratio >= 1) savings_vs_income = 5;
        }
    }

    // early unlock penalty
    let early_unlock_penalty = 0;
    if (savingsRows.length > 0) {
        const saving = savingsRows[0];
        const today = new Date().toISOString().slice(0, 10);
        if (saving.status === 'unlocked' && today < saving.unlock_date) {
            early_unlock_penalty = -15;
        }
    }

    return Math.max(0, Math.min(100,
        has_settings + did_save + rate_bonus + savings_vs_income + early_unlock_penalty
    ));
};

const scoreDebt = async (userId, cycleData) => {
    const { monthId, total_income } = cycleData;

    // did they take on new debt this cycle?
    const [debtsThisCycle] = await pool.execute(
        'SELECT * FROM debts WHERE userId = ? AND monthId = ?',
        [userId, monthId]
    );
    const no_debt_bonus = debtsThisCycle.length === 0 ? 30 : 0;

    // repayment consistency across ALL debts
    const [allDebts] = await pool.execute(
        `SELECT * FROM debts WHERE userId = ? AND repayment_months IS NOT NULL`,
        [userId]
    );

    let repayment_score = 40; // default full score if no debts
    if (allDebts.length > 0) {
        const total_expected = allDebts.reduce((sum, d) => sum + Number(d.repayment_months), 0);
        const total_paid = allDebts.reduce((sum, d) => sum + Number(d.months_paid), 0);
        repayment_score = total_expected > 0
            ? Math.min(40, (total_paid / total_expected) * 40)
            : 40;
    }

    // debt to income ratio
    const [activeDebts] = await pool.execute(
        `SELECT SUM(debt_amount) as total_debt FROM debts
         WHERE userId = ? AND status = 'pending'`,
        [userId]
    );
    const total_active_debt = Number(activeDebts[0]?.total_debt) || 0;
    const dti_ratio = total_income > 0 ? total_active_debt / total_income : 0;
    const dti_score = Math.max(0, 30 - (dti_ratio * 30));

    return Math.min(100, no_debt_bonus + repayment_score + dti_score);
};

const scoreInflation = async (userId, monthId, activeCycles) => {
    // need at least 2 prior cycles for inflation comparison
    if (activeCycles.length < 2) return null;

    // get latest basket inflation score for this cycle
    const [basketScores] = await pool.execute(
        `SELECT * FROM inflation_scores
         WHERE userId = ? AND monthId = ? AND templateId IN (
             SELECT id FROM expense_templates WHERE userId = ? AND is_basket = true
         )`,
        [userId, monthId, userId]
    );

    if (!basketScores.length) return null;

    // get average basket inflation this cycle
    const validScores = basketScores.filter(s => s.inflation_percentage !== null);
    if (!validScores.length) return null;

    const avg_basket_inflation = validScores.reduce(
        (sum, s) => sum + Number(s.inflation_percentage), 0
    ) / validScores.length;

    // get income growth this cycle vs previous
    const currentMonth = activeCycles[0];
    const previousMonth = activeCycles[1];
    const income_growth = previousMonth.total_income > 0
        ? ((currentMonth.total_income - previousMonth.total_income) / previousMonth.total_income) * 100
        : 0;

    // score: does income growth beat basket inflation?
    let base_score = 0;
    if (income_growth > avg_basket_inflation) base_score = 70;
    else if (income_growth === avg_basket_inflation) base_score = 45;
    else base_score = 20;

    // trend: is basket inflation rising or falling vs last cycle?
    let trend_score = 15; // neutral default
    if (activeCycles.length >= 3) {
        const [prevCycleScores] = await pool.execute(
            `SELECT * FROM inflation_scores
             WHERE userId = ? AND monthId = ? AND templateId IN (
                 SELECT id FROM expense_templates WHERE userId = ? AND is_basket = true
             )`,
            [userId, activeCycles[1].id, userId]
        );

        if (prevCycleScores.length) {
            const prevValid = prevCycleScores.filter(s => s.inflation_percentage !== null);
            if (prevValid.length) {
                const prev_avg = prevValid.reduce(
                    (sum, s) => sum + Number(s.inflation_percentage), 0
                ) / prevValid.length;

                if (avg_basket_inflation < prev_avg) trend_score = 30; // falling = good
                else if (avg_basket_inflation > prev_avg) trend_score = 0; // rising = bad
                else trend_score = 15; // unchanged = neutral
            }
        }
    }

    return Math.min(100, base_score + trend_score);
};

// -----------------------------------------------
// MAIN FUNCTION
// -----------------------------------------------
const calculateCreditScore = async (userId, monthId) => {
    console.log(`Calculating credit score for user ${userId}, month ${monthId}`);

    // get all active cycles ordered newest first
    const activeCycles = await countActiveCycles(userId);
    const activeCycleCount = activeCycles.length;

    // need at least 3 active cycles for a score
    if (activeCycleCount < 3) {
        console.log(`User ${userId} has only ${activeCycleCount} active cycles — skipping credit score`);
        return null;
    }

    // get current cycle data
    const [currentCycleRows] = await pool.execute(
        'SELECT * FROM months WHERE id = ?',
        [monthId]
    );
    const currentCycle = currentCycleRows[0];
    if (!currentCycle) return null;

    // get previous cycle's income for growth calculation
    const prevCycle = activeCycles.length > 1 ? activeCycles[1] : null;
    const prev_income = prevCycle ? Number(prevCycle.total_income) : null;

    const cycleData = {
        monthId,
        total_income: Number(currentCycle.total_income),
        total_expense: Number(currentCycle.total_expense),
        amount_saved: Number(currentCycle.money_saved),
        prev_income
    };

    // determine phase
    const phase = getPhase(activeCycleCount);
    const weights = getPhaseWeights(phase);

    // -----------------------------------------------
    // SCORE EACH COMPONENT WITH TIER WEIGHTING
    // -----------------------------------------------

    // we score the CURRENT cycle's components
    // then apply tier weighting across all active cycles
    // for the component scores

    // build per-cycle scores for tier weighting
    let weighted_income = 0;
    let weighted_savings = 0;
    let weighted_debt = 0;
    let weighted_inflation = 0;
    let total_weight_income = 0;
    let total_weight_savings = 0;
    let total_weight_debt = 0;
    let total_weight_inflation = 0;

    for (let i = 0; i < activeCycles.length; i++) {
        const cycle = activeCycles[i];
        const position = i + 1; // 1 = most recent
        const tierWeight = getTierWeight(position);

        // get prev cycle for this position
        const prevForThis = activeCycles[i + 1] || null;

        const cycleCData = {
            monthId: cycle.id,
            total_income: Number(cycle.total_income),
            total_expense: Number(cycle.total_expense),
            amount_saved: Number(cycle.money_saved),
            prev_income: prevForThis ? Number(prevForThis.total_income) : null
        };

        // income health
        const incomeScore = scoreIncomeHealth(cycleCData);
        weighted_income += incomeScore * tierWeight;
        total_weight_income += tierWeight;

        // savings
        const savingsScore = await scoreSavings(userId, cycleCData, activeCycles);
        weighted_savings += savingsScore * tierWeight;
        total_weight_savings += tierWeight;

        // debt (only in phase 3+)
        if (phase >= 3) {
            const debtScore = await scoreDebt(userId, cycleCData);
            weighted_debt += debtScore * tierWeight;
            total_weight_debt += tierWeight;
        }

        // inflation (only in phase 2+, needs 2 prior cycles)
        if (phase >= 2 && i < activeCycles.length - 1) {
            const inflationScore = await scoreInflation(userId, cycle.id, activeCycles.slice(i));
            if (inflationScore !== null) {
                weighted_inflation += inflationScore * tierWeight;
                total_weight_inflation += tierWeight;
            }
        }
    }

    // calculate final component scores
    const final_income = total_weight_income > 0
        ? weighted_income / total_weight_income
        : 0;

    const final_savings = total_weight_savings > 0
        ? weighted_savings / total_weight_savings
        : 0;

    const final_debt = total_weight_debt > 0
        ? weighted_debt / total_weight_debt
        : null;

    const final_inflation = total_weight_inflation > 0
        ? weighted_inflation / total_weight_inflation
        : null;

    // -----------------------------------------------
    // COMBINE WITH PHASE WEIGHTS
    // -----------------------------------------------
    let raw_score = 0;
    raw_score += final_income * weights.income;
    raw_score += final_savings * weights.savings;
    if (final_debt !== null)      raw_score += final_debt * weights.debt;
    if (final_inflation !== null) raw_score += final_inflation * weights.inflation;

    // scale to 850
    const credit_score = Math.round(raw_score * 8.5);

    // get band and interest rate
    const { band, interest_rate } = getBandAndRate(credit_score);

    // store the score
    const score = await CreditScore.create({
        userId,
        monthId,
        phase,
        income_health_score: Number(final_income.toFixed(2)),
        savings_score: Number(final_savings.toFixed(2)),
        debt_score: final_debt !== null ? Number(final_debt.toFixed(2)) : null,
        inflation_score: final_inflation !== null ? Number(final_inflation.toFixed(2)) : null,
        raw_score: Number(raw_score.toFixed(2)),
        credit_score,
        band,
        interest_rate,
        active_cycles_at_calculation: activeCycleCount,
        is_sufficient_history: activeCycleCount >= 3
    });

    console.log(`✅ Credit score calculated for user ${userId}: ${credit_score} (${band}) — ${interest_rate}% interest`);
    return score;
};

module.exports = { calculateCreditScore };