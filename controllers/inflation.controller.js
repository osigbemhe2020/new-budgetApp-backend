// controllers/inflation.controller.js
const ExpenseTemplate = require('../models/expense-template.model');
const PriceHistory = require('../models/price-history.model');
const InflationScore = require('../models/inflation-score.model');
const { getOrCreateActiveMonth } = require('../services/month.service');

// -----------------------------------------------
// PUT /templates/:id/adjust-price
// -----------------------------------------------
const adjustPrice = async (req, res) => {
    try {
        const { id } = req.params;
        const { direction, amount, new_amount } = req.body;
        const userId = req.user.id;

        // find the template
        const template = await ExpenseTemplate.findById(id);
        if (!template) {
            return res.status(404).json({ message: "Template not found" });
        }

        if (template.userId !== userId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        // baskets have no price — only their items do
        if (template.is_basket) {
            return res.status(400).json({
                message: "Cannot adjust price of a basket directly. Adjust individual items instead."
            });
        }

        const old_amount = Number(template.last_amount || template.default_amount);

        // resolve the new price — Option A (direction + amount) or Option C (new_amount directly)
        let resolved_new_amount;

        if (new_amount != null) {
            // Option C — direct price set
            if (new_amount <= 0) {
                return res.status(400).json({ message: "new_amount must be greater than 0" });
            }
            resolved_new_amount = Number(new_amount);

        } else if (direction && amount != null) {
            // Option A — direction + fixed amount
            if (!['increment', 'decrement'].includes(direction)) {
                return res.status(400).json({ message: "direction must be 'increment' or 'decrement'" });
            }
            if (amount <= 0) {
                return res.status(400).json({ message: "amount must be greater than 0" });
            }

            resolved_new_amount = direction === 'increment'
                ? old_amount + Number(amount)
                : old_amount - Number(amount);

            if (resolved_new_amount <= 0) {
                return res.status(400).json({
                    message: "Price cannot go below zero"
                });
            }
        } else {
            return res.status(400).json({
                message: "Provide either { new_amount } or { direction, amount }"
            });
        }

        // calculate change percentage and type
        const change_percentage = Number(
            ((resolved_new_amount - old_amount) / old_amount * 100).toFixed(2)
        );
        const change_type = resolved_new_amount >= old_amount ? 'increment' : 'decrement';

        // get active month for monthId
        const activeMonth = await getOrCreateActiveMonth(userId);

        // log to price_history
        await PriceHistory.create({
            templateId: template.id,
            userId,
            monthId: activeMonth.id,
            old_amount,
            new_amount: resolved_new_amount,
            change_percentage,
            change_type
        });

        // update template.last_amount
        await ExpenseTemplate.updateLastAmount(template.id, resolved_new_amount);

        res.status(200).json({
            message: "Price adjusted successfully",
            adjustment: {
                template_name: template.template_name,
                old_amount,
                new_amount: resolved_new_amount,
                change_percentage,
                change_type,
                note: "Inflation score will be calculated at the end of this cycle"
            }
        });

    } catch (error) {
        console.error('ERROR adjusting price:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /templates/:id/inflation?window=3
// -----------------------------------------------
const getItemInflation = async (req, res) => {
    try {
        const { id } = req.params;
        const { window } = req.query;
        const userId = req.user.id;

        const template = await ExpenseTemplate.findById(id);
        if (!template) {
            return res.status(404).json({ message: "Template not found" });
        }

        if (template.userId !== userId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        // get inflation history — filtered by window if provided
        const windowCycles = window ? parseInt(window) : null;

        const history = windowCycles
            ? await InflationScore.findByTemplateIdWithWindow(template.id, userId, windowCycles)
            : await InflationScore.findByTemplateId(template.id);

        // calculate average inflation across the window
        const validScores = history.filter(h => h.inflation_percentage !== null);
        const averageInflation = validScores.length
            ? Number((validScores.reduce((sum, h) => sum + Number(h.inflation_percentage), 0) / validScores.length).toFixed(2))
            : null;

        res.status(200).json({
            message: "Inflation history fetched successfully",
            template: {
                id: template.id,
                name: template.template_name,
                category: template.category,
                current_price: template.last_amount
            },
            window: windowCycles ? `${windowCycles} cycles` : 'all time',
            average_inflation: averageInflation,
            history
        });

    } catch (error) {
        console.error('ERROR fetching item inflation:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /templates/basket/:id/inflation?window=3
// -----------------------------------------------
const getBasketInflation = async (req, res) => {
    try {
        const { id } = req.params;
        const { window } = req.query;
        const userId = req.user.id;

        const basket = await ExpenseTemplate.findById(id);
        if (!basket || !basket.is_basket) {
            return res.status(404).json({ message: "Basket not found" });
        }

        if (basket.userId !== userId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const windowCycles = window ? parseInt(window) : null;

        // get basket-level inflation scores (pre-computed at lock time)
        const basketHistory = windowCycles
            ? await InflationScore.findByTemplateIdWithWindow(basket.id, userId, windowCycles)
            : await InflationScore.findByTemplateId(basket.id);

        // get items and their individual inflation histories
        const items = await ExpenseTemplate.findBasketItems(basket.id);
        const itemBreakdown = [];

        for (const item of items) {
            const itemHistory = windowCycles
                ? await InflationScore.findByTemplateIdWithWindow(item.id, userId, windowCycles)
                : await InflationScore.findByTemplateId(item.id);

            const validScores = itemHistory.filter(h => h.inflation_percentage !== null);
            const avgInflation = validScores.length
                ? Number((validScores.reduce((sum, h) => sum + Number(h.inflation_percentage), 0) / validScores.length).toFixed(2))
                : null;

            itemBreakdown.push({
                id: item.id,
                name: item.template_name,
                current_price: item.last_amount,
                average_inflation: avgInflation,
                history: itemHistory
            });
        }

        // basket average inflation across window
        const validBasketScores = basketHistory.filter(h => h.inflation_percentage !== null);
        const basketAverage = validBasketScores.length
            ? Number((validBasketScores.reduce((sum, h) => sum + Number(h.inflation_percentage), 0) / validBasketScores.length).toFixed(2))
            : null;

        res.status(200).json({
            message: "Basket inflation fetched successfully",
            basket: {
                id: basket.id,
                name: basket.template_name,
                category: basket.category
            },
            window: windowCycles ? `${windowCycles} cycles` : 'all time',
            basket_average_inflation: basketAverage,
            basket_history: basketHistory,
            item_breakdown: itemBreakdown
        });

    } catch (error) {
        console.error('ERROR fetching basket inflation:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /inflation/summary
// -----------------------------------------------
const getInflationSummary = async (req, res) => {
    try {
        const userId = req.user.id;

        // get latest inflation score for every template
        const scores = await InflationScore.findLatestAllByUser(userId);

        // separate baskets and individual items
        const baskets = scores.filter(s => s.is_basket);
        const items = scores.filter(s => !s.is_basket && !s.parent_basket_id);
        const basketItems = scores.filter(s => s.parent_basket_id);

        // overall average inflation across all tracked items
        const validScores = scores.filter(s => s.inflation_percentage !== null && !s.is_basket);
        const overallAverage = validScores.length
            ? Number((validScores.reduce((sum, s) => sum + Number(s.inflation_percentage), 0) / validScores.length).toFixed(2))
            : null;

        res.status(200).json({
            message: "Inflation summary fetched successfully",
            overall_average_inflation: overallAverage,
            highest_inflation: validScores[0] || null,
            summary: {
                baskets,
                standalone_items: items
            }
        });

    } catch (error) {
        console.error('ERROR fetching inflation summary:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    adjustPrice,
    getItemInflation,
    getBasketInflation,
    getInflationSummary
};