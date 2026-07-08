import fs from "fs";
import pg from "pg";

// lê DATABASE_URL do .env sem depender de dotenv
const env = fs.readFileSync(new URL("./.env", import.meta.url), "utf8");
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].trim().replace(/^["']|["']$/g, "");

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const q = (t, s, p = []) =>
  pool.query(s, p).then((r) => {
    console.log(`\n=== ${t} (${r.rows.length}) ===`);
    console.table(r.rows);
  });

try {
  await q(
    "audit do bot (30 min)",
    `SELECT phone, action, detail, professional_id, created_at
       FROM whatsapp_audit_log
      WHERE created_at > now() - interval '30 minutes'
        AND action IN ('consultation_created','intent_detected','private_patient_created','client_created')
      ORDER BY created_at DESC LIMIT 20`
  );
  await q(
    "consultations (30 min)",
    `SELECT id, user_id, private_patient_id, professional_id, service_id, value, date, status, created_at
       FROM consultations
      WHERE created_at > now() - interval '30 minutes'
      ORDER BY created_at DESC LIMIT 20`
  );
} catch (e) {
  console.error("ERRO:", e.message);
} finally {
  await pool.end();
}
