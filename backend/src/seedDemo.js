import { hashPassword } from "./passwordHash.js";

const DEMO_PASS = "demo123";

/**
 * Idempotent demo users, drivers, and buses (requires SEED_DEMO_DATA=1).
 * Uses pool from db after schema is ready — no import from db.js to avoid cycles.
 */
export async function runDemoSeed(pool) {
  const now = Date.now();

  const users = [
    ["demo-admin@local.test", "admin"],
    ["demo-driver1@local.test", "driver"],
    ["demo-driver2@local.test", "driver"],
  ];

  const passHash = hashPassword(DEMO_PASS);

  const demoPhones = ["+46700000001", "+46700000002", "+46700000003"];

  for (let i = 0; i < users.length; i += 1) {
    const [email, role] = users[i];
    await pool.query(
      `INSERT INTO users (email, password_hash, role, created_at, email_verified, phone, phone_verified, verify_token, verify_expires)
       VALUES (?, ?, ?, ?, 1, ?, 1, NULL, NULL)
       ON DUPLICATE KEY UPDATE email = email`,
      [email, passHash, role, now, demoPhones[i]]
    );
  }

  const [driverRows] = await pool.query(
    "SELECT COUNT(*) AS c FROM drivers WHERE notes LIKE '[demo]%'"
  );
  if (Number(driverRows[0]?.c) === 0) {
    await pool.query(
      `INSERT INTO drivers (name, aftername, line, license_number, phone, notes, created_at, updated_at) VALUES
       (?, ?, ?, ?, ?, ?, ?, ?),
       (?, ?, ?, ?, ?, ?, ?, ?),
       (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "Amine",
        "K.",
        "W15",
        "DZ-DEMO-01001",
        "+213 555 0101",
        "[demo] Conducteur principal",
        now,
        now,
        "Sara",
        "B.",
        "W15",
        "DZ-DEMO-01002",
        "+213 555 0102",
        "[demo] Remplaçant",
        now,
        now,
        "Mehdi",
        "T.",
        "W16",
        "DZ-DEMO-01003",
        "",
        "[demo] Weekend",
        now,
        now,
      ]
    );
  }

  const buses = [
    {
      owner: "demo-admin@local.test",
      code: "BUS-01",
      line: "W15",
      name: "Amine",
      after: "K.",
      license: "DZ-DEMO-01001",
    },
    {
      owner: "demo-driver1@local.test",
      code: "BUS-02",
      line: "W15",
      name: "Sara",
      after: "B.",
      license: "DZ-DEMO-01002",
    },
    {
      owner: "demo-driver2@local.test",
      code: "BUS-03",
      line: "W16",
      name: "Mehdi",
      after: "T.",
      license: "DZ-DEMO-01003",
    },
  ];

  for (const b of buses) {
    const [existing] = await pool.query(
      "SELECT id, owner_email FROM registered_vehicles WHERE vehicle_code = ?",
      [b.code]
    );
    if (existing.length > 0) {
      continue;
    }
    await pool.query(
      `INSERT INTO registered_vehicles (
        owner_email, vehicle_code, line, vehicle_type,
        conductor_name, conductor_aftername, conductor_license, route_start, route_end,
        seats_total, available, service_alert, service_note,
        destination_label, departure_local, arrival_local, updated_at
      ) VALUES (?, ?, ?, 'bus', ?, ?, ?, 'Tizi Ouzou', 'Alger', 40, 1, 'ok', NULL, NULL, NULL, NULL, ?)`,
      [b.owner, b.code, b.line, b.name, b.after, b.license || null, now]
    );
  }

  console.log("[seed] Données de démo : comptes", users.map((u) => u[0]).join(", "), `— mot de passe : ${DEMO_PASS}`);
}
