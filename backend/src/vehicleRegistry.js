import { get, query, run } from "./db.js";

const VEHICLE_COLUMNS = `id, owner_email, vehicle_code, line, vehicle_type,
  conductor_name, conductor_aftername, route_start, route_end,
  seats_total, available, service_alert, service_note, destination_label,
  departure_local, arrival_local, updated_at`;

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

export async function upsertRegisteredVehicle(ownerEmail, v) {
  const owner = normEmail(ownerEmail);
  const vehicleCode = clamp(v.vehicleCode, 64);
  const line = clamp(v.line, 64);
  const vehicleType =
    String(v.vehicleType || "bus").toLowerCase() === "taxi" ? "taxi" : "bus";
  if (!vehicleCode || !line) {
    return { ok: false, error: "vehicleCode et line sont requis" };
  }

  const params = {
    owner,
    code: vehicleCode,
    line,
    type: vehicleType,
    cname: clamp(v.conductorName, 80) || null,
    aftername: clamp(v.conductorAftername, 80) || null,
    routeStart: clamp(v.routeStart, 160) || null,
    routeEnd: clamp(v.routeEnd, 160) || null,
    seats: intOrNull(v.seatsTotal),
    available: boolToInt(v.available),
    alert: serviceAlert(v.serviceAlert),
    note: clamp(v.serviceNote, 240) || null,
    dest: clamp(v.destinationLabel, 200) || null,
    dep: clamp(v.departureLocal, 40) || null,
    arr: clamp(v.arrivalLocal, 40) || null,
    now: Date.now(),
  };

  await run(
    `INSERT INTO registered_vehicles (
      owner_email, vehicle_code, line, vehicle_type,
      conductor_name, conductor_aftername, route_start, route_end,
      seats_total, available, service_alert, service_note,
      destination_label, departure_local, arrival_local, updated_at
    ) VALUES (
      :owner, :code, :line, :type, :cname, :aftername, :routeStart, :routeEnd,
      :seats, :available, :alert, :note, :dest, :dep, :arr, :now
    )
    ON DUPLICATE KEY UPDATE
      line = VALUES(line),
      vehicle_type = VALUES(vehicle_type),
      conductor_name = VALUES(conductor_name),
      conductor_aftername = VALUES(conductor_aftername),
      route_start = VALUES(route_start),
      route_end = VALUES(route_end),
      seats_total = VALUES(seats_total),
      available = VALUES(available),
      service_alert = VALUES(service_alert),
      service_note = VALUES(service_note),
      destination_label = VALUES(destination_label),
      departure_local = VALUES(departure_local),
      arrival_local = VALUES(arrival_local),
      updated_at = VALUES(updated_at)`,
    params
  );

  const row = await get(
    `SELECT ${VEHICLE_COLUMNS}
     FROM registered_vehicles WHERE owner_email = ? AND vehicle_code = ?`,
    [owner, vehicleCode]
  );
  return { ok: true, vehicle: rowToApi(row) };
}

export async function listVehiclesForOwner(ownerEmail) {
  const rows = await query(
    `SELECT ${VEHICLE_COLUMNS}
     FROM registered_vehicles WHERE owner_email = ?
     ORDER BY updated_at DESC`,
    [normEmail(ownerEmail)]
  );
  return rows.map(rowToApi);
}

export async function listAllVehicles() {
  const rows = await query(
    `SELECT ${VEHICLE_COLUMNS}
     FROM registered_vehicles ORDER BY updated_at DESC`
  );
  return rows.map(rowToApi);
}

export async function lineIsAvailable(line) {
  const key = String(line || "").trim();
  if (!key) return true;
  const rows = await query(
    "SELECT available FROM registered_vehicles WHERE UPPER(line) = UPPER(?)",
    [key]
  );
  if (!rows.length) return true;
  return rows.some((r) => Number(r.available) !== 0);
}

