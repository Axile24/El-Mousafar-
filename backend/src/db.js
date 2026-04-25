import mysql from "mysql2/promise";

const MYSQL_DATABASE = String(process.env.MYSQL_DATABASE || "el_mousafar").trim();

const baseConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  namedPlaceholders: true,
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
  charset: "utf8mb4",
  ...(String(process.env.MYSQL_SSL || "").toLowerCase() === "true"
    ? { ssl: { rejectUnauthorized: true } }
    : {}),
};

export const dbInfo = {
  engine: "mysql",
  host: baseConfig.host,
  port: baseConfig.port,
  user: baseConfig.user,
  database: MYSQL_DATABASE,
};

let pool;
let ready;

async function createDatabaseIfNeeded() {
  const bootstrap = await mysql.createConnection(baseConfig);
  try {
    try {
      await bootstrap.query(
        `CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\`
         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } catch (e) {
      // Managed MySQL users often cannot create databases. In that case the
      // configured database must already exist, and schema creation will verify it.
      if (e?.code !== "ER_DBACCESS_DENIED_ERROR") throw e;
    }
  } finally {
    await bootstrap.end();
  }
}

async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      email VARCHAR(120) PRIMARY KEY,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL,
      created_at BIGINT NOT NULL,
      email_verified TINYINT NOT NULL DEFAULT 1,
      verify_token VARCHAR(255),
      verify_expires BIGINT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(128) PRIMARY KEY,
      email VARCHAR(120) NOT NULL,
      role VARCHAR(20) NOT NULL,
      expires_at BIGINT NOT NULL,
      INDEX idx_sessions_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS registered_vehicles (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_email VARCHAR(120) NOT NULL,
      vehicle_code VARCHAR(64) NOT NULL,
      line VARCHAR(64) NOT NULL,
      vehicle_type VARCHAR(20) NOT NULL DEFAULT 'bus',
      conductor_name VARCHAR(80),
      conductor_aftername VARCHAR(80),
      route_start VARCHAR(160),
      route_end VARCHAR(160),
      seats_total INT,
      available TINYINT NOT NULL DEFAULT 1,
      service_alert VARCHAR(20),
      service_note VARCHAR(240),
      destination_label VARCHAR(200),
      departure_local VARCHAR(40),
      arrival_local VARCHAR(40),
      updated_at BIGINT NOT NULL,
      UNIQUE KEY uniq_owner_vehicle (owner_email, vehicle_code),
      INDEX idx_vehicles_owner (owner_email),
      INDEX idx_vehicles_line (line)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(
    `UPDATE users
     SET email_verified = 1, verify_token = NULL, verify_expires = NULL
     WHERE email_verified != 1 OR verify_token IS NOT NULL OR verify_expires IS NOT NULL`
  );
}

export async function initDb() {
  if (!ready) {
    ready = (async () => {
      let lastError;
      for (let attempt = 1; attempt <= 20; attempt += 1) {
        try {
          await createDatabaseIfNeeded();
          pool = mysql.createPool({ ...baseConfig, database: MYSQL_DATABASE });
          await createSchema();
          return;
        } catch (e) {
          lastError = e;
          if (pool) {
            await pool.end().catch(() => {});
            pool = null;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
      throw lastError;
    })();
  }
  return ready;
}

export async function query(sql, params = []) {
  await initDb();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function run(sql, params = []) {
  await initDb();
  const [result] = await pool.execute(sql, params);
  return result;
}
