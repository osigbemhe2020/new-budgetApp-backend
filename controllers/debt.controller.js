const Debt = require('../models/debts.model');
const Month = require('../models/month.model');
const Expense = require('../models/expense.model');
const { getOrCreateActiveMonth } = require('../services/month.service');

// -----------------------------------------------
// GET /debts
// -----------------------------------------------
const getAllDebts = async (req, res) => {
    try {
        const userId = req.user.id;
        const debts = await Debt.findByUserId(userId);

        res.status(200).json({
            message: "Debts fetched successfully",
            count: debts.length,
            debts
        });
    } catch (error) {
        console.error('ERROR fetching debts:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /debts/active
// -----------------------------------------------
const getActiveDebts = async (req, res) => {
    try {
        const userId = req.user.id;
        const debts = await Debt.findActiveByUserId(userId);

        const total_owed = debts.reduce((sum, d) => sum + Number(d.total_payable), 0);

        res.status(200).json({
            message: "Active debts fetched successfully",
            count: debts.length,
            total_owed: Number(total_owed.toFixed(2)),
            debts
        });
    } catch (error) {
        console.error('ERROR fetching active debts:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /debts/history
// -----------------------------------------------
const getDebtHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const debts = await Debt.findPaidByUserId(userId);

        res.status(200).json({
            message: "Debt history fetched successfully",
            count: debts.length,
            debts
        });
    } catch (error) {
        console.error('ERROR fetching debt history:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /debts/:id
// -----------------------------------------------
const getDebtById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const debt = await Debt.findById(id);
        if (!debt) {
            return res.status(404).json({ message: "Debt not found" });
        }

        if (debt.userId !== userId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        res.status(200).json({
            message: "Debt fetched successfully",
            debt
        });
    } catch (error) {
        console.error('ERROR fetching debt:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// POST /debts — manual creation (edge case)
// -----------------------------------------------
const createDebt = async (req, res) => {
    try {
        const { debt_amount } = req.body;
        const userId = req.user.id;

        if (!debt_amount || debt_amount <= 0) {
            return res.status(400).json({ message: "debt_amount must be greater than 0" });
        }

        const activeMonth = await getOrCreateActiveMonth(userId);

        const debt = await Debt.create({
            userId,
            monthId: activeMonth.id,
            debt_amount
        });

        res.status(201).json({
            message: "Debt created successfully",
            debt,
            notice: "Set a repayment plan using PUT /debts/:id/repayment"
        });
    } catch (error) {
        console.error('ERROR creating debt:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// PUT /debts/:id/repayment — set repayment plan
// -----------------------------------------------
const setRepaymentPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { repayment_months } = req.body;
        const userId = req.user.id;

        if (!repayment_months || repayment_months < 1) {
            return res.status(400).json({ message: "repayment_months must be at least 1" });
        }

        const debt = await Debt.findById(id);
        if (!debt) {
            return res.status(404).json({ message: "Debt not found" });
        }

        if (debt.userId !== userId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        if (debt.status === 'paid') {
            return res.status(400).json({ message: "This debt is already paid off" });
        }

        // split principal across repayment_months
        const monthly_principal = (Number(debt.debt_amount) / repayment_months).toFixed(2);

        // interest is charged in full every month until principal is paid
        const monthly_interest = Number(debt.interest_amount).toFixed(2);

        // calculate next payment date — one cycle from now
        // using simple 30 day approximation since this is independent of user's cycle
        const nextPaymentDate = new Date();
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
        const next_payment_date = nextPaymentDate.toISOString().slice(0, 10);

        await Debt.setRepaymentPlan(id, {
            repayment_months,
            monthly_principal,
            monthly_interest,
            next_payment_date
        });

        res.status(200).json({
            message: "Repayment plan set successfully",
            plan: {
                repayment_months,
                monthly_principal: Number(monthly_principal),
                monthly_interest: Number(monthly_interest),
                next_payment_date,
                total_monthly_payment: Number((Number(monthly_principal) + Number(monthly_interest)).toFixed(2))
            }
        });
    } catch (error) {
        console.error('ERROR setting repayment plan:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// PUT /debts/:id/pay — make a payment (manual or cron triggered)
// -----------------------------------------------
const makePayment = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const debt = await Debt.findById(id);
        if (!debt) {
            return res.status(404).json({ message: "Debt not found" });
        }

        if (debt.userId !== userId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        if (debt.status === 'paid') {
            return res.status(400).json({ message: "This debt is already paid off" });
        }

        if (!debt.repayment_months) {
            return res.status(400).json({
                message: "No repayment plan set. Use PUT /debts/:id/repayment first."
            });
        }

        // add monthly_interest as an expense for this cycle
        const activeMonth = await getOrCreateActiveMonth(userId);
        await Expense.create({
            userId,
            monthId: activeMonth.id,
            expense_name: `Debt interest payment (Debt #${debt.id})`,
            amount: debt.monthly_interest,
            category: 'debt_interest'
        });

        // reduce remaining principal
        const remaining_debt = (Number(debt.debt_amount) - Number(debt.monthly_principal)).toFixed(2);
        const new_months_paid = debt.months_paid + 1;

        // check if fully paid
        const isFullyPaid = new_months_paid >= debt.repayment_months || Number(remaining_debt) <= 0;

        // calculate next payment date
        const nextDate = new Date(debt.next_payment_date);
        nextDate.setMonth(nextDate.getMonth() + 1);
        const next_payment_date = nextDate.toISOString().slice(0, 10);

        await Debt.recordPayment(id, {
            months_paid: new_months_paid,
            next_payment_date: isFullyPaid ? null : next_payment_date,
            debt_amount: isFullyPaid ? 0 : remaining_debt,
            status: isFullyPaid ? 'paid' : 'pending'
        });

        res.status(200).json({
            message: isFullyPaid ? "Final payment made — debt fully paid off! 🎉" : "Payment recorded successfully",
            remaining_debt: isFullyPaid ? 0 : Number(remaining_debt),
            months_paid: new_months_paid,
            repayment_months: debt.repayment_months,
            status: isFullyPaid ? 'paid' : 'pending',
            next_payment_date: isFullyPaid ? null : next_payment_date
        });
    } catch (error) {
        console.error('ERROR making payment:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    getAllDebts,
    getActiveDebts,
    getDebtHistory,
    getDebtById,
    createDebt,
    setRepaymentPlan,
    makePayment
};