// controllers/income.controller.js
const Income = require('../models/income.model');
const Month = require('../models/month.model');
const Savings = require('../models/savings.model');
const Debt = require('../models/debts.model');
const Expense = require('../models/expense.model');
const GeneralSettings = require('../models/general-settings.model');
const { getOrCreateActiveMonth } = require('../services/month.service');
const { calculateCycle, isCycleLocked } = require('../helpers/cycleCalculator');

// -----------------------------------------------
// POST /income/add
// -----------------------------------------------
const createIncome = async (req, res) => {
    try {
        const { name, amount } = req.body;
        const UserID = req.user.id;

        if (!name || amount == null) {
            return res.status(400).json({ message: "Name and amount are required" });
        }

        if (amount <= 0) {
            return res.status(400).json({ message: "Amount must be greater than 0" });
        }

        // get user general settings
        const settings = await GeneralSettings.findByUserId(UserID);

        // check if this is the user's first income (cycle_start_day not set yet)
        const isFirstIncome = settings.cycle_start_day === null;

        if (isFirstIncome) {
            // set cycle_start_day to today's date
            const today = new Date();
            const cycle_start_day = today.getDate();

            console.log(`First income — setting cycle_start_day to ${cycle_start_day}`);

            // update general settings with new cycle_start_day
            await GeneralSettings.updateCycleStartDay(UserID, cycle_start_day);

            // recalculate cycle with new cycle_start_day
            const newCycle = calculateCycle(cycle_start_day, today);

            // update the existing month row with correct cycle dates
            const existingMonth = await Month.findByCycle(
                UserID,
                `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
            );

            if (existingMonth) {
                await Month.updateCycleEndDate(existingMonth.id, newCycle.cycle_end_date);
                // also update cycle_start_date
                await Month.updateCycleStartDate(existingMonth.id, newCycle.cycle_start_date);
            }
        }

        // get or create active month
        const activeMonth = await getOrCreateActiveMonth(UserID);

        // notify user if income is going to next cycle
        if (activeMonth.isNextCycle) {
            console.log(`Income going to next cycle — month id: ${activeMonth.id}`);
        }

        // format date for MySQL
        const date = new Date().toISOString().slice(0, 19).replace('T', ' ');

        // create income
        const income = await Income.create({
            UserID,
            monthId: activeMonth.id,
            name,
            amount,
            date
        });

        // recalculate month totals
        const updatedMonth = await recalculateMonthTotals(activeMonth.id, UserID);

        res.status(201).json({
            message: "Income added successfully",
            income,
            cycle_info: {
                cycle_start_date: activeMonth.cycle_start_date,
                cycle_end_date: activeMonth.cycle_end_date,
                is_next_cycle: activeMonth.isNextCycle,
                // warn user if income went to next cycle
                notice: activeMonth.isNextCycle
                    ? `Your current cycle is locked. This income has been added to your next cycle starting ${activeMonth.cycle_start_date}`
                    : null
            },
            month_summary: {
                total_income: updatedMonth.total_income,
                total_expense: updatedMonth.total_expense,
                balance: updatedMonth.balance
            }
        });

    } catch (error) {
        console.error('ERROR creating income:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /income
// -----------------------------------------------
const getAllIncomes = async (req, res) => {
    try {
        const UserID = req.user.id;

        const incomes = await Income.findByUserID(UserID);

        res.status(200).json({
            message: "Incomes fetched successfully",
            count: incomes.length,
            incomes
        });

    } catch (error) {
        console.error('ERROR fetching incomes:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// DELETE /income/:id
// -----------------------------------------------
const deleteIncome = async (req, res) => {
    try {
        const { id } = req.params;
        const UserID = req.user.id;

        // find the income first to get its monthId
        const income = await Income.findById(id);
        if (!income) {
            return res.status(404).json({ message: "Income not found" });
        }

        // get the month this income belongs to
        const month = await Month.findById(income.monthId);

        // block deletion if cycle is locked (savings row exists for this month)
        const existingSavings = await Savings.findByMonthId(month.id);
        if (existingSavings.length > 0) {
            return res.status(403).json({
                message: "Cannot delete income — this cycle is locked",
                locked_since: existingSavings[0].created_at
            });
        }

        // delete the income
        const deleted = await Income.delete(id);
        if (!deleted) {
            return res.status(404).json({ message: "Income not found" });
        }

        // recalculate month totals after deletion
        const updatedMonth = await recalculateMonthTotals(month.id, UserID);

        res.status(200).json({
            message: "Income deleted successfully",
            month_summary: {
                total_income: updatedMonth.total_income,
                total_expense: updatedMonth.total_expense,
                balance: updatedMonth.balance
            }
        });

    } catch (error) {
        console.error('ERROR deleting income:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// PUT /income/:id
// -----------------------------------------------
const updateIncome = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, amount } = req.body;
        const UserID = req.user.id;

        if (!name || amount == null) {
            return res.status(400).json({ message: "Name and amount are required" });
        }

        if (amount <= 0) {
            return res.status(400).json({ message: "Amount must be greater than 0" });
        }

        // find the income first
        const income = await Income.findById(id);
        if (!income) {
            return res.status(404).json({ message: "Income not found" });
        }

        // get the month this income belongs to
        const month = await Month.findById(income.monthId);

        // block edit if cycle is locked
        const existingSavings = await Savings.findByMonthId(month.id);
        if (existingSavings.length > 0) {
            return res.status(403).json({
                message: "Cannot edit income — this cycle is locked",
                locked_since: existingSavings[0].created_at
            });
        }

        // update the income
        const updated = await Income.update(id, { name, amount });
        if (!updated) {
            return res.status(404).json({ message: "Income not found" });
        }

        // recalculate month totals
        const updatedMonth = await recalculateMonthTotals(month.id, UserID);

        res.status(200).json({
            message: "Income updated successfully",
            month_summary: {
                total_income: updatedMonth.total_income,
                total_expense: updatedMonth.total_expense,
                balance: updatedMonth.balance
            }
        });

    } catch (error) {
        console.error('ERROR updating income:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// helper — recalculates and updates month totals
//
// IMPORTANT: this must stay in sync with the identically-named helper in
// expenses.controller.js. Both controllers can trigger a totals
// recalculation for the same month row, so both need to agree on the
// formula — otherwise whichever one runs last silently overwrites the
// other's numbers with a different idea of what they should be. Before,
// this version derived debt_cost from balance < 0 instead of querying the
// real Debt rows, which would have desynced debt_cost (and balance) from
// the expenses controller's version the moment a real debt existed.
// -----------------------------------------------
const recalculateMonthTotals = async (monthId, userId) => {

    // get all incomes for this month
    const incomes = await Income.findByMonthId(monthId);
    const total_income = incomes.reduce((sum, inc) => sum + Number(inc.amount), 0);

    // get all expenses for this month — same source of truth expenses.controller.js uses
    const expenses = await Expense.findByMonthId(monthId);
    const total_expense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // get all real debts for this month, not a derived guess from balance
    const debts = await Debt.findByMonthId(monthId);
    const debt_cost = debts.reduce((sum, d) => sum + Number(d.debt_amount), 0);

    // pull forward whatever carried over from the previous cycle
    const currentMonth = await Month.findById(monthId);
    const balance_brought_forward = Number(currentMonth.balance_brought_forward) || 0;

    // balance = income - expenses - debts + carried-forward surplus
    const balance = total_income - total_expense - debt_cost + balance_brought_forward;
    const money_saved = balance > 0 ? balance : 0;

    await Month.updateTotals(monthId, {
        total_income,
        total_expense,
        money_saved,
        debt_cost,
        balance,
        balance_brought_forward
    });

    return { total_income, total_expense, balance, money_saved, debt_cost, balance_brought_forward };
};

module.exports = { createIncome, getAllIncomes, deleteIncome, updateIncome };