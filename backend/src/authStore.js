/**
 * Comptes conducteur / admin — SQLite.
 * Conducteurs et admins : compte actif dès l’inscription (pas de confirmation e-mail).
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_INVITE = String(process.env.ADMIN_INVITE_SECRET || "").trim();

function purgeExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

function normEmail(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(plain), salt, 64);
  return Buffer.concat([salt, hash]).toString("base64");
}

function verifyPassword(plain, storedB64) {
  try {
    const buf = Buffer.from(storedB64, "base64");
    if (buf.length < 17) return false;
    const salt = buf.subarray(0, 16);
    const expected = buf.subarray(16);
    const actual = scryptSync(String(plain), salt, 64);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

export function parseBearer(req) {
  const h = String(req.headers.authorization || "");
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

/** @returns {{ ok: true } | { ok: false, error: string, adminInviteMissingOnServer?: boolean }} */
export function registerUser({ email, password, role, adminInviteSecret }) {
  purgeExpiredSessions();
  const em = normEmail(email);
  if (!em || !em.includes("@")) {
    return { ok: false, error: "E-mail invalide" };
  }
  if (String(password || "").length < 6) {
    return { ok: false, error: "Mot de passe : au moins 6 caractères" };
  }
  const r = String(role || "").toLowerCase();
  if (r !== "driver" && r !== "admin") {
    return {
      ok: false,
      error: "Rôle invalide : seuls conducteur et administrateur sont autorisés",
    };
  }
  if (r === "admin") {
    const invite = String(adminInviteSecret ?? "").trim();
    if (!ADMIN_INVITE) {
      return {
        ok: false,
        error:
          "Inscription administrateur désactivée : le serveur n’a pas de code d’invitation (variable ADMIN_INVITE_SECRET).",
        adminInviteMissingOnServer: true,
      };
    }
    if (invite !== ADMIN_INVITE) {
      return {
        ok: false,
        error:
          "Code d’invitation incorrect. Il doit être identique à ADMIN_INVITE_SECRET sur le serveur (même majuscules/minuscules).",
      };
    }
  }

  const passHash = hashPassword(password);
  const now = Date.now();

  if (r === "admin") {
    try {
      db.prepare(
        `INSERT INTO users (email, password_hash, role, created_at, email_verified, verify_token, verify_expires)
         VALUES (?, ?, ?, ?, 1, NULL, NULL)`
      ).run(em, passHash, r, now);
    } catch (e) {
      const c = String(e?.code || "");
      if (
        c === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
        c === "SQLITE_CONSTRAINT_UNIQUE"
      ) {
        return { ok: false, error: "Ce compte existe déjà" };
      }
      throw e;
    }
    return { ok: true };
  }

  try {
    db.prepare(
      `INSERT INTO users (email, password_hash, role, created_at, email_verified, verify_token, verify_expires)
       VALUES (?, ?, ?, ?, 1, NULL, NULL)`
    ).run(em, passHash, r, now);
  } catch (e) {
    const c = String(e?.code || "");
    if (
      c === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
      c === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return { ok: false, error: "Ce compte existe déjà" };
    }
    throw e;
  }
  return { ok: true };
}

export function loginUser(email, password) {
  purgeExpiredSessions();
  const em = normEmail(email);
  const row = db
    .prepare(
      "SELECT email, password_hash, role, email_verified FROM users WHERE email = ?"
    )
    .get(em);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return { ok: false, error: "E-mail ou mot de passe incorrect" };
  }
  const token = randomBytes(32).toString("hex");
  const exp = Date.now() + SESSION_MS;
  db.prepare(
    "INSERT INTO sessions (token, email, role, expires_at) VALUES (?, ?, ?, ?)"
  ).run(token, row.email, row.role, exp);
  return {
    ok: true,
    token,
    user: { email: row.email, role: row.role },
  };
}

export function verifyToken(token) {
  purgeExpiredSessions();
  const t = String(token || "").trim();
  if (!t) return null;
  const row = db
    .prepare(
      "SELECT email, role FROM sessions WHERE token = ? AND expires_at > ?"
    )
    .get(t, Date.now());
  if (!row) return null;
  return { email: row.email, role: row.role };
}

export function logoutToken(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(
    String(token || "").trim()
  );
}

export function listUsersPublic() {
  return db
    .prepare(
      "SELECT email, role, email_verified, created_at FROM users ORDER BY created_at DESC"
    )
    .all()
    .map((r) => ({
      email: r.email,
      role: r.role,
      emailVerified: Number(r.email_verified) === 1,
      createdAt: r.created_at,
    }));
}

export function adminInviteConfigured() {
  return ADMIN_INVITE.length > 0;
}
