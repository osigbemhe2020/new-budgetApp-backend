// routes/creditScore.route.js
const express = require('express');
const router = express.Router();
const { getCreditScoreBand } = require('../controllers/credit-score.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.use(authMiddleware);

// ⚠️ currently internal only — uncomment when ready to expose to users
// router.get('/band', getCreditScoreBand);

module.exports = router;