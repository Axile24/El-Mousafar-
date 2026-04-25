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

function intOrNull(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function boolToInt(v) {
  return v === false || v === "false" || v === 0 || v === "0" ? 0 : 1;
}

function serviceAlert(v) {
  const value = String(v || "ok").trim().toLowerCase();
  return ["ok", "info", "delay", "issue", "cancelled"].includes(value)
    ? value
    : "ok";
}

function alertPriority(alert) {
  return { cancelled: 4, issue: 3, delay: 2, info: 1, ok: 0 }[alert] || 0;
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
  const conductorName = clamp(v.conductorName, 80) || null;
  const conductorAftername = clamp(v.conductorAftername, 80) || null;
  const routeStart = clamp(v.routeStart, 160) || null;
  const routeEnd = clamp(v.routeEnd, 160) || null;
  const seatsTotal = intOrNull(v.seatsTotal);
  const available = boolToInt(v.available);
  const alert = serviceAlert(v.serviceAlert);
  const serviceNote = clamp(v.serviceNote, 240) || null;
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO registered_vehicles (
      owner_email, vehicle_code, line, vehicle_type,
      conductor_name, conductor_aftername, route_start, route_end, seats_total, available, service_alert, service_note,
      destination_label, departure_local, arrival_local, updated_at
    ) VALUES (@owner, @code, @line, @type, @cname, @aftername, @routeStart, @routeEnd, @seats, @available, @alert, @note, @dest, @dep, @arr, @now)
    ON CONFLICT(owner_email, vehicle_code) DO UPDATE SET
      line = excluded.line,
      vehicle_type = excluded.vehicle_type,
      conductor_name = excluded.conductor_name,
      conductor_aftername = excluded.conductor_aftername,
      route_start = excluded.route_start,
      route_end = excluded.route_end,
      seats_total = excluded.seats_total,
      available = excluded.available,
      service_alert = excluded.service_alert,
      service_note = excluded.service_note,
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
    cname: conductorName,
    aftername: conductorAftername,
    routeStart,
    routeEnd,
    seats: seatsTotal,
    available,
    alert,
    note: serviceNote,
    dest: destinationLabel,
    dep: departureLocal,
    arr: arrivalLocal,
    now,
  });

  const row = db
    .prepare(
      `SELECT id, owner_email, vehicle_code, line, vehicle_type,
              conductor_name, conductor_aftername, route_start, route_end,
              seats_total, available, service_alert, service_note, destination_label, departure_local,
              arrival_local, updated_at
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
    conductorName: row.conductor_name,
    conductorAftername: row.conductor_aftername,
    routeStart: row.route_start,
    routeEnd: row.route_end,
    seatsTotal: row.seats_total,
    available: Number(row.available) !== 0,
    serviceAlert: serviceAlert(row.service_alert),
    serviceNote: row.service_note,
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
              conductor_name, conductor_aftername, route_start, route_end,
              seats_total, available, service_alert, service_note, destination_label, departure_local,
              arrival_local, updated_at
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
              conductor_name, conductor_aftername, route_start, route_end,
              seats_total, available, service_alert, service_note, destination_label, departure_local,
              arrival_local, updated_at
       FROM registered_vehicles ORDER BY updated_at DESC`
    )
    .all();
  return rows.map(rowToApi);
}

export function lineIsAvailable(line) {
  const key = String(line || "").trim();
  if (!key) return true;
  const rows = db
    .prepare("SELECT available FROM registered_vehicles WHERE upper(line) = upper(?)")
    .all(key);
  // Unknown/demo-only lines stay visible. Registered lines freeze when all buses are unavailable.
  if (!rows.length) return true;
  return rows.some((r) => Number(r.available) !== 0);
}

