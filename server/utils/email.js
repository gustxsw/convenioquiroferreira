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
    console.warn("📧 SMTP transporter not configured. Skipping email send.", {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER: SMTP_USER ? "[SET]" : "[MISSING]",
      SMTP_FROM,
    });
    return;
  }

  const mailOptions = {
    from: SMTP_FROM,
    to,
    subject,
    html,
  };

  console.log("📧 Attempting to send email:", {
    to,
    subject,
    from: mailOptions.from,
  });

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", {
      messageId: info.messageId,
      response: info.response,
      to,
    });
  } catch (error) {
    console.error("❌ Error sending email via transporter:", error);
    throw error;
  }
};

