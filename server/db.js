import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://neondb_owner:npg_hZTr3D2oiFAv@ep-bold-grass-acq6z6br-pooler.sa-east-1.aws.neon.tech/convenioquiroferreira?sslmode=require&channel_binding=require",
  ssl: {
    rejectUnauthorized: false,
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err, client) => {
  console.error("❌ Unexpected database error:", err);
});

pool.on("connect", () => {
  console.log("✅ New database connection established");
});
