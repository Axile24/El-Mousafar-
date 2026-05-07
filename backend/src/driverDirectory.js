import { get, query, run } from "./db.js";

const COLS = `id, name, aftername, line, license_number, phone, notes, created_at, updated_at`;

function clamp(s, max) {
  const t = String(s ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

function rowToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    aftername: row.aftername || "",
    line: row.line || "",
    licenseNumber: row.license_number || "",
    phone: row.phone || "",
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDrivers() {
  const rows = await query(
    `SELECT ${COLS} FROM drivers ORDER BY name ASC, aftername ASC, id ASC`
  );
  return rows.map(rowToApi);
}

export async function createDriver(body) {
  const name = clamp(body?.name, 80);
  if (!name) return { ok: false, error: "Le nom du conducteur est requis" };
  const aftername = clamp(body?.aftername, 80) || null;
  const line = clamp(body?.line, 64) || null;
  const licenseNumber = clamp(body?.licenseNumber, 64) || null;
  const phone = clamp(body?.phone, 40) || null;
  const notes = clamp(body?.notes, 240) || null;
  const now = Date.now();
  const r = await run(
    `INSERT INTO drivers (name, aftername, line, license_number, phone, notes, created_at, updated_at)
     VALUES (:name, :aftername, :line, :licenseNumber, :phone, :notes, :now, :now)`,
    { name, aftername, line, licenseNumber, phone, notes, now }
  );
  const id = r.insertId;
  const row = await get(`SELECT ${COLS} FROM drivers WHERE id = ?`, [id]);
  return { ok: true, driver: rowToApi(row) };
}

export async function updateDriver(id, body) {
  const vid = Number(id);
  if (!Number.isFinite(vid)) return { ok: false, error: "ID invalide" };
  const existing = await get(`SELECT ${COLS} FROM drivers WHERE id = ?`, [vid]);
  if (!existing) return { ok: false, error: "Conducteur introuvable" };

  const name =
    body?.name != null ? clamp(body.name, 80) : existing.name;
  if (!name) return { ok: false, error: "Le nom du conducteur est requis" };
  const aftername =
    body?.aftername != null
      ? clamp(body.aftername, 80) || null
      : existing.aftername;
  const line =
    body?.line != null ? clamp(body.line, 64) || null : existing.line;
  const licenseNumber =
    body?.licenseNumber != null
      ? clamp(body.licenseNumber, 64) || null
      : existing.license_number;
  const phone =
    body?.phone != null ? clamp(body.phone, 40) || null : existing.phone;
  const notes =
    body?.notes != null ? clamp(body.notes, 240) || null : existing.notes;
  const now = Date.now();

  await run(
    `UPDATE drivers SET
       name = :name,
       aftername = :aftername,
       line = :line,
       license_number = :licenseNumber,
       phone = :phone,
       notes = :notes,
       updated_at = :now
     WHERE id = :id`,
    { name, aftername, line, licenseNumber, phone, notes, now, id: vid }
  );
  const row = await get(`SELECT ${COLS} FROM drivers WHERE id = ?`, [vid]);
  return { ok: true, driver: rowToApi(row) };
}

export async function deleteDriver(id) {
  const vid = Number(id);
  if (!Number.isFinite(vid)) return { ok: false, error: "ID invalide" };
  const r = await run(`DELETE FROM drivers WHERE id = ?`, [vid]);
  if (r.affectedRows === 0) return { ok: false, error: "Conducteur introuvable" };
  return { ok: true };
}
