/**
 * Comptes conducteur / admin — MySQL, confirmation par e-mail (OTP).
 */

import { randomBytes } from "node:crypto";
import { get, query, run } from "./db.js";
import { hashPassword, verifyPassword } from "./passwordHash.js";
import {
  emailDeliveryConfigured,
  maskEmail,
  sendOtpEmail,
} from "./emailOtp.js";
import {
  generateOtp6,
  hashOtpForStore,
  maskPhone,
  verifyOtpHash,
} from "./smsOtp.js";

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const ADMIN_INVITE = String(process.env.ADMIN_INVITE_SECRET || "").trim();

const ERR_EMAIL_NOT_CONFIGURED =
  "E-mail OTP : définissez SMTP_HOST (port SMTP_USER / SMTP_PASS si besoin, EMAIL_FROM) sur le serveur, ou EMAIL_SIMULATE=1 pour les tests (code dans la réponse API / logs).";

function dbErrorMessage(e) {
  const prod =
    String(process.env.NODE_ENV || "").toLowerCase() === "production";
  if (prod) {
    return "Enregistrement impossible (base de données). Réessayez plus tard.";
  }
  const code = e?.code ? ` [${e.code}]` : "";
  return `${String(e?.message || e)}${code}`;
}

const ERR_LOGIN_UNKNOWN_USER =
  "Aucun compte avec cette adresse e-mail. Vérifiez l’orthographe ou créez un compte.";
const ERR_LOGIN_BAD_PASSWORD =
  "Mot de passe incorrect. Réessayez ou utilisez « Mot de passe oublié ».";
const ERR_LOGIN_AMBIGUOUS = "E-mail ou mot de passe incorrect";

