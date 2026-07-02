const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const sendPasswordResetEmail = async ({token }) => {
  await resend.emails.send({
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

module.exports = { sendPasswordResetEmail };