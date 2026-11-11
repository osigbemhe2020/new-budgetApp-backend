// services/taxCalculation.service.js

// PITA 2024 tax bands
const TAX_BANDS = [
    { limit: 300000,  rate: 0.07 },
    { limit: 300000,  rate: 0.11 },
    { limit: 500000,  rate: 0.15 },
    { limit: 500000,  rate: 0.19 },
    { limit: 1600000, rate: 0.21 },
    { limit: Infinity, rate: 0.24 }
];

// calculate CRA — higher of ₦200,000 or 1% of gross income + 20% of gross income
const calculateCRA = (gross_income) => {
    const one_percent = gross_income * 0.01;
    const base = Math.max(200000, one_percent);
    const twenty_percent = gross_income * 0.20;
    return Number((base + twenty_percent).toFixed(2));
};

// apply PITA tax bands to chargeable income
const calculateTaxPayable = (chargeable_income) => {
    if (chargeable_income <= 0) {
        return {
            tax_payable: 0,
            computation: []
        };
    }

    // first ₦800,000 is covered by CRA (already deducted)
    let remaining = chargeable_income;
    let tax = 0;
    let computation = [];

    for (const band of TAX_BANDS) {
        if (remaining <= 0) break;

        const taxable_in_band = Math.min(remaining, band.limit);
        const tax_in_band = taxable_in_band * band.rate;

        computation.push({
            taxable_amount: taxable_in_band,
            rate: `${band.rate * 100}%`,
            tax: Number(tax_in_band.toFixed(2))
        });

        tax += tax_in_band;
        remaining -= taxable_in_band;
    }

    return {
        tax_payable: Number(tax.toFixed(2)),
        computation // breakdown by band for the PDF
    };
};

const computeTax = (gross_income, taxProfile) => {
    // deductions
    const cra = calculateCRA(gross_income);
    const pension_deduction = Number(taxProfile.pension_contribution) || 0;
    const nhf_deduction = Number(taxProfile.nhf_contribution) || 0;
    const life_insurance_deduction = Number(taxProfile.life_insurance_premium) || 0;

    const total_deductions = Number(
        (cra + pension_deduction + nhf_deduction + life_insurance_deduction).toFixed(2)
    );

    // chargeable income cannot be negative
    const chargeable_income = Math.max(0, gross_income - total_deductions);

    const { tax_payable, computation } = calculateTaxPayable(chargeable_income);

    const effective_rate = gross_income > 0
        ? Number(((tax_payable / gross_income) * 100).toFixed(2))
        : 0;

    return {
        gross_income,
        cra,
        pension_deduction,
        nhf_deduction,
        life_insurance_deduction,
        total_deductions,
        chargeable_income,
        tax_payable,
        effective_rate,
        computation // band breakdown
    };
};

module.exports = { computeTax, calculateCRA };