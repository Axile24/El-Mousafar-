/**
 * In-memory store for buses that POST heartbeats (MVP).
 * Replace with Redis/DB for multi-instance production.
 */

const vehicles = new Map();

/** Drop heartbeats older than this (ms). */
const STALE_MS = 2 * 60 * 1000;

function clampStr(s, max) {
  const t = String(s ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * @param {object} body
 * @param {string} body.vehicleId
 * @param {string} body.line
 * @param {number} body.lat
 * @param {number} body.lon
 * @param {string} [body.destinationLabel]
 * @param {string} [body.departureAt] ISO 8601
 * @param {string} [body.arrivalAt] ISO 8601
 * @param {string} [body.vehicleType] bus | taxi
 * @param {boolean} [body.available] disponible pour course
 */
export function upsertDriverHeartbeat(body) {
  const vehicleId = clampStr(body.vehicleId, 64);
  const line = clampStr(body.line, 16);
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!vehicleId || !line) {
    return { ok: false, error: "vehicleId et line sont requis" };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, error: "lat et lon doivent être des nombres valides" };
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { ok: false, error: "lat/lon hors limites" };
  }

  const vtRaw = String(body.vehicleType || "bus").toLowerCase();
  const vehicleType = vtRaw === "taxi" ? "taxi" : "bus";
  const available = body.available !== false && body.available !== "false";

  const id = `live-${vehicleId.replace(/[^a-zA-Z0-9_-]/g, "") || "bus"}`;
  const destinationLabel = clampStr(body.destinationLabel, 120);
  const departureAt = clampStr(body.departureAt, 40);
  const arrivalAt = clampStr(body.arrivalAt, 40);

  const row = {
    id,
    vehicleId,
    vehicleType,
    available,
    line,
    lat,
    lon,
    destinationLabel: destinationLabel || undefined,
    departureAt: departureAt || undefined,
    arrivalAt: arrivalAt || undefined,
    updatedAt: Date.now(),
    source: "driver",
  };
  vehicles.set(id, row);
  return { ok: true, id };
}

function isFresh(row) {
  return Date.now() - row.updatedAt < STALE_MS;
}

function inBounds(row, b) {
  const { lowerLeftLat, lowerLeftLong, upperRightLat, upperRightLong } = b;
  const latOk =
    row.lat >= Math.min(lowerLeftLat, upperRightLat) &&
    row.lat <= Math.max(lowerLeftLat, upperRightLat);
  const lonOk =
    row.lon >= Math.min(lowerLeftLong, upperRightLong) &&
    row.lon <= Math.max(lowerLeftLong, upperRightLong);
  return latOk && lonOk;
}

export function getLiveVehiclesInBounds(bounds) {
  const out = [];
  for (const row of vehicles.values()) {
    if (!isFresh(row)) continue;
    if (!inBounds(row, bounds)) continue;
    out.push({
      id: row.id,
      lat: row.lat,
      lon: row.lon,
      line: row.line,
      vehicleType: row.vehicleType || "bus",
      available: row.available !== false,
      destinationLabel: row.destinationLabel,
      departureAt: row.departureAt,
      arrivalAt: row.arrivalAt,
      vehicleId: row.vehicleId,
      source: "driver",
    });
  }
  return out;
}

export function listLiveVehicles() {
  const out = [];
  for (const row of vehicles.values()) {
    if (!isFresh(row)) continue;
    out.push({ ...row });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}
