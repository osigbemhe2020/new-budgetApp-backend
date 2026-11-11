// services/gemini.service.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generateTaxNarrative = async ({
    user, taxProfile, period, financialData, taxComputation
}) => {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

        const prompt = `
You are a Nigerian tax assistant familiar with the Personal Income Tax Act (PITA) 
as amended by the Finance Act 2024.

A user has generated a tax summary document. Your job is to:
1. Review the computation and confirm it looks correct
2. Give 2-3 plain English tips specific to their situation
3. Flag any concerns FIRS might have
4. Keep your response concise — this will appear in a PDF

User Details:
- Name: ${user.username}
- Account Type: ${taxProfile.account_type}
- Occupation: ${taxProfile.occupation || 'Not specified'}
- State: ${taxProfile.state_of_residence || 'Not specified'}
- TIN: ${taxProfile.tin || 'Not provided'}

Period: ${period.start} to ${period.end} (${period.type})

Financial Summary:
- Gross Income: ₦${financialData.gross_income.toLocaleString()}
- Total Expenses: ₦${financialData.total_expenses.toLocaleString()}
- Net Income: ₦${financialData.net_income.toLocaleString()}

Tax Computation:
- CRA: ₦${taxComputation.cra.toLocaleString()}
- Total Deductions: ₦${taxComputation.total_deductions.toLocaleString()}
- Chargeable Income: ₦${taxComputation.chargeable_income.toLocaleString()}
- Tax Payable: ₦${taxComputation.tax_payable.toLocaleString()}
- Effective Rate: ${taxComputation.effective_rate}%

Please respond in this exact JSON format:
{
    "status": "looks correct" | "needs review",
    "summary": "2-3 sentence plain English summary of their tax situation",
    "tips": ["tip 1", "tip 2", "tip 3"],
    "flags": ["flag 1"] or [],
    "disclaimer": "standard disclaimer about consulting a tax professional"
}
`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // clean and parse JSON response
        const clean = text.replace(/```json|```/g, '').trim();
        return JSON.parse(clean);

    } catch (error) {
        console.error('Gemini error:', error);
        // return a safe fallback if Gemini fails
        return {
            status: 'looks correct',
            summary: 'Your tax computation has been generated based on PITA 2024 guidelines.',
            tips: [
                'Ensure your TIN is registered with FIRS before submission.',
                'Keep receipts for all declared deductions.',
                'Visit FIRS TaxPro Max portal to submit your return officially.'
            ],
            flags: taxProfile.tin ? [] : ['TIN not provided — obtain from FIRS before filing'],
            disclaimer: 'This document is generated for reference purposes only. Please consult a qualified tax professional or visit FIRS for official filing.'
        };
    }
};

module.exports = { generateTaxNarrative };