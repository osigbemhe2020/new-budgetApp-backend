const { Resend } = require('resend');
const fs = require('fs');

// Lazy initialization of Resend client
let resend = null;

const getResendClient = () => {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

const sendPasswordResetEmail = async ({token }) => {
  const client = getResendClient();
  if (!client) {
    console.warn('Resend API key not configured. Email sending disabled.');
    return { success: false, error: 'Email service not configured' };
  }

  await client.emails.send({
    from: 'onboarding@resend.dev',
    to: 'dirisupaul16@gmail.com',
    subject: 'Password Reset Request - BudgetApp',
    html: `
      <h2>Password Reset Request</h2>

      <p>We received a request to reset your password for the Knights of St. Mulumba Member Portal.</p>
      <p>Click the link below to reset your password:</p>
      <a href="${process.env.FRONTEND_URL}/sign-in/reset-password?token=${token}" style="background-color: #1E4D3A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
        Reset Password
      </a>
      <p>Or copy and paste this link:</p>
      <p>${process.env.FRONTEND_URL}/sign-in/reset-password?token=${token}</p>
    `
  });
};

const sendTaxDocument = async ({ to, name, period, pdfPath, filingId }) => {
    try {
        const client = getResendClient();
        if (!client) {
            console.warn('Resend API key not configured. Email sending disabled.');
            return { success: false, error: 'Email service not configured' };
        }

        const pdfBuffer = fs.readFileSync(pdfPath);

        const { data, error } = await client.emails.send({
            from: 'BudgetWise <onboarding@resend.dev>',
            to: to,
            subject: `Your Tax Summary — ${period.start} to ${period.end}`,
            html: `
                <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #2563EB; padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">BudgetWise</h1>
                        <p style="color: #BFDBFE; margin: 8px 0 0;">Tax Summary Document</p>
                    </div>

                    <div style="padding: 30px; background: #F8FAFC;">
                        <p style="color: #1E293B;">Hi ${name},</p>

                        <p style="color: #475569;">
                            Your tax summary document for the period
                            <strong>${period.start} to ${period.end}</strong>
                            has been generated and is attached to this email.
                        </p>

                        <div style="background: #EFF6FF; border-left: 4px solid #2563EB; padding: 15px; margin: 20px 0;">
                            <p style="color: #1E40AF; margin: 0; font-size: 14px;">
                                <strong>Next Steps:</strong><br/>
                                1. Review the document carefully<br/>
                                2. Sign the declaration page<br/>
                                3. Submit via FIRS TaxPro Max portal or visit your nearest FIRS office<br/>
                                4. Keep a copy for your records
                            </p>
                        </div>

                        <p style="color: #94A3B8; font-size: 12px;">
                            This document is generated for reference purposes only and is not a
                            substitute for official tax filing. Filing ID: #${filingId}
                        </p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: `tax-summary-${period.start}-${period.end}.pdf`,
                    content: pdfBuffer.toString('base64'),
                    type: 'application/pdf'
                }
            ]
        });

        if (error) throw new Error(error.message);
        return { success: true, messageId: data.id };

    } catch (error) {
        console.error('Email send error:', error);
        return { success: false, error: error.message };
    }
};

module.exports = { sendTaxDocument, sendPasswordResetEmail };