export function getLineServiceInfo(line) {
  const key = String(line || "").trim();
  if (!key) {
    return {
      line: "",
      registered: false,
      available: true,
      busCount: 0,
      activeCount: 0,
      serviceAlert: "ok",
      serviceNote: "",
      buses: [],
    };
  }
  const rows = db
    .prepare(
      `SELECT vehicle_code, available, service_alert, service_note, route_start, route_end,
              conductor_name, conductor_aftername, departure_local, arrival_local
       FROM registered_vehicles WHERE upper(line) = upper(?)`
    )
    .all(key);
  if (!rows.length) {
    return {
      line: key.toUpperCase(),
      registered: false,
      available: true,
      busCount: 0,
      activeCount: 0,
      serviceAlert: "ok",
      serviceNote: "",
      buses: [],
    };
  }
  const activeCount = rows.filter((r) => Number(r.available) !== 0).length;
  const strongest = rows
    .map((r) => serviceAlert(r.service_alert))
    .sort((a, b) => alertPriority(b) - alertPriority(a))[0];
  const notes = rows.map((r) => clamp(r.service_note, 240)).filter(Boolean);
  return {
    line: key.toUpperCase(),
    registered: true,
    available: activeCount > 0,
    busCount: rows.length,
    activeCount,
    serviceAlert: activeCount > 0 ? strongest : "cancelled",
    serviceNote:
      activeCount > 0
        ? notes[0] || ""
        : notes[0] || "Bus non disponible pour le moment.",
    buses: rows.map((r) => ({
      vehicleCode: r.vehicle_code,
      available: Number(r.available) !== 0,
      serviceAlert: serviceAlert(r.service_alert),
      serviceNote: r.service_note,
      routeStart: r.route_start,
      routeEnd: r.route_end,
      conductorName: r.conductor_name,
      conductorAftername: r.conductor_aftername,
      departureLocal: r.departure_local,
      arrivalLocal: r.arrival_local,
    })),
  };
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
              conductor_name, conductor_aftername, route_start, route_end,
              seats_total, available, service_alert, service_note, destination_label, departure_local,
              arrival_local, updated_at
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
  const conductorName = Object.prototype.hasOwnProperty.call(patch, "conductorName")
    ? clamp(patch.conductorName, 80) || null
    : row.conductor_name;
  const conductorAftername = Object.prototype.hasOwnProperty.call(
    patch,
    "conductorAftername"
  )
    ? clamp(patch.conductorAftername, 80) || null
    : row.conductor_aftername;
  const routeStart = Object.prototype.hasOwnProperty.call(patch, "routeStart")
    ? clamp(patch.routeStart, 160) || null
    : row.route_start;
  const routeEnd = Object.prototype.hasOwnProperty.call(patch, "routeEnd")
    ? clamp(patch.routeEnd, 160) || null
    : row.route_end;
  const seatsTotal = Object.prototype.hasOwnProperty.call(patch, "seatsTotal")
    ? intOrNull(patch.seatsTotal)
    : row.seats_total;
  const available = Object.prototype.hasOwnProperty.call(patch, "available")
    ? boolToInt(patch.available)
    : row.available;
  const alert = Object.prototype.hasOwnProperty.call(patch, "serviceAlert")
    ? serviceAlert(patch.serviceAlert)
    : serviceAlert(row.service_alert);
  const serviceNote = Object.prototype.hasOwnProperty.call(patch, "serviceNote")
    ? clamp(patch.serviceNote, 240) || null
    : row.service_note;
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
       conductor_name = ?, conductor_aftername = ?, route_start = ?, route_end = ?,
       seats_total = ?, available = ?, service_alert = ?, service_note = ?, destination_label = ?, departure_local = ?,
       arrival_local = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    ownerEmail,
    vehicleCode,
    line,
    vehicleType,
    conductorName,
    conductorAftername,
    routeStart,
    routeEnd,
    seatsTotal,
    available,
    alert,
    serviceNote,
    destinationLabel,
    departureLocal,
    arrivalLocal,
    now,
    vid
  );

  const out = db
    .prepare(
      `SELECT id, owner_email, vehicle_code, line, vehicle_type,
              conductor_name, conductor_aftername, route_start, route_end,
              seats_total, available, service_alert, service_note, destination_label, departure_local,
              arrival_local, updated_at
       FROM registered_vehicles WHERE id = ?`
    )
    .get(vid);
  return { ok: true, vehicle: rowToApi(out) };
}
