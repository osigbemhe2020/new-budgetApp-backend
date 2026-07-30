// controllers/expenses.controller.js
const Expense = require('../models/expense.model');
const ExpenseTemplate = require('../models/expense-template.model');
const Debt = require('../models/debts.model');
const Month = require('../models/month.model');
const Savings = require('../models/savings.model');
const SavingsSettings = require('../models/savings-settings.model');
const Income = require('../models/income.model');
const { getOrCreateActiveMonth } = require('../services/month.service');

// -----------------------------------------------
// POST /expenses
// -----------------------------------------------
const createExpense = async (req, res) => {
    try {
        const { expense_name, amount, category, template_id } = req.body;
        const userId = req.user.id;

        if (!expense_name || amount == null) {
            return res.status(400).json({ message: "expense_name and amount are required" });
        }

        if (amount <= 0) {
            return res.status(400).json({ message: "Amount must be greater than 0" });
        }

        // get active month
        const activeMonth = await getOrCreateActiveMonth(userId);

        // block if cycle is locked
        const existingSavings = await Savings.findByMonthId(activeMonth.id);
        if (existingSavings.length > 0) {
            return res.status(403).json({
                message: "Cannot add expense — current cycle is locked",
                cycle_end_date: activeMonth.cycle_end_date
            });
        }

        // get current balance
        const currentBalance = Number(activeMonth.balance) || 0;

       // check if expense exceeds balance → becomes a debt
        if (amount > currentBalance) {
            // calculate how much exceeds the balance
            const debt_amount = amount - currentBalance;

            // ✅ use the new Debt.create() signature — interest auto-calculated at 15%
            const debt = await Debt.create({
                userId,
                monthId: activeMonth.id,
                debt_amount   // ✅ only the excess amount, not the full expense
            });

            // if there was some balance left, record that portion as a normal expense
            if (currentBalance > 0) {
                await Expense.create({
                    userId,
                    monthId: activeMonth.id,
                    expense_name,
                    amount: currentBalance, // ✅ only the part covered by balance
                    category: category || null,
                    date: new Date()
                });
            }

            // recalculate month totals with debt
            const updatedMonth = await recalculateMonthTotals(activeMonth.id);

            return res.status(201).json({
                message: "Expense exceeds your balance — excess registered as debt",
                debt,
                month_summary: {
                    total_income: updatedMonth.total_income,
                    total_expense: updatedMonth.total_expense,
                    balance: updatedMonth.balance,
                    debt_cost: updatedMonth.debt_cost
                }
            });
        }

        // normal expense flow
        const expense = await Expense.create({
            userId,
            monthId: activeMonth.id,
            expense_name,
            amount,
            category: category || null,
            date: new Date()
        });

        // recalculate month totals after adding expense
        const updatedMonth = await recalculateMonthTotals(activeMonth.id);

        res.status(201).json({
            message: "Expense created successfully",
            expense,
            month_summary: {
                total_income: updatedMonth.total_income,
                total_expense: updatedMonth.total_expense,
                balance: updatedMonth.balance,
                debt_cost: updatedMonth.debt_cost
            }
        });

    } catch (error) {
        console.error('ERROR creating expense:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /expenses
// -----------------------------------------------
const getAllExpenses = async (req, res) => {
    try {
        const userId = req.user.id;

        const expenses = await Expense.findByUserId(userId);

        // get active month for summary
        const activeMonth = await getOrCreateActiveMonth(userId);

        res.status(200).json({
            message: "Expenses fetched successfully",
            count: expenses.length,
            current_cycle: {
                cycle_start_date: activeMonth.cycle_start_date,
                cycle_end_date: activeMonth.cycle_end_date,
                total_expense: activeMonth.total_expense,
                balance: activeMonth.balance
            },
            expenses
        });

    } catch (error) {
        console.error('ERROR fetching expenses:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// DELETE /expenses/:id
// -----------------------------------------------
const deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // find expense first to get monthId
        const expense = await Expense.findById(id);
        if (!expense) {
            return res.status(404).json({ message: "Expense not found" });
        }

        // get the month this expense belongs to
        const month = await Month.findById(expense.monthId);

        // block deletion if cycle is locked
        const existingSavings = await Savings.findByMonthId(month.id);
        if (existingSavings.length > 0) {
            return res.status(403).json({
                message: "Cannot delete expense — this cycle is locked",
                locked_since: existingSavings[0].created_at
            });
        }

        const deleted = await Expense.delete(id);
        if (!deleted) {
            return res.status(404).json({ message: "Expense not found" });
        }

        // recalculate month totals after deletion
        const updatedMonth = await recalculateMonthTotals(month.id);

        res.status(200).json({
            message: "Expense deleted successfully",
            month_summary: {
                total_income: updatedMonth.total_income,
                total_expense: updatedMonth.total_expense,
                balance: updatedMonth.balance,
                debt_cost: updatedMonth.debt_cost
            }
        });

    } catch (error) {
        console.error('ERROR deleting expense:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// POST /expenses/templates
// -----------------------------------------------
const createTemplate = async (req, res) => {
    try {
        const { template_name, default_amount, category, is_recurring, recurring_day } = req.body;
        const userId = req.user.id;

        if (!template_name || default_amount == null) {
            return res.status(400).json({ message: "template_name and default_amount are required" });
        }

        if (default_amount <= 0) {
            return res.status(400).json({ message: "Amount must be greater than 0" });
        }

        // validate recurring_day if template is recurring
        if (is_recurring && !recurring_day) {
            return res.status(400).json({
                message: "recurring_day is required for recurring templates"
            });
        }

        // recurring_day must be between 1 and 28
        // we cap at 28 to avoid issues with short months
        if (is_recurring && (recurring_day < 1 || recurring_day > 28)) {
            return res.status(400).json({
                message: "recurring_day must be between 1 and 28"
            });
        }

        const template = await ExpenseTemplate.create({
            userId,
            template_name,
            default_amount,
            category: category || null,
            is_recurring: is_recurring || false,
            recurring_day: is_recurring ? recurring_day : null
        });

        res.status(201).json({
            message: "Template created successfully",
            template,
            // tell user when first auto-expense will fire if recurring
            notice: is_recurring
                ? `This expense will automatically be added on day ${recurring_day} of each cycle`
                : "Template saved. Use it to quickly add expenses."
        });

    } catch (error) {
        console.error('ERROR creating template:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /expenses/templates
// -----------------------------------------------
const getAllTemplates = async (req, res) => {
    try {
        const userId = req.user.id;

        const templates = await ExpenseTemplate.findByUserId(userId);

        // separate recurring and non-recurring for clarity
        const recurring = templates.filter(t => t.is_recurring);
        const nonRecurring = templates.filter(t => !t.is_recurring);

        res.status(200).json({
            message: "Templates fetched successfully",
            count: templates.length,
            recurring_count: recurring.length,
            non_recurring_count: nonRecurring.length,
            templates: {
                recurring,
                non_recurring: nonRecurring
            }
        });

    } catch (error) {
        console.error('ERROR fetching templates:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// DELETE /expenses/templates/:id
// -----------------------------------------------
const deleteTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // find template first to verify ownership
        const template = await ExpenseTemplate.findById(id);
        if (!template) {
            return res.status(404).json({ message: "Template not found" });
        }

        // make sure template belongs to this user
        if (template.userId !== userId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const deleted = await ExpenseTemplate.delete(id);
        if (!deleted) {
            return res.status(404).json({ message: "Template not found" });
        }

        res.status(200).json({ message: "Template deleted successfully" });

    } catch (error) {
        console.error('ERROR deleting template:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// helper — recalculates month totals
// -----------------------------------------------
// const recalculateMonthTotals = async (monthId) => {
//     // get all expenses for this month
//     const expenses = await Expense.findByMonthId(monthId);
//     const total_expense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

//     // get all debts for this month
//     const debts = await Debt.findByMonthId(monthId);
//     const debt_cost = debts.reduce((sum, d) => sum + Number(d.debt_amount), 0);

//     // get current month for income
//     const currentMonth = await Month.findById(monthId);
//     const total_income = Number(currentMonth.total_income) || 0;

//     // balance = income - expenses - debts
//     const balance = total_income - total_expense - debt_cost;
//     const money_saved = balance > 0 ? balance : 0;

//     await Month.updateTotals(monthId, {
//         total_income,
//         total_expense,
//         money_saved,
//         debt_cost,
//         balance
//     });

//     return { total_income, total_expense, balance, debt_cost, money_saved };
// };

const recalculateMonthTotals = async (monthId) => {
    const expenses = await Expense.findByMonthId(monthId);
    const total_expense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const debts = await Debt.findByMonthId(monthId);
    const debt_cost = debts.reduce((sum, d) => sum + Number(d.debt_amount), 0);

    const currentMonth = await Month.findById(monthId);
    const total_income = Number(currentMonth.total_income) || 0;
    const balance_brought_forward = Number(currentMonth.balance_brought_forward) || 0;

    // ✅ use existing model instead of raw SQL
    const savingsSettings = await SavingsSettings.findByUserId(currentMonth.userId);
    const savings_percentage = savingsSettings
        ? Number(savingsSettings.savings_percentage)
        : 0;

    // money_saved = projected savings (income × savings%)
    const money_saved = Number((total_income * savings_percentage / 100).toFixed(2));

    // balance = income - expenses - debts - savings + brought forward
    const balance = total_income - total_expense - debt_cost - money_saved + balance_brought_forward;

    await Month.updateTotals(monthId, {
        total_income,
        total_expense,
        money_saved,
        debt_cost,
        balance,
        balance_brought_forward
    });

    return { total_income, total_expense, balance, debt_cost, money_saved, balance_brought_forward };
};
module.exports = {
    createExpense,
    getAllExpenses,
    deleteExpense,
    createTemplate,
    getAllTemplates,
    deleteTemplate
};
