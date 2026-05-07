import nodemailer from "nodemailer";

/**
 * Envoi d’OTP par e-mail (SMTP). Sans SMTP : EMAIL_SIMULATE=1 pour le dev (log + devOtp).
 */
export function maskEmail(em) {
  const s = String(em || "").trim();
  const at = s.indexOf("@");
  if (at < 1) return "—";
  const local = s.slice(0, at);
  const dom = s.slice(at + 1);
  if (!dom) return "—";
  const show = local.slice(0, Math.min(2, local.length));
  return `${show}···@${dom}`;
}

export function emailDeliveryConfigured() {
  const sim = String(process.env.EMAIL_SIMULATE || "").toLowerCase() === "1";
  const host = String(process.env.SMTP_HOST || "").trim();
  return sim || Boolean(host);
}

/**
 * @returns {Promise<{ ok: true, simulated?: boolean } | { ok: false, error: string }>}
 */
export async function sendOtpEmail(toEmail, code) {
  const subject = "El Mousafar — code de confirmation";
  const text = `Votre code El Mousafar : ${code}. Valide 10 minutes. Ne partagez pas ce code.`;
  const sim = String(process.env.EMAIL_SIMULATE || "").toLowerCase() === "1";
  const host = String(process.env.SMTP_HOST || "").trim();

  if (sim) {
    console.info(`[email/simulate] → ${toEmail} — ${text}`);
    return { ok: true, simulated: true };
  }

  if (!host) {
    return {
      ok: false,
      error:
        "E-mail non configuré : définissez SMTP_HOST (et compte SMTP), ou EMAIL_SIMULATE=1 pour les tests.",
    };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    String(process.env.SMTP_SECURE || "").toLowerCase() === "true" ||
    port === 465;
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const from = String(
    process.env.EMAIL_FROM || user || "noreply@localhost"
  ).trim();

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass } } : {}),
    });
    await transport.sendMail({
      from,
      to: toEmail,
      subject,
      text,
    });
    return { ok: true };
  } catch (e) {
    console.error("[email] envoi:", e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}