async function purgeExpiredSessions() {
  await run("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
}

function normEmail(s) {
  return String(s || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

export function parseBearer(req) {
  const h = String(req.headers.authorization || "");
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

/** Compte prêt à la connexion : e-mail vérifié par OTP (téléphone utilisateur optionnel / héritage). */
function accountReadyForLogin(row) {
  if (!row) return false;
  const v = row.email_verified;
  if (v === true || v === 1) return true;
  if (typeof v === "bigint" && v === 1n) return true;
  if (Number.isFinite(Number(v)) && Number(v) === 1) return true;
  return String(v ?? "").trim() === "1";
}

async function issueSession(email, role) {
  const token = randomBytes(32).toString("hex");
  const exp = Date.now() + SESSION_MS;
  await run(
    "INSERT INTO sessions (token, email, role, expires_at) VALUES (?, ?, ?, ?)",
    [token, email, role, exp]
  );
  return { token, user: { email, role } };
}

/**
 * Inscription publique : conducteurs uniquement. Étape 1 : envoi du code par e-mail.
 */
export async function registerSendEmailOtp({
  email,
  password,
  phone: _phoneIgnored,
  role: _roleIgnored,
  adminInviteSecret: _inviteIgnored,
}) {
  try {
    await purgeExpiredSessions();
  } catch (e) {
    console.error("[auth/register] purge sessions:", e?.message || e);
    return { ok: false, error: dbErrorMessage(e) };
  }
  if (!emailDeliveryConfigured()) {
    return {
      ok: false,
      error: ERR_EMAIL_NOT_CONFIGURED,
      emailNotConfigured: true,
    };
  }

  const em = normEmail(email);
  if (!em || !em.includes("@")) {
    return { ok: false, error: "E-mail invalide" };
  }
  if (String(password || "").length < 6) {
    return { ok: false, error: "Mot de passe : au moins 6 caractères" };
  }
  const r = "driver";

  const passHash = hashPassword(password);
  const now = Date.now();
  const otp = generateOtp6();
  const sent = await sendOtpEmail(em, otp);
  if (!sent.ok) {
    return { ok: false, error: sent.error || "Échec envoi e-mail" };
  }

  let existing;
  try {
    existing = await get(
      "SELECT email, email_verified, phone_verified, password_hash FROM users WHERE email = ?",
      [em]
    );
  } catch (e) {
    console.error("[auth/register] SELECT user:", e?.message || e);
    return { ok: false, error: dbErrorMessage(e) };
  }

  if (existing && accountReadyForLogin(existing)) {
    return { ok: false, error: "Ce compte existe déjà. Connectez-vous." };
  }

  const tokenHash = hashOtpForStore(em, otp);
  const exp = Date.now() + OTP_TTL_MS;

  if (existing) {
    try {
      await run(
        `UPDATE users SET password_hash = ?, role = ?, phone = NULL, email_verified = 0,
         phone_verified = 0, verify_token = ?, verify_expires = ?
       WHERE email = ?`,
        [passHash, r, tokenHash, exp, em]
      );
    } catch (e) {
      console.error("[auth/register] UPDATE users:", e?.message || e);
      return {
        ok: false,
        error: dbErrorMessage(e),
      };
    }
  } else {
    try {
      await run(
        `INSERT INTO users (email, password_hash, role, created_at, email_verified, phone, phone_verified, verify_token, verify_expires)
         VALUES (?, ?, ?, ?, 0, NULL, 0, ?, ?)`,
        [em, passHash, r, now, tokenHash, exp]
      );
    } catch (e) {
      const c = String(e?.code || "");
      if (c === "ER_DUP_ENTRY") {
        return {
          ok: false,
          error: "Cette adresse e-mail est déjà utilisée.",
        };
      }
      console.error("[auth/register] INSERT users:", e?.message || e);
      return {
        ok: false,
        error: dbErrorMessage(e),
      };
    }
  }

  const out = {
    ok: true,
    needsEmailVerification: true,
    maskedEmail: maskEmail(em),
    emailSimulated: Boolean(sent.simulated),
  };
  if (sent.simulated) out.devOtp = otp;
  return out;
}

/**
 * Étape 2 : valider le code reçu par e-mail et ouvrir la session.
 */
function coerceStoredOtpHash(raw) {
  if (raw == null) return "";
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  return String(raw);
}

export async function verifyRegistrationAndLogin({ email, code }) {
  try {
    await purgeExpiredSessions();
    const em = normEmail(email);
    const row = await get(
      "SELECT email, password_hash, role, phone, phone_verified, email_verified, verify_token, verify_expires FROM users WHERE email = ?",
      [em]
    );
    if (!row) return { ok: false, error: "Compte introuvable" };
    if (accountReadyForLogin(row)) {
      return { ok: false, error: "Compte déjà vérifié. Utilisez la connexion." };
    }
    const storedHash = coerceStoredOtpHash(row.verify_token);
    const exp = Number(row.verify_expires);
    if (!storedHash || !row.verify_expires || !Number.isFinite(exp) || exp < Date.now()) {
      return {
        ok: false,
        error: "Code expiré ou absent. Réessayez l’inscription ou renvoyez un code.",
      };
    }
    const codeTrim = String(code || "").trim();
    const okOtp =
      verifyOtpHash(em, codeTrim, storedHash) ||
      (row.phone &&
        String(row.phone).trim() &&
        verifyOtpHash(row.phone, codeTrim, storedHash));
    if (!okOtp) return { ok: false, error: "Code incorrect" };
    await run(
      `UPDATE users SET email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE email = ?`,
      [em]
    );
    const role = row.role != null ? String(row.role) : "driver";
    const sess = await issueSession(row.email, role);
    return { ok: true, user: sess.user, token: sess.token };
  } catch (e) {
    console.error("[auth/verify-registration]", e?.stack || e);
    return { ok: false, error: dbErrorMessage(e), httpStatus: 500 };
  }
}

export async function registerResendOtp({ email, password }) {
  await purgeExpiredSessions();
  if (!emailDeliveryConfigured()) {
    return {
      ok: false,
      error: ERR_EMAIL_NOT_CONFIGURED,
      emailNotConfigured: true,
    };
  }
  const em = normEmail(email);
  const row = await get(
    "SELECT email, password_hash, role, phone, email_verified, phone_verified, verify_token FROM users WHERE email = ?",
    [em]
  );
  if (!row || !verifyPassword(String(password ?? ""), row.password_hash)) {
    return { ok: false, error: "E-mail ou mot de passe incorrect" };
  }
  if (accountReadyForLogin(row)) {
    return { ok: false, error: "Compte déjà vérifié." };
  }
  const otp = generateOtp6();
  const sent = await sendOtpEmail(em, otp);
  if (!sent.ok) return { ok: false, error: sent.error || "Échec envoi e-mail" };
  const tokenHash = hashOtpForStore(em, otp);
  const exp = Date.now() + OTP_TTL_MS;
  await run(
    `UPDATE users SET verify_token = ?, verify_expires = ? WHERE email = ?`,
    [tokenHash, exp, em]
  );
  const out = {
    ok: true,
    maskedEmail: maskEmail(em),
    emailSimulated: Boolean(sent.simulated),
  };
  if (sent.simulated) out.devOtp = otp;
  return out;
}

export async function requestPasswordResetOtp({ email }) {
  await purgeExpiredSessions();
  if (!emailDeliveryConfigured()) {
    return {
      ok: false,
      error: ERR_EMAIL_NOT_CONFIGURED,
      emailNotConfigured: true,
    };
  }
  const em = normEmail(email);
  if (!em) {
    return { ok: false, error: "Indiquez l’e-mail." };
  }
  const row = await get(
    "SELECT email, phone_verified, email_verified FROM users WHERE email = ?",
    [em]
  );
  if (!row || !accountReadyForLogin(row)) {
    return { ok: true, maskedEmail: null, silent: true };
  }
  const otp = generateOtp6();
  const sent = await sendOtpEmail(em, otp);
  if (!sent.ok) return { ok: false, error: sent.error || "Échec envoi e-mail" };
  const tokenHash = hashOtpForStore(em, otp);
  const exp = Date.now() + OTP_TTL_MS;
  await run(
    `UPDATE users SET verify_token = ?, verify_expires = ? WHERE email = ?`,
    [tokenHash, exp, row.email]
  );
  const out = {
    ok: true,
    maskedEmail: maskEmail(em),
    emailSimulated: Boolean(sent.simulated),
  };
  if (sent.simulated) out.devOtp = otp;
  return out;
}

export async function confirmPasswordResetWithOtp({
  email,
  phone: _phoneIgnored,
  code,
  newPassword,
}) {
  try {
    await purgeExpiredSessions();
    if (String(newPassword || "").length < 6) {
      return { ok: false, error: "Nouveau mot de passe : au moins 6 caractères" };
    }
    const em = normEmail(email);
    if (!em) {
      return { ok: false, error: "Indiquez l’e-mail." };
    }
    const row = await get(
      "SELECT email, phone, verify_token, verify_expires FROM users WHERE email = ?",
      [em]
    );
    if (!row) return { ok: false, error: "Compte introuvable" };
    const storedHash = coerceStoredOtpHash(row.verify_token);
    const exp = Number(row.verify_expires);
    if (!storedHash || !row.verify_expires || !Number.isFinite(exp) || exp < Date.now()) {
      return {
        ok: false,
        error: "Code expiré. Demandez un nouveau code par e-mail.",
      };
    }
    const codeTrim = String(code || "").trim();
    const okOtp =
      verifyOtpHash(em, codeTrim, storedHash) ||
      (row.phone &&
        String(row.phone).trim() &&
        verifyOtpHash(row.phone, codeTrim, storedHash));
    if (!okOtp) {
      return { ok: false, error: "Code incorrect" };
    }
    const passHash = hashPassword(newPassword);
    await run(
      `UPDATE users SET password_hash = ?, verify_token = NULL, verify_expires = NULL WHERE email = ?`,
      [passHash, row.email]
    );
    return { ok: true };
  } catch (e) {
    console.error("[auth/password-reset-confirm]", e?.stack || e);
    return { ok: false, error: dbErrorMessage(e), httpStatus: 500 };
  }
}

export async function createUserAsAdmin({ email, password, role }) {
  await purgeExpiredSessions();
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
  const passHash = hashPassword(password);
  const now = Date.now();
  try {
    await run(
      `INSERT INTO users (email, password_hash, role, created_at, email_verified, phone, phone_verified, verify_token, verify_expires)
       VALUES (?, ?, ?, ?, 1, NULL, 1, NULL, NULL)`,
      [em, passHash, r, now]
    );
  } catch (e) {
    const c = String(e?.code || "");
    if (c === "ER_DUP_ENTRY") {
      return { ok: false, error: "Ce compte existe déjà" };
    }
    throw e;
  }
  return { ok: true, user: { email: em, role: r, createdAt: now } };
}

export async function loginUser(email, password) {
  await purgeExpiredSessions();
  const em = normEmail(email);
  const pwd = String(password ?? "");
  if (!em.includes("@")) {
    return { ok: false, error: ERR_LOGIN_AMBIGUOUS };
  }
  const row = await get(
    "SELECT email, password_hash, role, email_verified, phone, phone_verified FROM users WHERE email = ?",
    [em]
  );
  if (!row) {
    return { ok: false, error: ERR_LOGIN_UNKNOWN_USER };
  }
  if (!verifyPassword(pwd, row.password_hash)) {
    return { ok: false, error: ERR_LOGIN_BAD_PASSWORD };
  }
  if (!accountReadyForLogin(row)) {
    return {
      ok: false,
      error:
        "Compte non vérifié. Saisissez le code reçu par e-mail (étape après inscription), ou renvoyez le code.",
      needsVerification: true,
    };
  }
  return issueSession(row.email, row.role);
}

export async function verifyToken(token) {
  await purgeExpiredSessions();
  const t = String(token || "").trim();
  if (!t) return null;
  const row = await get(
    "SELECT email, role FROM sessions WHERE token = ? AND expires_at > ?",
    [t, Date.now()]
  );
  if (!row) return null;
  return { email: row.email, role: row.role };
}

export async function logoutToken(token) {
  await run("DELETE FROM sessions WHERE token = ?", [String(token || "").trim()]);
}

export async function listUsersPublic() {
  const rows = await query(
    "SELECT email, role, email_verified, phone_verified, phone, created_at FROM users ORDER BY created_at DESC"
  );
  return rows.map((r) => ({
    email: r.email,
    role: r.role,
    emailVerified: Number(r.email_verified) === 1,
    phoneVerified: Number(r.phone_verified) === 1,
    phoneMasked: r.phone ? maskPhone(r.phone) : null,
    createdAt: r.created_at,
  }));
}

export function adminInviteConfigured() {
  return ADMIN_INVITE.length > 0;
}

export { emailDeliveryConfigured } from "./emailOtp.js";
