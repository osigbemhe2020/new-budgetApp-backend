// services/pdf.service.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generateTaxPDF = async ({
    user, taxProfile, period, financialData,
    taxComputation, incomeBreakdown, expenseBreakdown,
    geminiNarrative, filingId
}) => {
    return new Promise((resolve, reject) => {
        // create output directory if it doesn't exist
        const outputDir = path.join(__dirname, '../tax-documents');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const filename = `tax-return-${user.userId}-${filingId}-${Date.now()}.pdf`;
        const filepath = path.join(outputDir, filename);
        const writeStream = fs.createWriteStream(filepath);

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        doc.pipe(writeStream);

        // -----------------------------------------------
        // COLORS + HELPERS
        // -----------------------------------------------
        const BLUE = '#2563EB';
        const DARK = '#1E293B';
        const GRAY = '#64748B';
        const LIGHT = '#F8FAFC';

        const formatMoney = (amount) =>
            `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

        const addSectionHeader = (text) => {
            doc.moveDown(0.5)
               .fillColor(BLUE)
               .fontSize(13)
               .font('Helvetica-Bold')
               .text(text)
               .moveDown(0.3)
               .moveTo(50, doc.y)
               .lineTo(545, doc.y)
               .strokeColor(BLUE)
               .stroke()
               .moveDown(0.5)
               .fillColor(DARK)
               .font('Helvetica')
               .fontSize(10);
        };

        const addRow = (label, value, bold = false) => {
            const y = doc.y;
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
               .fontSize(10)
               .fillColor(DARK)
               .text(label, 50, y, { width: 250 });
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
               .fontSize(10)
               .fillColor(bold ? BLUE : DARK)
               .text(String(value || ''), 300, y, { width: 245, align: 'right' });
            doc.y = Math.max(doc.y, y + 14);
            doc.moveDown(0.15);
        };

        // -----------------------------------------------
        // PAGE 1 — COVER
        // -----------------------------------------------
        doc.fillColor(BLUE)
           .rect(0, 0, 595, 120)
           .fill();

        doc.fillColor('white')
           .fontSize(22)
           .font('Helvetica-Bold')
           .text('BudgetWise', 50, 35)
           .fontSize(11)
           .font('Helvetica')
           .text('Personal Income Tax Summary', 50, 65)
           .fontSize(9)
           .text('As referenced under Nigeria Tax Act 2025', 50, 85);

        doc.fillColor(DARK)
           .fontSize(10)
           .font('Helvetica')
           .text(`Generated on: ${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`, 50, 140)
           .moveDown(0.5);

        addSectionHeader('TAXPAYER INFORMATION');
        addRow('Full Name:', user.username);
        addRow('Email:', user.email);
        addRow('Phone:', taxProfile.phone || 'Not provided');
        addRow('TIN:', taxProfile.tin || 'Not provided — obtain from FIRS');
        addRow('Account Type:', taxProfile.account_type === 'personal' ? 'Individual' : 'Sole Trader');
        addRow('Occupation:', taxProfile.occupation || 'Not specified');
        addRow('State of Residence:', taxProfile.state_of_residence || 'Not specified');
        addRow('LGA:', taxProfile.lga || 'Not specified');
        addRow('Address:', taxProfile.address || 'Not specified');

        addSectionHeader('FILING PERIOD');
        addRow('Period Type:', period.type.replace('_', ' ').toUpperCase());
        addRow('From:', new Date(period.start).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }));
        addRow('To:', new Date(period.end).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }));

        // -----------------------------------------------
        // PAGE 2 — INCOME & EXPENSE SUMMARY
        // -----------------------------------------------
        doc.addPage();

        addSectionHeader('INCOME SUMMARY');
        incomeBreakdown.forEach(income => {
            addRow(income.source_name, formatMoney(income.amount));
        });
        doc.moveDown(0.3);
        addRow('TOTAL GROSS INCOME', formatMoney(financialData.gross_income), true);

        addSectionHeader('EXPENSE SUMMARY');
        expenseBreakdown.forEach(expense => {
            addRow(
                `${expense.category || 'Uncategorized'} — ${expense.expense_name}`,
                formatMoney(expense.amount)
            );
        });
        doc.moveDown(0.3);
        addRow('TOTAL EXPENSES', formatMoney(financialData.total_expenses), true);
        addRow('NET INCOME (Gross - Expenses)', formatMoney(financialData.net_income), true);

        // -----------------------------------------------
        // PAGE 3 — TAX COMPUTATION + GEMINI NARRATIVE
        // -----------------------------------------------
        doc.addPage();

        addSectionHeader('TAX COMPUTATION');
        addRow('Gross Income:', formatMoney(taxComputation.gross_income));
        doc.moveDown(0.3)
           .fillColor(GRAY)
           .fontSize(9)
           .text('Less: Allowable Deductions', 50)
           .moveDown(0.2)
           .fillColor(DARK)
           .fontSize(10);

        addRow('Consolidated Relief Allowance (CRA):', `(${formatMoney(taxComputation.cra)})`);

        if (taxComputation.pension_deduction > 0)
            addRow('Pension Contribution:', `(${formatMoney(taxComputation.pension_deduction)})`);

        if (taxComputation.nhf_deduction > 0)
            addRow('NHF Contribution:', `(${formatMoney(taxComputation.nhf_deduction)})`);

        if (taxComputation.life_insurance_deduction > 0)
            addRow('Life Insurance Premium:', `(${formatMoney(taxComputation.life_insurance_deduction)})`);

        addRow('Total Deductions:', `(${formatMoney(taxComputation.total_deductions)})`, true);
        doc.moveDown(0.3);
        addRow('CHARGEABLE INCOME:', formatMoney(taxComputation.chargeable_income), true);

        // tax band breakdown
        doc.moveDown(0.5)
           .fillColor(GRAY)
           .fontSize(9)
           .text('Tax Band Computation:')
           .moveDown(0.3)
           .fillColor(DARK)
           .fontSize(10);

        taxComputation.computation.forEach(band => {
            addRow(
                `₦${Number(band.taxable_amount).toLocaleString()} @ ${band.rate}:`,
                formatMoney(band.tax)
            );
        });

        doc.moveDown(0.3);
        addRow('TAX PAYABLE:', formatMoney(taxComputation.tax_payable), true);
        addRow('Effective Tax Rate:', `${taxComputation.effective_rate}%`, true);

        // gemini narrative
        addSectionHeader('AI TAX ASSISTANT NOTES');

        doc.fillColor(DARK)
           .fontSize(10)
           .text(geminiNarrative.summary)
           .moveDown(0.5);

        if (geminiNarrative.tips?.length) {
            doc.fillColor(GRAY).fontSize(9).text('Recommendations:').moveDown(0.3);
            geminiNarrative.tips.forEach((tip, i) => {
                doc.fillColor(DARK).fontSize(10).text(`${i + 1}. ${tip}`).moveDown(0.2);
            });
        }

        if (geminiNarrative.flags?.length) {
            doc.moveDown(0.3).fillColor('#DC2626').fontSize(9).text('⚠️ Flags:').moveDown(0.2);
            geminiNarrative.flags.forEach(flag => {
                doc.fillColor('#DC2626').fontSize(10).text(`• ${flag}`).moveDown(0.2);
            });
        }

        // disclaimer box
        doc.moveDown(1)
           .fillColor(LIGHT)
           .rect(50, doc.y, 495, 60)
           .fill()
           .fillColor(GRAY)
           .fontSize(8)
           .text(
               geminiNarrative.disclaimer ||
               'This document is a financial summary generated for tax reference purposes only. It is not a substitute for official tax filing with FIRS or your state tax authority. Please consult a qualified tax professional.',
               58, doc.y + 8, { width: 479 }
           );

        // declaration line
        doc.moveDown(3)
           .fillColor(DARK)
           .fontSize(10)
           .text('Declaration: I declare that the information provided is true and correct to the best of my knowledge.')
           .moveDown(1)
           .text('Name: ________________________    TIN: ________________________')
           .moveDown(0.8)
           .text('Signature: ___________________    Date: ________________________');

        doc.end();

        writeStream.on('finish', () => resolve(filepath));
        writeStream.on('error', reject);
    });
};

module.exports = { generateTaxPDF };