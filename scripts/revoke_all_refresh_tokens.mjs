// One-off remediation: revoke every active refresh token so all users are
// forced to log in again with the new, user-bound + unique refresh tokens.
// Run AFTER deploying the auth fix. Safe to re-run (idempotent).
import { pool } from "../server/db.js";

const run = async () => {
  const before = await pool.query(
    `SELECT COUNT(*)::int AS active FROM refresh_tokens WHERE revoked = false`
  );
  const active = before.rows[0].active;
  console.log(`Active (non-revoked) refresh tokens before: ${active}`);

  const result = await pool.query(
    `UPDATE refresh_tokens SET revoked = true WHERE revoked = false`
  );
  console.log(`Revoked now: ${result.rowCount}`);

  const after = await pool.query(
    `SELECT COUNT(*)::int AS active FROM refresh_tokens WHERE revoked = false`
  );
  console.log(`Active (non-revoked) refresh tokens after: ${after.rows[0].active}`);
};

run()
  .then(() => pool.end())
  .then(() => {
    console.log("✅ Done. All users will re-authenticate on next refresh.");
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌ Failed:", err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
