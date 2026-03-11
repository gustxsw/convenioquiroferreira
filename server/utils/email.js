import nodemailer from "nodemailer";

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = process.env;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
  console.warn(
    "⚠️ SMTP environment variables are not fully configured. Password reset emails will not be sent."
  );
}

const transporter =
  SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      })
    : null;

export const sendEmail = async ({ to, subject, html }) => {
  if (!transporter) {
    console.warn("📧 SMTP transporter not configured. Skipping email send.");
    return;
  }

  const mailOptions = {
    from: SMTP_FROM,
    to,
    subject,
    html,
  };

  await transporter.sendMail(mailOptions);
};

