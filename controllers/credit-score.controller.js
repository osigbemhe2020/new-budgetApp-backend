// add to controllers/credit-score.controller.js
const CreditScore = require('../models/credit-score.model');
const { countActiveCycles } = require('../helpers/cycleUtils');

const getCreditScoreBand = async (req, res) => {
    try {
        const userId = req.user.id;

        const activeCycles = await countActiveCycles(userId);
        const activeCycleCount = activeCycles.length;

        if (activeCycleCount < 3) {
            return res.status(200).json({
                message: "Credit score not yet available",
                active_cycles: activeCycleCount,
                cycles_remaining: Math.max(0, 3 - activeCycleCount),
                notice: "You need at least 3 active cycles to receive a credit score"
            });
        }

        const latest = await CreditScore.findLatestByUserId(userId);
        if (!latest) {
            return res.status(200).json({
                message: "Credit score not yet calculated",
                notice: "Your score will be calculated at the end of your current cycle"
            });
        }

        res.status(200).json({
            message: "Credit score fetched successfully",
            // band visible, raw score hidden
            band: latest.band,
            interest_rate: latest.interest_rate,
            active_cycles: activeCycleCount,
            calculated_at: latest.created_at
        });

    } catch (error) {
        console.error('ERROR fetching credit score band:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = { getCreditScoreBand };