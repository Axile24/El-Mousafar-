import mysql from "mysql2/promise";
import { runDemoSeed } from "./seedDemo.js";

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
      email_verified TINYINT NOT NULL DEFAULT 0,
      phone VARCHAR(32) NULL,
      phone_verified TINYINT NOT NULL DEFAULT 0,
      verify_token VARCHAR(255),
      verify_expires BIGINT,
      UNIQUE KEY uniq_users_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await migrateUsersPhoneColumns(pool);
  await normalizeUserEmails(pool);

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
      conductor_license VARCHAR(64),
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
      UNIQUE KEY uniq_vehicle_code (vehicle_code),
      INDEX idx_vehicles_owner (owner_email),
      INDEX idx_vehicles_line (line)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS drivers (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      aftername VARCHAR(80),
      line VARCHAR(64),
      license_number VARCHAR(64),
      phone VARCHAR(40),
      notes VARCHAR(240),
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_drivers_name (name(40))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await migrateDriversColumns(pool);

  await migrateRegisteredVehiclesSchema(pool);

  if (String(process.env.SEED_DEMO_DATA || "").trim() === "1") {
    try {
      await runDemoSeed(pool);
    } catch (e) {
      console.warn("[seed] échec (ignoré au démarrage):", e?.message || e);
    }
  }
}

/** Harmonise les clés primaires e-mail (espaces, casse) avec authStore.normEmail. */
async function normalizeUserEmails(poolConn) {
  try {
    await poolConn.query(`UPDATE users SET email = LOWER(TRIM(email))`);
  } catch (e) {
    console.warn("[db] normalizeUserEmails:", e?.message || e);
  }
}

/** Téléphone + vérification SMS sur `users` (bases créées avant cette version). */
async function migrateUsersPhoneColumns(poolConn) {
  const dbName = MYSQL_DATABASE.replace(/`/g, "");

  async function addColumnIfMissing(col, ddlFragment) {
    const [rows] = await poolConn.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
      [dbName, col]
    );
    if (Number(rows[0]?.c) > 0) return;
    try {
      await poolConn.query(`ALTER TABLE users ADD COLUMN \`${col}\` ${ddlFragment}`);
    } catch (e) {
      if (String(e?.code) !== "ER_NO_SUCH_TABLE") throw e;
    }
  }

  await addColumnIfMissing("phone", "VARCHAR(32) NULL");
  await addColumnIfMissing("phone_verified", "TINYINT NOT NULL DEFAULT 0");

  try {
    await poolConn.query(
      `ALTER TABLE users MODIFY COLUMN phone VARCHAR(32) NULL`
    );
  } catch {
    /* table absente ou déjà à jour */
  }
  const [emailCol] = await poolConn.query(
    `SELECT COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified'`,
    [dbName]
  );
  if (
    emailCol.length &&
    String(emailCol[0]?.COLUMN_DEFAULT || "") === "1" &&
    emailCol[0]?.IS_NULLABLE === "NO"
  ) {
    try {
      await poolConn.query(
        `ALTER TABLE users MODIFY COLUMN email_verified TINYINT NOT NULL DEFAULT 0`
      );
    } catch {
      /* ignore */
    }
  }

  const [idxRows] = await poolConn.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND INDEX_NAME = 'uniq_users_phone'`,
    [dbName]
  );
  if (Number(idxRows[0]?.c) === 0) {
    try {
      await poolConn.query(`ALTER TABLE users ADD UNIQUE KEY uniq_users_phone (phone)`);
    } catch (e) {
      console.warn("[db] uniq_users_phone :", e?.message || e);
    }
  }

  try {
    /* Ne pas marquer comme vérifiés les comptes en attente d’OTP (e-mail non vérifié, téléphone NULL). */
    await poolConn.query(
      `UPDATE users SET phone_verified = 1 WHERE (phone IS NULL OR phone = '') AND email_verified = 1`
    );
  } catch {
    /* table absente */
  }
}

/** Colonnes optionnelles sur `drivers` (bases créées avant cette version). */
async function migrateDriversColumns(poolConn) {
  const dbName = MYSQL_DATABASE.replace(/`/g, "");

  async function addColumnIfMissing(col, ddlFragment) {
    const [rows] = await poolConn.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'drivers' AND COLUMN_NAME = ?`,
      [dbName, col]
    );
    if (Number(rows[0]?.c) > 0) return;
    try {
      await poolConn.query(`ALTER TABLE drivers ADD COLUMN \`${col}\` ${ddlFragment}`);
    } catch (e) {
      if (String(e?.code) !== "ER_NO_SUCH_TABLE") throw e;
    }
  }

  await addColumnIfMissing("line", "VARCHAR(64) NULL");
  await addColumnIfMissing("license_number", "VARCHAR(64) NULL");
}

/** Normalise les codes bus, supprime les doublons, unique globale sur vehicle_code. */
async function migrateRegisteredVehiclesSchema(poolConn) {
  const dbName = MYSQL_DATABASE.replace(/`/g, "");

  try {
    await poolConn.query(
      `UPDATE registered_vehicles SET vehicle_code = UPPER(TRIM(vehicle_code)) WHERE vehicle_code IS NOT NULL`
    );
  } catch {
    /* pas encore de table */
  }

  try {
    await poolConn.query(
      `DELETE rv1 FROM registered_vehicles rv1
       INNER JOIN registered_vehicles rv2
         ON rv1.vehicle_code = rv2.vehicle_code AND rv1.id > rv2.id`
    );
  } catch {
    /* vide */
  }

  for (const idx of ["uniq_owner_vehicle", "uniq_owner_vehicle_line"]) {
    const [rows] = await poolConn.query(
      `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'registered_vehicles' AND INDEX_NAME = ?`,
      [dbName, idx]
    );
    if (Number(rows[0]?.c) > 0) {
      await poolConn.query(`ALTER TABLE registered_vehicles DROP INDEX \`${idx}\``);
    }
  }

  const [vcRows] = await poolConn.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'registered_vehicles'
       AND INDEX_NAME = 'uniq_vehicle_code'`,
    [dbName]
  );
  if (Number(vcRows[0]?.c) === 0) {
    try {
      await poolConn.query(
        `ALTER TABLE registered_vehicles ADD UNIQUE KEY uniq_vehicle_code (vehicle_code)`
      );
    } catch (e) {
      if (String(e?.code) !== "ER_DUP_ENTRY" && !String(e?.message || "").includes("Duplicate")) {
        throw e;
      }
      console.warn(
        "[db] uniq_vehicle_code : doublons restants sur vehicle_code — nettoyez registered_vehicles."
      );
    }
  }

  async function addRvColumnIfMissing(col, ddlFragment) {
    const [rows] = await poolConn.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'registered_vehicles' AND COLUMN_NAME = ?`,
      [dbName, col]
    );
    if (Number(rows[0]?.c) > 0) return;
    try {
      await poolConn.query(
        `ALTER TABLE registered_vehicles ADD COLUMN \`${col}\` ${ddlFragment}`
      );
    } catch (e) {
      if (String(e?.code) !== "ER_NO_SUCH_TABLE") throw e;
    }
  }

  await addRvColumnIfMissing("conductor_license", "VARCHAR(64) NULL");
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