export async function getLineServiceInfo(line) {
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
  const rows = await query(
    `SELECT vehicle_code, available, service_alert, service_note, route_start, route_end,
            conductor_name, conductor_aftername, departure_local, arrival_local
     FROM registered_vehicles WHERE UPPER(line) = UPPER(?)`,
    [key]
  );
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

export async function deleteVehicle(ownerEmail, id, isAdmin) {
  const owner = normEmail(ownerEmail);
  const vid = Number(id);
  if (!Number.isFinite(vid)) return { ok: false, error: "ID invalide" };
  const row = await get("SELECT owner_email FROM registered_vehicles WHERE id = ?", [
    vid,
  ]);
  if (!row) return { ok: false, error: "Véhicule introuvable" };
  if (!isAdmin && normEmail(row.owner_email) !== owner) {
    return { ok: false, error: "Non autorisé" };
  }
  await run("DELETE FROM registered_vehicles WHERE id = ?", [vid]);
  return { ok: true };
}

export async function updateVehicleById(id, patch, actor) {
  const vid = Number(id);
  if (!Number.isFinite(vid)) return { ok: false, error: "ID invalide" };
  const row = await get(
    `SELECT ${VEHICLE_COLUMNS}
     FROM registered_vehicles WHERE id = ?`,
    [vid]
  );
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

  const values = {
    ownerEmail,
    vehicleCode,
    line: patch.line != null ? clamp(patch.line, 64) : row.line,
    vehicleType:
      patch.vehicleType != null
        ? String(patch.vehicleType || "bus").toLowerCase() === "taxi"
          ? "taxi"
          : "bus"
        : row.vehicle_type,
    conductorName: Object.prototype.hasOwnProperty.call(patch, "conductorName")
      ? clamp(patch.conductorName, 80) || null
      : row.conductor_name,
    conductorAftername: Object.prototype.hasOwnProperty.call(
      patch,
      "conductorAftername"
    )
      ? clamp(patch.conductorAftername, 80) || null
      : row.conductor_aftername,
    routeStart: Object.prototype.hasOwnProperty.call(patch, "routeStart")
      ? clamp(patch.routeStart, 160) || null
      : row.route_start,
    routeEnd: Object.prototype.hasOwnProperty.call(patch, "routeEnd")
      ? clamp(patch.routeEnd, 160) || null
      : row.route_end,
    seatsTotal: Object.prototype.hasOwnProperty.call(patch, "seatsTotal")
      ? intOrNull(patch.seatsTotal)
      : row.seats_total,
    available: Object.prototype.hasOwnProperty.call(patch, "available")
      ? boolToInt(patch.available)
      : row.available,
    alert: Object.prototype.hasOwnProperty.call(patch, "serviceAlert")
      ? serviceAlert(patch.serviceAlert)
      : serviceAlert(row.service_alert),
    serviceNote: Object.prototype.hasOwnProperty.call(patch, "serviceNote")
      ? clamp(patch.serviceNote, 240) || null
      : row.service_note,
    destinationLabel: Object.prototype.hasOwnProperty.call(
      patch,
      "destinationLabel"
    )
      ? clamp(patch.destinationLabel, 200) || null
      : row.destination_label,
    departureLocal: Object.prototype.hasOwnProperty.call(patch, "departureLocal")
      ? clamp(patch.departureLocal, 40) || null
      : row.departure_local,
    arrivalLocal: Object.prototype.hasOwnProperty.call(patch, "arrivalLocal")
      ? clamp(patch.arrivalLocal, 40) || null
      : row.arrival_local,
    now: Date.now(),
    id: vid,
  };

  if (!values.vehicleCode || !values.line) {
    return { ok: false, error: "vehicleCode et line sont requis" };
  }

  if (
    values.ownerEmail !== normEmail(row.owner_email) ||
    values.vehicleCode !== row.vehicle_code
  ) {
    const clash = await get(
      `SELECT id FROM registered_vehicles
       WHERE owner_email = ? AND vehicle_code = ? AND id != ?`,
      [values.ownerEmail, values.vehicleCode, vid]
    );
    if (clash) {
      return {
        ok: false,
        error: "Un véhicule avec ce code existe déjà pour ce conducteur.",
      };
    }
  }

  await run(
    `UPDATE registered_vehicles SET
       owner_email = :ownerEmail,
       vehicle_code = :vehicleCode,
       line = :line,
       vehicle_type = :vehicleType,
       conductor_name = :conductorName,
       conductor_aftername = :conductorAftername,
       route_start = :routeStart,
       route_end = :routeEnd,
       seats_total = :seatsTotal,
       available = :available,
       service_alert = :alert,
       service_note = :serviceNote,
       destination_label = :destinationLabel,
       departure_local = :departureLocal,
       arrival_local = :arrivalLocal,
       updated_at = :now
     WHERE id = :id`,
    values
  );

  const out = await get(
    `SELECT ${VEHICLE_COLUMNS}
     FROM registered_vehicles WHERE id = ?`,
    [vid]
  );
  return { ok: true, vehicle: rowToApi(out) };
}
