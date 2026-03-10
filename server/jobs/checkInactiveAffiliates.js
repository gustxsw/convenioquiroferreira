import cron from "node-cron";
import { pool } from "../db.js";

const INACTIVITY_DAYS = 90;

export function scheduleAffiliateInactivityCheck() {
  cron.schedule("10 0 * * *", async () => {
    try {
      console.log("[CRON] Verificando inatividade de vendedores...");

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const inactiveResult = await client.query(
          `
          WITH last_activity AS (
            SELECT
              a.id,
              GREATEST(
                a.created_at,
                COALESCE(MAX(ac.created_at), a.created_at)
              ) AS last_activity
            FROM affiliates a
            LEFT JOIN affiliate_commissions ac ON ac.affiliate_id = a.id
            GROUP BY a.id
          ),
          inactive_affiliates AS (
            SELECT id
            FROM last_activity
            WHERE last_activity < CURRENT_DATE - INTERVAL '${INACTIVITY_DAYS} days'
          )
          UPDATE affiliates
          SET status = 'inactive',
              leadership_enabled = false
          WHERE id IN (SELECT id FROM inactive_affiliates)
            AND status = 'active'
          RETURNING id
        `
        );

        await client.query(
          `
          UPDATE affiliates
          SET leader_affiliate_id = NULL
          WHERE leader_affiliate_id IN (
            SELECT id FROM affiliates WHERE status = 'inactive'
          )
        `
        );

        await client.query("COMMIT");

        console.log(
          `[CRON] ✓ ${inactiveResult.rowCount} vendedores marcados como inativos`
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("[CRON] Erro ao verificar inatividade:", error);
    }
  });

  console.log(
    "✓ Job de inatividade de vendedores agendado (diariamente às 00:10)"
  );
}

