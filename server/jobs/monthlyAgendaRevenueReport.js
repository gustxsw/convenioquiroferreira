import cron from "node-cron";
import { pool } from "../db.js";
import { sendEmail } from "../utils/email.js";

const ADMIN_REPORT_RECIPIENTS = [
  "admin@cartaoquiroferreira.com.br",
  "gustavocandido044@gmail.com",
];

export function scheduleMonthlyAgendaRevenueReport() {
  // Run at 06:00 on the 1st day of every month
  cron.schedule("0 6 1 * *", async () => {
    try {
      console.log("[CRON] Generating monthly agenda revenue report...");

      // Calculate current month range in UTC
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth(); // 0-based
      const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

      console.log("[CRON] Month range (UTC):", {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      });

      // Get professionals who PAID for agenda in the current month
      const paymentsResult = await pool.query(
        `
        SELECT 
          ap.professional_id,
          u.name AS professional_name,
          COALESCE(SUM(ap.amount), 0) AS total_paid_agenda
        FROM agenda_payments ap
        JOIN users u ON u.id = ap.professional_id
        WHERE ap.status = 'approved'
          AND ap.processed_at >= $1
          AND ap.processed_at < $2
        GROUP BY ap.professional_id, u.name
        ORDER BY u.name ASC
      `,
        [startDate.toISOString(), endDate.toISOString()]
      );

      const rows = paymentsResult.rows;

      if (!rows.length) {
        console.log(
          "[CRON] No approved agenda payments for this month. Skipping email."
        );
        return;
      }

      // Build simple HTML "report" that can be printed/saved as PDF by email client
      const monthLabel = startDate.toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      });

      const totalAgendaRevenue = rows.reduce(
        (sum, r) => sum + Number.parseFloat(r.total_paid_agenda || 0),
        0
      );

      const tableRows = rows
        .map((r, index) => {
          const formattedAmount = Number(r.total_paid_agenda).toLocaleString(
            "pt-BR",
            { style: "currency", currency: "BRL" }
          );
          return `
            <tr>
              <td style="padding: 6px 8px; border: 1px solid #ddd; text-align:center;">
                ${index + 1}
              </td>
              <td style="padding: 6px 8px; border: 1px solid #ddd;">
                ${r.professional_name}
              </td>
              <td style="padding: 6px 8px; border: 1px solid #ddd; text-align:right;">
                ${formattedAmount}
              </td>
            </tr>
          `;
        })
        .join("");

      const totalFormatted = totalAgendaRevenue.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111;">
          <h1 style="font-size: 20px; margin-bottom: 4px; color:#c11c22;">
            Relatório Mensal - Faturamento da Agenda
          </h1>
          <p style="margin: 0 0 16px 0; color:#555;">
            Mês de referência: <strong>${monthLabel}</strong>
          </p>

          <p style="margin: 0 0 8px 0;">
            Apenas profissionais com <strong>pagamento de agenda aprovado</strong> no mês vigente.
          </p>

          <table style="border-collapse: collapse; width: 100%; margin-top: 12px; margin-bottom: 12px;">
            <thead>
              <tr style="background:#f5f5f5;">
                <th style="padding: 6px 8px; border: 1px solid #ddd; text-align:center;">#</th>
                <th style="padding: 6px 8px; border: 1px solid #ddd; text-align:left;">Profissional</th>
                <th style="padding: 6px 8px; border: 1px solid #ddd; text-align:right;">Total Pago Agenda</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr style="background:#fafafa;">
                <td colspan="2" style="padding: 6px 8px; border: 1px solid #ddd; text-align:right; font-weight:bold;">
                  Total do mês:
                </td>
                <td style="padding: 6px 8px; border: 1px solid #ddd; text-align:right; font-weight:bold;">
                  ${totalFormatted}
                </td>
              </tr>
            </tfoot>
          </table>

          <p style="font-size:12px; color:#888; margin-top:16px;">
            Este relatório é gerado automaticamente pelo sistema Cartão Quiro Ferreira.
          </p>
        </div>
      `;

      const subject = `Relatório mensal - Faturamento da agenda (${monthLabel})`;

      await sendEmail({
        to: ADMIN_REPORT_RECIPIENTS.join(","),
        subject,
        html,
      });

      console.log(
        `[CRON] Monthly agenda revenue report sent to: ${ADMIN_REPORT_RECIPIENTS.join(
          ", "
        )}`
      );
    } catch (error) {
      console.error(
        "[CRON] Error while generating/sending monthly agenda revenue report:",
        error
      );
    }
  });

  console.log(
    "✓ Job de relatório mensal de faturamento da agenda agendado (todo dia 1 às 06:00)"
  );
}

