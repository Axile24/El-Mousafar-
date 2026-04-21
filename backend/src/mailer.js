/**
 * E-mail de confirmation (optionnel via SMTP).
 * Variables : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, PUBLIC_APP_URL
 */

import nodemailer from "nodemailer";

function smtpConfigured() {
  return Boolean(
    String(process.env.SMTP_HOST || "").trim() &&
      String(process.env.SMTP_FROM || "").trim()
  );
}

function appBaseUrl() {
  return String(process.env.PUBLIC_APP_URL || "http://localhost:5173").replace(
    /\/$/,
    ""
  );
}

export function buildConfirmUrl(token) {
  return `${appBaseUrl()}/#/compte?v=${encodeURIComponent(token)}`;
}

/**
 * @param {string} toEmail
 * @param {string} verifyToken
 * @returns {Promise<{ sent: boolean }>}
 */
export async function sendSignupConfirmation(toEmail, verifyToken) {
  const url = buildConfirmUrl(verifyToken);
  const subject = "El Mousafar — confirmez votre adresse e-mail";
  const text = `Bonjour,\n\nPour activer votre compte conducteur, ouvrez ce lien dans votre navigateur :\n\n${url}\n\nSi vous n’avez pas créé de compte, ignorez ce message.\n`;
  const html = `<p>Bonjour,</p><p>Pour activer votre compte conducteur, cliquez sur le lien ci-dessous :</p><p><a href="${url}">Confirmer mon e-mail</a></p><p style="font-size:12px;color:#666">${url}</p>`;

  if (!smtpConfigured()) {
    console.warn(`[mail] SMTP non configuré — lien de confirmation pour ${toEmail} :\n${url}`);
    return { sent: false };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || "587"),
    secure: String(process.env.SMTP_SECURE || "") === "true",
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: toEmail,
    subject,
    text,
    html,
  });
  return { sent: true };
}
