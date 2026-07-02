const express = require('express');
const router = express.Router();

const debtController = require('../controllers/debt.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Apply authentication middleware to all debt routes
router.use(authMiddleware);


router.post('/', debtController.createDebt);
// manually create a debt (edge case — 
// most debts auto-create from overspending)

router.get('/', debtController.getAllDebts);
// all debts for this user

router.get('/active', debtController.getActiveDebts);
// only pending/unpaid debts

router.get('/history', debtController.getDebtHistory);
// only paid debts

router.put('/:id/repayment', debtController.setRepaymentPlan);
// user sets how many months to repay
// this triggers the monthly schedule

router.put('/:id/pay', debtController.makePayment);
// manual payment — pay one month's principal early

router.get('/:id', debtController.getDebtById);
// single debt details + payment schedule

module.exports = router;