import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// TIMESTAMP WITHOUT TIME ZONE (OID 1114) values are stored as UTC in this project.
// Without this override, pg parses them using the process's local timezone, causing
// a double-conversion bug on non-UTC systems (e.g., Windows with BRT timezone).
pg.types.setTypeParser(1114, (str) => new Date(str + "Z"));

export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://neondb_owner:npg_FC9TuaYLdMD8@ep-steep-violet-afyt4sti-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
});
