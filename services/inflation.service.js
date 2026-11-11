// services/inflation.service.js
const ExpenseTemplate = require('../models/expense-template.model');
const PriceHistory = require('../models/price-history.model');
const InflationScore = require('../models/inflation-score.model');

// called at cycle lock for a specific user and month
// calculates and stores inflation scores for all templates
const calculateInflationAtLock = async (userId, monthId) => {
    console.log(`Calculating inflation for user ${userId}, month ${monthId}`);

    // get all templates for this user (excluding baskets — they get calculated separately)
    const [templates] = require('../config/db').then ? [] : await require('../config/db').execute(
        `SELECT * FROM expense_templates WHERE userId = ? AND is_basket = false`,
        [userId]
    );

    // actually let's use the model properly
    const pool = require('../config/db');
    const [allTemplates] = await pool.execute(
        `SELECT * FROM expense_templates WHERE userId = ? AND is_basket = false`,
        [userId]
    );

    const scores = [];

    for (const template of allTemplates) {
        try {
            // get the last price adjustment in this cycle
            const lastAdjustment = await PriceHistory.findLastInCycle(template.id, monthId);

            // closing price = last adjustment's new_amount, OR last_amount if no adjustment made
            const closing_price = lastAdjustment
                ? Number(lastAdjustment.new_amount)
                : Number(template.last_amount || template.default_amount);

            // get the previous cycle's inflation score to find previous_closing_price
            const previousScore = await InflationScore.findLatestByTemplateId(template.id, userId);
            const previous_closing_price = previousScore
                ? Number(previousScore.closing_price)
                : null;

            // calculate inflation_percentage
            let inflation_percentage = null;
            let change_type = null;

            if (previous_closing_price !== null) {
                inflation_percentage = Number(
                    ((closing_price - previous_closing_price) / previous_closing_price * 100).toFixed(2)
                );

                if (inflation_percentage > 0) change_type = 'increase';
                else if (inflation_percentage < 0) change_type = 'decrease';
                else change_type = 'unchanged';
            }
            // if no previous score → first cycle, inflation is null (no prior data)

            // store the inflation score
            const score = await InflationScore.create({
                userId,
                templateId: template.id,
                monthId,
                closing_price,
                previous_closing_price,
                inflation_percentage,
                change_type
            });

            scores.push(score);

        } catch (templateError) {
            console.error(`Failed inflation calc for template ${template.id}:`, templateError);
        }
    }

    // now calculate basket-level weighted averages
    const [baskets] = await pool.execute(
        `SELECT * FROM expense_templates WHERE userId = ? AND is_basket = true`,
        [userId]
    );

    for (const basket of baskets) {
        try {
            // get all child items for this basket
            const items = await ExpenseTemplate.findBasketItems(basket.id);
            if (!items.length) continue;

            // get the inflation score we just calculated for each child
            let totalWeight = 0;
            let weightedInflation = 0;
            let basketClosingPrice = 0;
            let basketPreviousPrice = 0;
            let hasValidInflation = false;

            for (const item of items) {
                const itemScore = scores.find(s => s.templateId === item.id)
                    || await InflationScore.findByTemplateAndMonth(item.id, monthId);

                if (!itemScore) continue;

                const itemPrice = Number(itemScore.closing_price);
                basketClosingPrice += itemPrice;

                if (itemScore.previous_closing_price) {
                    basketPreviousPrice += Number(itemScore.previous_closing_price);
                }

                totalWeight += itemPrice;
            }

            // calculate weighted average inflation
            if (totalWeight > 0) {
                for (const item of items) {
                    const itemScore = scores.find(s => s.templateId === item.id)
                        || await InflationScore.findByTemplateAndMonth(item.id, monthId);

                    if (!itemScore || itemScore.inflation_percentage === null) continue;

                    const weight = Number(itemScore.closing_price) / totalWeight;
                    weightedInflation += itemScore.inflation_percentage * weight;
                    hasValidInflation = true;
                }
            }

            const basket_inflation = hasValidInflation
                ? Number(weightedInflation.toFixed(2))
                : null;

            let basket_change_type = null;
            if (basket_inflation !== null) {
                if (basket_inflation > 0) basket_change_type = 'increase';
                else if (basket_inflation < 0) basket_change_type = 'decrease';
                else basket_change_type = 'unchanged';
            }

            // store basket-level inflation score
            await InflationScore.create({
                userId,
                templateId: basket.id,
                monthId,
                closing_price: basketClosingPrice,
                previous_closing_price: basketPreviousPrice || null,
                inflation_percentage: basket_inflation,
                change_type: basket_change_type
            });

        } catch (basketError) {
            console.error(`Failed basket inflation calc for basket ${basket.id}:`, basketError);
        }
    }

    console.log(`✅ Inflation calculated for user ${userId}: ${scores.length} templates processed`);
    return scores;
};

module.exports = { calculateInflationAtLock };