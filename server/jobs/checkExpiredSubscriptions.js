import cron from "node-cron";
import { pool } from "../db.js";

export function scheduleExpiryCheck() {
  cron.schedule("5 0 * * *", async () => {
    try {
      console.log("[CRON] Verificando assinaturas expiradas...");

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const usersResult = await client.query(`
          UPDATE users
          SET
            subscription_status = 'expired',
            updated_at = CURRENT_TIMESTAMP
          WHERE
            subscription_status = 'active'
            AND subscription_expiry IS NOT NULL
            AND subscription_expiry < CURRENT_DATE
          RETURNING id
        `);

        const dependentsResult = await client.query(`
          UPDATE dependents
          SET
            subscription_status = 'expired'
          WHERE
            subscription_status = 'active'
            AND subscription_expiry IS NOT NULL
            AND subscription_expiry < CURRENT_DATE
          RETURNING id
        `);

        await client.query("COMMIT");

        console.log(`[CRON] ✓ ${usersResult.rowCount} usuários atualizados para 'expired'`);
        console.log(`[CRON] ✓ ${dependentsResult.rowCount} dependentes atualizados para 'expired'`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("[CRON] Erro ao verificar assinaturas expiradas:", error);
    }
  });

  console.log("✓ Job de verificação de assinaturas expiradas agendado (diariamente às 00:05)");
}

export async function checkExpiredSubscriptionsNow() {
  try {
    console.log("Verificando assinaturas expiradas imediatamente...");

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const usersResult = await client.query(`
        UPDATE users
        SET
          subscription_status = 'expired',
          updated_at = CURRENT_TIMESTAMP
        WHERE
          subscription_status = 'active'
          AND subscription_expiry IS NOT NULL
          AND subscription_expiry < CURRENT_DATE
        RETURNING id
      `);

      const dependentsResult = await client.query(`
        UPDATE dependents
        SET
          subscription_status = 'expired'
        WHERE
          subscription_status = 'active'
          AND subscription_expiry IS NOT NULL
          AND subscription_expiry < CURRENT_DATE
        RETURNING id
      `);

      await client.query("COMMIT");

      console.log(`✓ ${usersResult.rowCount} usuários atualizados para 'expired'`);
      console.log(`✓ ${dependentsResult.rowCount} dependentes atualizados para 'expired'`);

      return {
        usersUpdated: usersResult.rowCount,
        dependentsUpdated: dependentsResult.rowCount
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Erro ao verificar assinaturas expiradas:", error);
    throw error;
  }
}
