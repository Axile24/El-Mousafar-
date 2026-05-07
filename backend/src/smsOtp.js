import { createHmac, randomInt } from "node:crypto";

const PEPPER = String(process.env.SMS_OTP_PEPPER || "change-me-in-production").trim();

/**
 * E.164 pour SMS mondiaux (Twilio, etc.) : + puis 8–15 chiffres nationaux.
 * - « 00 » → « + »
 * - Si le numéro commence déjà par « + », validation stricte.
 * - Sinon : si PHONE_DEFAULT_COUNTRY_CODE est défini (ex. +213 Algérie, +46 Suède),
 *   les chiffres saisis sont interprétés comme numéro national (0 initial retiré si présent).
 */
export function normPhone(raw) {
  const defaultCc = String(process.env.PHONE_DEFAULT_COUNTRY_CODE || "")
    .trim()
    .replace(/\s/g, "");
  let s = String(raw || "").trim().replace(/[\s.-]/g, "");
  if (!s) return "";
  if (s.startsWith("00")) s = `+${s.slice(2)}`;

  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return "";
    return `+${digits}`;
  }

  if (!defaultCc.startsWith("+")) return "";

  const ccDigits = defaultCc.slice(1).replace(/\D/g, "");
  if (!ccDigits.length) return "";

  let local = s.replace(/\D/g, "");
  if (!local.length) return "";
  if (local.startsWith("0")) local = local.slice(1);
  if (!local.length) return "";

  if (local.startsWith(ccDigits)) {
    local = local.slice(ccDigits.length);
  }
  if (!local.length) return "";

  const full = ccDigits + local;
  if (full.length < 8 || full.length > 15) return "";
  return `+${full}`;
}

export function maskPhone(p) {
  const t = String(p || "");
  if (t.length < 5) return "—";
  return `${t.slice(0, 3)}···${t.slice(-2)}`;
}

export function generateOtp6() {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

export function hashOtpForStore(phone, code) {
  return createHmac("sha256", PEPPER)
    .update(`${phone}|${String(code).trim()}`)
    .digest("hex");
}

export function verifyOtpHash(phone, code, storedHash) {
  return hashOtpForStore(phone, code) === String(storedHash || "");
}

/** Vrai envoi SMS uniquement avec Twilio complet ; sinon SMS_SIMULATE=1 pour les tests sans opérateur. */
export function smsDeliveryConfigured() {
  const sim = String(process.env.SMS_SIMULATE || "").toLowerCase() === "1";
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(process.env.TWILIO_FROM_NUMBER || "").trim();
  return sim || (Boolean(sid) && Boolean(token) && Boolean(from));
}

/**
 * @returns {Promise<{ ok: true, simulated?: boolean } | { ok: false, error: string }>}
 */
export async function sendOtpSms(phone, code) {
  const body = `El Mousafar : code ${code}. Valable 10 minutes.`;
  const sim = String(process.env.SMS_SIMULATE || "").toLowerCase() === "1";
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(process.env.TWILIO_FROM_NUMBER || "").trim();

  if (sim) {
    console.info(`[sms/simulate] ${phone} — ${body}`);
    return { ok: true, simulated: true };
  }

  if (!sid || !token || !from) {
    return {
      ok: false,
      error:
        "Envoi SMS réel impossible : renseignez TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_FROM_NUMBER, ou SMS_SIMULATE=1 pour les tests.",
    };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const formBody = new URLSearchParams({ To: phone, From: from, Body: body });
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });
  } catch (e) {
    console.error("[sms] Twilio (réseau):", e?.message || e);
    return {
      ok: false,
      error: `Impossible de joindre Twilio : ${String(e?.message || e)}`,
    };
  }
  if (!res.ok) {
    const txt = await res.text();
    try {
      const j = JSON.parse(txt);
      const msg = [j.message, j.code && `(${j.code})`].filter(Boolean).join(" ");
      return {
        ok: false,
        error: msg || txt.slice(0, 280),
      };
    } catch {
      return { ok: false, error: txt.slice(0, 280) };
    }
  }
  return { ok: true };
}
