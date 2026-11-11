// routes/inflation.route.js
const express = require('express');
const router = express.Router();
const inflationController = require('../controllers/inflation.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.use(authMiddleware);

// price adjustment
router.put('/templates/:id/adjust-price', inflationController.adjustPrice);

// inflation queries
router.get('/templates/:id/inflation', inflationController.getItemInflation);
router.get('/templates/basket/:id/inflation', inflationController.getBasketInflation);
router.get('/summary', inflationController.getInflationSummary);

module.exports = router;