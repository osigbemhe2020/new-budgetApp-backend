const express = require('express');
const router = express.Router();
const expensesController = require('../controllers/expenses.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Apply authentication middleware to all expenses routes
router.use(authMiddleware);

// GET /expenses - Get logged-in user's expenses
router.get('/', expensesController.getAllExpenses);

// POST /expenses - Create expense for logged-in user
router.post('/', expensesController.createExpense);

// DELETE /expenses/:id - Delete expense for logged-in user
router.delete('/:id', expensesController.deleteExpense);

// POST /templates
router.post('/templates', expensesController.createTemplate);

// GET /templates
router.get('/templates', expensesController.getAllTemplates);

// DELETE /templates/:id
router.delete('/templates/:id', expensesController.deleteTemplate);

module.exports = router;