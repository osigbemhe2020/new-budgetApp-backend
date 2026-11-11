// controllers/tax.controller.js
const TaxProfile = require('../models/tax-profile.model');
const TaxFiling = require('../models/tax-filing.model');
const { computeTax } = require('../services/tax-calculation.service');
const { generateTaxNarrative } = require('../services/gemini.service');
const { generateTaxPDF } = require('../services/pdf.service');
const { sendTaxDocument } = require('../services/email.service');
const pool = require('../config/db');
const path = require('path');
const fs = require('fs');

// -----------------------------------------------
// POST /tax/profile — create or update tax profile
// -----------------------------------------------
const upsertTaxProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const profileData = req.body;

        let profile = await TaxProfile.findByUserId(userId);

        if (!profile) {
            await TaxProfile.create(userId);
        }

        await TaxProfile.update(userId, profileData);
        profile = await TaxProfile.findByUserId(userId);

        res.status(200).json({
            message: "Tax profile updated successfully",
            profile,
            is_complete: profile.is_complete,
            notice: !profile.is_complete
                ? "Add your TIN, address, state, and occupation to complete your tax profile"
                : null
        });

    } catch (error) {
        console.error('ERROR updating tax profile:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /tax/profile
// -----------------------------------------------
const getTaxProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const profile = await TaxProfile.findByUserId(userId);

        if (!profile) {
            return res.status(404).json({
                message: "Tax profile not found. Create one using POST /tax/profile"
            });
        }

        res.status(200).json({
            message: "Tax profile fetched successfully",
            profile,
            is_complete: profile.is_complete
        });

    } catch (error) {
        console.error('ERROR fetching tax profile:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// POST /tax/generate — generate tax document
// -----------------------------------------------
const generateTaxDocument = async (req, res) => {
    try {
        const userId = req.user.id;
        const { period_type, period_start, period_end } = req.body;

        // validate period
        if (!period_type) {
            return res.status(400).json({ message: "period_type is required" });
        }

        // normalize period
        let normalizedPeriod = (period_type || '').toLowerCase().trim();
        if (normalizedPeriod === 'last month' || normalizedPeriod === 'current month' || normalizedPeriod === 'month' || normalizedPeriod === 'last_month') {
            normalizedPeriod = 'last_month';
        } else if (normalizedPeriod === 'last quarter' || normalizedPeriod === 'quarter') {
            normalizedPeriod = 'quarter';
        } else if (normalizedPeriod === 'last 6 months' || normalizedPeriod === 'half year' || normalizedPeriod === 'half_year') {
            normalizedPeriod = 'half_year';
        } else if (normalizedPeriod === 'full year' || normalizedPeriod === 'full_year') {
            normalizedPeriod = 'full_year';
        } else if (normalizedPeriod === 'calendar year' || normalizedPeriod === 'calendar_year') {
            normalizedPeriod = 'calendar_year';
        } else if (normalizedPeriod === 'custom range' || normalizedPeriod === 'custom' || normalizedPeriod === 'custom_range') {
            normalizedPeriod = 'custom';
        }

        // calculate period dates based on type
        const now = new Date();
        let start, end;

        const customStart = period_start || req.body.custom_from;
        const customEnd = period_end || req.body.custom_to;

        if (normalizedPeriod === 'custom') {
            if (!customStart || !customEnd) {
                return res.status(400).json({
                    message: "period_start and period_end (or custom_from and custom_to) are required for custom period"
                });
            }
            start = customStart;
            end = customEnd;

        } else if (normalizedPeriod === 'last_month') {
            // single latest cycle
            const [cycles] = await pool.execute(
                `SELECT cycle_start_date, cycle_end_date FROM months
                 WHERE userId = ? ORDER BY cycle_start_date DESC LIMIT 1`,
                [userId]
            );
            if (!cycles.length) return res.status(400).json({ message: "No cycles found" });
            start = cycles[0].cycle_start_date;
            end = cycles[0].cycle_end_date;

        } else if (normalizedPeriod === 'quarter') {
            // last 3 cycles
            const [cycles] = await pool.execute(
                `SELECT cycle_start_date, cycle_end_date FROM months
                 WHERE userId = ? ORDER BY cycle_start_date DESC LIMIT 3`,
                [userId]
            );
            if (!cycles.length) return res.status(400).json({ message: "No cycles found" });
            start = cycles[cycles.length - 1].cycle_start_date;
            end = cycles[0].cycle_end_date;

        } else if (normalizedPeriod === 'half_year') {
            const [cycles] = await pool.execute(
                `SELECT cycle_start_date, cycle_end_date FROM months
                 WHERE userId = ? ORDER BY cycle_start_date DESC LIMIT 6`,
                [userId]
            );
            if (!cycles.length) return res.status(400).json({ message: "No cycles found" });
            start = cycles[cycles.length - 1].cycle_start_date;
            end = cycles[0].cycle_end_date;

        } else if (normalizedPeriod === 'full_year') {
            const [cycles] = await pool.execute(
                `SELECT cycle_start_date, cycle_end_date FROM months
                 WHERE userId = ? ORDER BY cycle_start_date DESC LIMIT 12`,
                [userId]
            );
            if (!cycles.length) return res.status(400).json({ message: "No cycles found" });
            start = cycles[cycles.length - 1].cycle_start_date;
            end = cycles[0].cycle_end_date;

        } else if (normalizedPeriod === 'calendar_year') {
            start = `${now.getFullYear()}-01-01`;
            end = `${now.getFullYear()}-12-31`;
        } else {
            return res.status(400).json({ message: `Invalid period_type: ${period_type}` });
        }

        // format dates as strings safely
        const formatDate = (d) => {
            if (!d) return new Date().toISOString().slice(0, 10);
            if (d instanceof Date) return d.toISOString().slice(0, 10);
            if (typeof d === 'string') return d.slice(0, 10);
            try {
                return new Date(d).toISOString().slice(0, 10);
            } catch {
                return String(d).slice(0, 10);
            }
        };
        start = formatDate(start);
        end = formatDate(end);

        // get user info
        const [userRows] = await pool.execute(
            'SELECT userId, username, email FROM user_info WHERE userId = ?',
            [userId]
        );
        const user = userRows[0];

        // get tax profile
        const taxProfile = await TaxProfile.findByUserId(userId);
        if (!taxProfile) {
            return res.status(400).json({
                message: "Please create a tax profile first using POST /tax/profile"
            });
        }

        // get income for period
        // const [incomeRows] = await pool.execute(
        //     `SELECT i.source_name, i.amount FROM income_sources i
        //      JOIN months m ON i.monthId = m.id
        //      WHERE i.userId = ?
        //      AND m.cycle_start_date >= ? AND m.cycle_end_date <= ?`,
        //     [userId, start, end]
        // );

        // // get expenses for period
        // const [expenseRows] = await pool.execute(
        //     `SELECT e.expense_name, e.amount, e.category FROM expenses e
        //      JOIN months m ON e.monthId = m.id
        //      WHERE e.userId = ?
        //      AND m.cycle_start_date >= ? AND m.cycle_end_date <= ?`,
        //     [userId, start, end]
        // );

        const [incomeRows] = await pool.execute(
            `SELECT i.source_name, i.amount FROM income_sources i
            JOIN months m ON i.monthId = m.id
            WHERE i.userId = ?
            AND m.cycle_start_date <= ? AND m.cycle_end_date >= ?`,
            [userId, end, start]
        );

        // same fix for expenses
        const [expenseRows] = await pool.execute(
            `SELECT e.expense_name, e.amount, e.category FROM expenses e
            JOIN months m ON e.monthId = m.id
            WHERE e.userId = ?
            AND m.cycle_start_date <= ? AND m.cycle_end_date >= ?`,
            [userId, end, start]
        );

        const gross_income = incomeRows.reduce((sum, i) => sum + Number(i.amount), 0);
        const total_expenses = expenseRows.reduce((sum, e) => sum + Number(e.amount), 0);
        const net_income = gross_income - total_expenses;

        // compute tax
        const taxComputation = computeTax(gross_income, taxProfile);

        // create filing record
        const filing = await TaxFiling.create({
            userId,
            period_type: normalizedPeriod,
            period_start: start,
            period_end: end,
            gross_income,
            total_expenses,
            net_income,
            cra: taxComputation.cra,
            pension_deduction: taxComputation.pension_deduction,
            nhf_deduction: taxComputation.nhf_deduction,
            life_insurance_deduction: taxComputation.life_insurance_deduction,
            total_deductions: taxComputation.total_deductions,
            chargeable_income: taxComputation.chargeable_income,
            tax_payable: taxComputation.tax_payable
        });

        // get gemini narrative
        const geminiNarrative = await generateTaxNarrative({
            user,
            taxProfile,
            period: { start, end, type: normalizedPeriod },
            financialData: { gross_income, total_expenses, net_income },
            taxComputation
        });

        // generate PDF
        const pdfPath = await generateTaxPDF({
            user,
            taxProfile,
            period: { start, end, type: normalizedPeriod },
            financialData: { gross_income, total_expenses, net_income },
            taxComputation,
            incomeBreakdown: incomeRows,
            expenseBreakdown: expenseRows,
            geminiNarrative,
            filingId: filing.id
        });

        // set PDF expiry — 24 hours from now
        const pdf_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 19)
            .replace('T', ' ');

        await TaxFiling.updatePdfPath(filing.id, pdfPath, pdf_expires_at);



        // then fix the email call to use whichever exists
        const emailResult = await sendTaxDocument({
            to: 'dirisupaul16@gmail.com',
            //to: user.email,
            name: user.username,
            period: { start, end },
            pdfPath,
            filingId: filing.id
        });

        if (emailResult.success) {
            await TaxFiling.updateEmailSent(filing.id);
        }

        res.status(201).json({
            message: "Tax document generated successfully",
            filing_id: filing.id,
            period: { start, end, type: normalizedPeriod },
            summary: {
                gross_income,
                total_expenses,
                net_income,
                tax_payable: taxComputation.tax_payable,
                effective_rate: taxComputation.effective_rate
            },
            email_sent: emailResult.success,
            download_expires_at: pdf_expires_at,
            notice: emailResult.success
                ? `Tax document sent to ${user.email}`
                : "Document generated but email failed — use the download endpoint"
        });

    } catch (error) {
        console.error('ERROR generating tax document:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /tax/filings
// -----------------------------------------------
const getAllFilings = async (req, res) => {
    try {
        const userId = req.user.id;
        const filings = await TaxFiling.findByUserId(userId);

        res.status(200).json({
            message: "Tax filings fetched successfully",
            count: filings.length,
            filings
        });

    } catch (error) {
        console.error('ERROR fetching filings:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// -----------------------------------------------
// GET /tax/filings/:id/download
// -----------------------------------------------
const downloadFiling = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const filing = await TaxFiling.findById(id);
        if (!filing) {
            return res.status(404).json({ message: "Filing not found" });
        }

        if (filing.userId !== userId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        if (!filing.pdf_path || !fs.existsSync(filing.pdf_path)) {
            return res.status(404).json({ message: "PDF not found or has expired" });
        }

        // check expiry
        if (filing.pdf_expires_at && new Date() > new Date(filing.pdf_expires_at)) {
            return res.status(410).json({
                message: "This PDF has expired. Generate a new tax document."
            });
        }

        res.download(filing.pdf_path, `tax-summary-${filing.period_start}-${filing.period_end}.pdf`);

    } catch (error) {
        console.error('ERROR downloading filing:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    upsertTaxProfile,
    getTaxProfile,
    generateTaxDocument,
    getAllFilings,
    downloadFiling
};