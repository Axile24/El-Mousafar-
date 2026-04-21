import { db } from "./db.js";

function normEmail(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

function clamp(s, max) {
  const t = String(s ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * @param {string} ownerEmail
 * @param {object} v
 */
export function upsertRegisteredVehicle(ownerEmail, v) {
  const owner = normEmail(ownerEmail);
  const vehicleCode = clamp(v.vehicleCode, 64);
  const line = clamp(v.line, 64);
  const vehicleType =
    String(v.vehicleType || "bus").toLowerCase() === "taxi" ? "taxi" : "bus";
  if (!vehicleCode || !line) {
    return { ok: false, error: "vehicleCode et line sont requis" };
  }
  const destinationLabel = clamp(v.destinationLabel, 200) || null;
  const departureLocal = clamp(v.departureLocal, 40) || null;
  const arrivalLocal = clamp(v.arrivalLocal, 40) || null;
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO registered_vehicles (
      owner_email, vehicle_code, line, vehicle_type,
      destination_label, departure_local, arrival_local, updated_at
    ) VALUES (@owner, @code, @line, @type, @dest, @dep, @arr, @now)
    ON CONFLICT(owner_email, vehicle_code) DO UPDATE SET
      line = excluded.line,
      vehicle_type = excluded.vehicle_type,
      destination_label = excluded.destination_label,
      departure_local = excluded.departure_local,
      arrival_local = excluded.arrival_local,
      updated_at = excluded.updated_at
  `);
  stmt.run({
    owner: owner,
    code: vehicleCode,
    line,
    type: vehicleType,
    dest: destinationLabel,
    dep: departureLocal,
    arr: arrivalLocal,
    now,
  });

  const row = db
    .prepare(
      `SELECT id, owner_email, vehicle_code, line, vehicle_type,
              destination_label, departure_local, arrival_local, updated_at
       FROM registered_vehicles WHERE owner_email = ? AND vehicle_code = ?`
    )
    .get(owner, vehicleCode);
  return { ok: true, vehicle: rowToApi(row) };
}

function rowToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerEmail: row.owner_email,
    vehicleCode: row.vehicle_code,
    line: row.line,
    vehicleType: row.vehicle_type,
    destinationLabel: row.destination_label,
    departureLocal: row.departure_local,
    arrivalLocal: row.arrival_local,
    updatedAt: row.updated_at,
  };
}

export function listVehiclesForOwner(ownerEmail) {
  const owner = normEmail(ownerEmail);
  const rows = db
    .prepare(
      `SELECT id, owner_email, vehicle_code, line, vehicle_type,
              destination_label, departure_local, arrival_local, updated_at
       FROM registered_vehicles WHERE owner_email = ?
       ORDER BY updated_at DESC`
    )
    .all(owner);
  return rows.map(rowToApi);
}

export function listAllVehicles() {
  const rows = db
    .prepare(
      `SELECT id, owner_email, vehicle_code, line, vehicle_type,
              destination_label, departure_local, arrival_local, updated_at
       FROM registered_vehicles ORDER BY updated_at DESC`
    )
    .all();
  return rows.map(rowToApi);
}

export function deleteVehicle(ownerEmail, id, isAdmin) {
  const owner = normEmail(ownerEmail);
  const vid = Number(id);
  if (!Number.isFinite(vid)) return { ok: false, error: "ID invalide" };
  const row = db
    .prepare("SELECT owner_email FROM registered_vehicles WHERE id = ?")
    .get(vid);
  if (!row) return { ok: false, error: "Véhicule introuvable" };
  if (!isAdmin && normEmail(row.owner_email) !== owner) {
    return { ok: false, error: "Non autorisé" };
  }
  db.prepare("DELETE FROM registered_vehicles WHERE id = ?").run(vid);
  return { ok: true };
}

/**
 * Mise à jour par identifiant SQLite — conducteur (sa ligne uniquement) ou admin (toutes).
 * @param {string|number} id
 * @param {object} patch vehicleCode, line, vehicleType, destinationLabel, departureLocal, arrivalLocal, ownerEmail (admin seulement)
 * @param {{ email: string, role: string }} actor
 */
export function updateVehicleById(id, patch, actor) {
  const vid = Number(id);
  if (!Number.isFinite(vid)) return { ok: false, error: "ID invalide" };
  const row = db
    .prepare(
      `SELECT id, owner_email, vehicle_code, line, vehicle_type,
              destination_label, departure_local, arrival_local, updated_at
       FROM registered_vehicles WHERE id = ?`
    )
    .get(vid);
  if (!row) return { ok: false, error: "Véhicule introuvable" };

  const isAdmin = String(actor.role || "") === "admin";
  const actorOwner = normEmail(actor.email);
  if (!isAdmin && normEmail(row.owner_email) !== actorOwner) {
    return { ok: false, error: "Non autorisé" };
  }

  let ownerEmail = normEmail(row.owner_email);
  if (isAdmin) {
    if (patch.ownerEmail != null && String(patch.ownerEmail).trim()) {
      ownerEmail = normEmail(patch.ownerEmail);
      if (!ownerEmail.includes("@")) {
        return { ok: false, error: "ownerEmail invalide" };
      }
    }
  } else if (
    patch.ownerEmail != null &&
    normEmail(patch.ownerEmail) !== ownerEmail
  ) {
    return { ok: false, error: "Impossible de changer le propriétaire." };
  }

  let vehicleCode = row.vehicle_code;
  if (patch.vehicleCode != null && String(patch.vehicleCode).trim()) {
    vehicleCode = clamp(patch.vehicleCode, 64);
    if (!isAdmin && vehicleCode !== row.vehicle_code) {
      return {
        ok: false,
        error: "Le code véhicule ne peut être modifié que par un administrateur.",
      };
    }
  }

  const line = patch.line != null ? clamp(patch.line, 64) : row.line;
  const vehicleType =
    patch.vehicleType != null
      ? String(patch.vehicleType || "bus").toLowerCase() === "taxi"
        ? "taxi"
        : "bus"
      : row.vehicle_type;
  const destinationLabel = Object.prototype.hasOwnProperty.call(
    patch,
    "destinationLabel"
  )
    ? (() => {
        const t = patch.destinationLabel;
        if (t == null || String(t).trim() === "") return null;
        return clamp(t, 200) || null;
      })()
    : row.destination_label;
  const departureLocal = Object.prototype.hasOwnProperty.call(
    patch,
    "departureLocal"
  )
    ? (() => {
        const t = patch.departureLocal;
        if (t == null || String(t).trim() === "") return null;
        return clamp(t, 40) || null;
      })()
    : row.departure_local;
  const arrivalLocal = Object.prototype.hasOwnProperty.call(patch, "arrivalLocal")
    ? (() => {
        const t = patch.arrivalLocal;
        if (t == null || String(t).trim() === "") return null;
        return clamp(t, 40) || null;
      })()
    : row.arrival_local;

  if (!vehicleCode || !line) {
    return { ok: false, error: "vehicleCode et line sont requis" };
  }

  if (
    ownerEmail !== normEmail(row.owner_email) ||
    vehicleCode !== row.vehicle_code
  ) {
    const clash = db
      .prepare(
        `SELECT id FROM registered_vehicles
         WHERE owner_email = ? AND vehicle_code = ? AND id != ?`
      )
      .get(ownerEmail, vehicleCode, vid);
    if (clash) {
      return {
        ok: false,
        error: "Un véhicule avec ce code existe déjà pour ce conducteur.",
      };
    }
  }

  const now = Date.now();
  db.prepare(
    `UPDATE registered_vehicles SET
       owner_email = ?, vehicle_code = ?, line = ?, vehicle_type = ?,
       destination_label = ?, departure_local = ?, arrival_local = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    ownerEmail,
    vehicleCode,
    line,
    vehicleType,
    destinationLabel,
    departureLocal,
    arrivalLocal,
    now,
    vid
  );

  const out = db
    .prepare(
      `SELECT id, owner_email, vehicle_code, line, vehicle_type,
              destination_label, departure_local, arrival_local, updated_at
       FROM registered_vehicles WHERE id = ?`
    )
    .get(vid);
  return { ok: true, vehicle: rowToApi(out) };
}
