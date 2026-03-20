const nodemailer = require("nodemailer");
const { config } = require("../config/env");

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.resend.com",
      secure: true,
      port: 465,
      auth: {
        user: "resend",
        pass: "re_cQbHqbEm_E9yzeM69seFxyt3AtbQ87mWP",
      },
    });
  }

  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const mailer = getTransporter();
  return mailer.sendMail({
    from: process.env.EMAIL_FROM || "onboarding@resend.dev",
    to,
    subject,
    html,
    text,
  });
}

async function sendVerificationEmail(email, token) {
  const url = `${config.clientUrl}/verify-email?token=${token}`;
  return sendEmail({
    to: email,
    subject: "Verify your email address",
    text: `Please verify your email by clicking the link: ${url}`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto">
        <h2>Verify your email</h2>
        <p>Click the button below to verify your email address. This link expires in <strong>24 hours</strong>.</p>
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          Verify Email
        </a>
        <p style="margin-top:16px;color:#666;font-size:13px">Or copy this link:<br/><code>${url}</code></p>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(email, token) {
  const url = `${config.clientUrl}/reset-password?token=${token}`;
  return sendEmail({
    to: email,
    subject: "Reset your password",
    text: `Reset your password: ${url}`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto">
        <h2>Reset your password</h2>
        <p>Click below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          Reset Password
        </a>
        <p style="margin-top:16px;color:#666;font-size:13px">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
};
