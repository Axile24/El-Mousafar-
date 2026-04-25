/**
 * Accès aux endpoints flotte : session conducteur/admin ou DRIVER_API_KEY.
 */

import { verifyToken, parseBearer } from "./authStore.js";

const FLEET_API_KEY = String(process.env.DRIVER_API_KEY || "").trim();

export function fleetApiKeyConfigured() {
  return FLEET_API_KEY.length > 0;
}

export function assertFleetAccess(req, res) {
  if (!FLEET_API_KEY) return true;
  const bearer = parseBearer(req);
  const headerKey = String(req.headers["x-driver-api-key"] || "").trim();

  if (bearer) {
    const user = verifyToken(bearer);
    if (user && (user.role === "driver" || user.role === "admin")) {
      return true;
    }
    if (FLEET_API_KEY && bearer === FLEET_API_KEY) {
      return true;
    }
    if (FLEET_API_KEY && headerKey === FLEET_API_KEY) {
      return true;
    }
    res.status(401).json({
      error:
        "Connexion requise : utilisez un compte conducteur ou administrateur (Mon compte), ou la clé API flotte (DRIVER_API_KEY).",
    });
    return false;
  }
  if (headerKey && FLEET_API_KEY && headerKey === FLEET_API_KEY) {
    return true;
  }
  res.status(401).json({
    error:
      "Connexion requise : créez un compte conducteur ou administrateur via Mon compte, ou configurez DRIVER_API_KEY pour les appareils embarqués.",
  });
  return false;
}
