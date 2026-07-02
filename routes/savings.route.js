const express = require('express');
const router = express.Router();
const savingsController = require('../controllers/savings.controller');
const authMiddleware  = require('../middlewares/auth.middleware');

// Apply authentication middleware to all savings routes
router.use(authMiddleware);

// savings settings (user sets their % and lock preferences)
router.post('/settings', savingsController.createSavingsSettings);
router.put('/settings', savingsController.updateSavingsSettings);
router.get('/settings', savingsController.getSavingsSettings);  // ← add this

// savings records (created at lock date)
router.get('/', savingsController.getAllSavings);           // all locked savings history
router.get('/locked', savingsController.getLockedSavings);  // only locked ones

// lock/unlock
//router.post('/lock', savingsController.lockSavings);        // manual lock
router.post('/unlock', savingsController.unLockSavings);    // only if unlock_date passed

module.exports = router;