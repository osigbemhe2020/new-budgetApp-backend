// routes/tax.route.js
const express = require('express');
const router = express.Router();
const taxController = require('../controllers/tax.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.use(authMiddleware);

router.post('/profile', taxController.upsertTaxProfile);
router.get('/profile', taxController.getTaxProfile);
router.post('/generate', taxController.generateTaxDocument);
router.get('/filings', taxController.getAllFilings);
router.get('/filings/:id/download', taxController.downloadFiling);

module.exports = router;