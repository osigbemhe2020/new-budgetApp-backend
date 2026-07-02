const express = require('express');
const router = express.Router();
const incomeController = require('../controllers/income.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Apply authentication middleware to all income routes
router.use(authMiddleware);

// GET /income - Get logged-in user's incomes
router.get('/', incomeController.getAllIncomes);

// POST /income/add - Create income for logged-in user
router.post('/add', (req, res, next) => {
    // add this temporary middleware
    next();
}, incomeController.createIncome);

router.put('/:id', incomeController.updateIncome);

// DELETE /income/:id - Delete income for logged-in user
router.delete('/:id', incomeController.deleteIncome);

module.exports = router;