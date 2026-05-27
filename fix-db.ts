import pg from "pg";
import bcrypt from "bcrypt";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.PG_VECTOR_URL,
});

async function fix() {
  if (!process.env.DATABASE_URL && !process.env.PG_VECTOR_URL) {
    console.log("No PostgreSQL configured. Skipping");
    process.exit();
  }
  const defaultPassword = await bcrypt.hash("password", 10);
  const client = await pool.connect();
  
  try {
     await client.query("ALTER TABLE system_users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)");
  } catch(e) {
    console.log("Alter error", e);
  }
  
  const res = await client.query("UPDATE system_users SET password_hash = $1 WHERE password_hash IS NULL", [defaultPassword]);
  console.log("Updated rows:", res.rowCount);
  process.exit();
}
fix();
