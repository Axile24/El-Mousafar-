import express from "express";
import cors from "cors";
import {
  buildJourneyPayload,
  buildTripSuggestions,
  featuredPlaces,
  searchPlaces,
  searchPlacesRemote,
  vehiclesInBounds,
} from "./algierApi.js";
import {
  registerUser,
  loginUser,
  verifyToken,
  logoutToken,
  parseBearer,
  listUsersPublic,
  adminInviteConfigured,
  verifyEmailWithToken,
  resendVerificationEmail,
} from "./authStore.js";
import { sendSignupConfirmation } from "./mailer.js";
import { assertFleetAccess, fleetApiKeyConfigured } from "./fleetAccess.js";
import {
  getLiveVehiclesInBounds,
  listLiveVehicles,
  upsertDriverHeartbeat,
} from "./driverStore.js";
import {
  upsertRegisteredVehicle,
  listVehiclesForOwner,
  listAllVehicles,
  deleteVehicle,
  updateVehicleById,
} from "./vehicleRegistry.js";
import { dbPath } from "./db.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    region: "Tizi Ouzou",
    app: "El Mousafar",
    database: "sqlite",
  });
});

/** Indique si l’inscription « administrateur » est possible (sans révéler le secret). */
app.get("/api/auth/registration-options", (_req, res) => {
  res.json({
    adminInviteConfigured: adminInviteConfigured(),
  });
});

app.get("/api/locations/seed", (_req, res) => {
  res.json({ results: featuredPlaces(14) });
});

app.get("/api/locations", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 1) {
    return res.json({ results: [] });
  }
  try {
    const results = await searchPlacesRemote(q, 12);
    res.json({ results });
  } catch {
    res.json({ results: searchPlaces(q, 12) });
  }
});

app.get("/api/vehicle-positions", (req, res) => {
  const lowerLeftLat = Number(req.query.lowerLeftLat);
  const lowerLeftLong = Number(req.query.lowerLeftLong);
  const upperRightLat = Number(req.query.upperRightLat);
  const upperRightLong = Number(req.query.upperRightLong);

  const bad =
    Number.isNaN(lowerLeftLat) ||
    Number.isNaN(lowerLeftLong) ||
    Number.isNaN(upperRightLat) ||
    Number.isNaN(upperRightLong);
  if (bad) {
    return res.status(400).json({
      error:
        "Indiquez lowerLeftLat, lowerLeftLong, upperRightLat, upperRightLong (nombres)",
      vehicles: [],
    });
  }

  const bounds = {
    lowerLeftLat,
    lowerLeftLong,
    upperRightLat,
    upperRightLong,
  };
  const live = getLiveVehiclesInBounds(bounds);
  const demo = vehiclesInBounds(bounds);
  res.json({ vehicles: [...live, ...demo] });
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password, role, adminInviteSecret } = req.body || {};
  const r = registerUser({ email, password, role, adminInviteSecret });
  if (!r.ok) {
    return res.status(400).json({
      error: r.error,
      ...(r.adminInviteMissingOnServer
        ? { adminInviteMissingOnServer: true }
        : {}),
    });
  }
  if (r.needsVerification) {
    try {
      await sendSignupConfirmation(r.email, r.verifyToken);
    } catch (e) {
      console.error("[mail]", e);
      return res.status(500).json({
        error:
          "Impossible d’envoyer l’e-mail de confirmation. Vérifiez SMTP ou les journaux serveur.",
      });
    }
    return res.status(201).json({
      needsVerification: true,
      email: r.email,
      message:
        "Un e-mail de confirmation a été envoyé. Ouvrez le lien pour activer le compte, puis connectez-vous.",
    });
  }
  const out = loginUser(email, password);
  if (!out.ok) {
    return res
      .status(500)
      .json({ error: "Inscription OK mais connexion impossible" });
  }
  res.json({ user: out.user, token: out.token });
});

app.post("/api/auth/verify-email", (req, res) => {
  const { token } = req.body || {};
  const r = verifyEmailWithToken(token);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, email: r.email });
});

app.post("/api/auth/resend-verification", async (req, res) => {
  const { email } = req.body || {};
  const r = resendVerificationEmail(email);
  if (!r.ok) return res.status(400).json({ error: r.error });
  try {
    await sendSignupConfirmation(r.email, r.verifyToken);
  } catch (e) {
    console.error("[mail]", e);
    return res.status(500).json({ error: "Impossible d’envoyer l’e-mail." });
  }
  res.json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const out = loginUser(email, password);
  if (!out.ok) {
    return res.status(401).json({
      error: out.error,
      ...(out.needsVerification ? { needsVerification: true } : {}),
    });
  }
  res.json({ user: out.user, token: out.token });
});

app.post("/api/auth/logout", (req, res) => {
  logoutToken(parseBearer(req));
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const u = verifyToken(parseBearer(req));
  if (!u) return res.status(401).json({ error: "Non connecté" });
  res.json({ user: u });
});

app.get("/api/admin/users", (req, res) => {
  const u = verifyToken(parseBearer(req));
  if (!u || u.role !== "admin") {
    return res.status(403).json({ error: "Administrateur uniquement" });
  }
  res.json({ users: listUsersPublic() });
});

function requireAuthUser(req, res) {
  const u = verifyToken(parseBearer(req));
  if (!u) {
    res.status(401).json({ error: "Non connecté" });
    return null;
  }
  return u;
}

/** Véhicules enregistrés (SQLite) — conducteur / admin. */
app.post("/api/vehicles", (req, res) => {
  const u = requireAuthUser(req, res);
  if (!u) return;
  if (u.role !== "driver" && u.role !== "admin") {
    return res.status(403).json({ error: "Conducteur ou administrateur requis" });
  }
  let ownerEmail = u.email;
  if (u.role === "admin") {
    const o = String(req.body?.ownerEmail || "")
      .trim()
      .toLowerCase();
    if (!o || !o.includes("@")) {
      return res.status(400).json({
        error:
          "Administrateur : indiquez ownerEmail (e-mail du conducteur propriétaire du bus).",
      });
    }
    ownerEmail = o;
  }
  const r = upsertRegisteredVehicle(ownerEmail, req.body || {});
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r.vehicle);
});

/** Mise à jour par id — conducteur (ses bus) ou administrateur (tous). */
app.put("/api/vehicles/:id", (req, res) => {
  const u = requireAuthUser(req, res);
  if (!u) return;
  if (u.role !== "driver" && u.role !== "admin") {
    return res.status(403).json({ error: "Conducteur ou administrateur requis" });
  }
  const r = updateVehicleById(req.params.id, req.body || {}, u);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r.vehicle);
});

app.get("/api/vehicles", (req, res) => {
  const u = requireAuthUser(req, res);
  if (!u) return;
  if (u.role !== "driver" && u.role !== "admin") {
    return res.status(403).json({ error: "Conducteur ou administrateur requis" });
  }
  const all = String(req.query.all || "") === "1" && u.role === "admin";
  const list = all ? listAllVehicles() : listVehiclesForOwner(u.email);
  res.json({ vehicles: list });
});

app.delete("/api/vehicles/:id", (req, res) => {
  const u = requireAuthUser(req, res);
  if (!u) return;
  const r = deleteVehicle(u.email, req.params.id, u.role === "admin");
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});

/** Flotte : position + métadonnées (compte Mon compte ou DRIVER_API_KEY). */
app.post("/api/driver/heartbeat", (req, res) => {
  if (!assertFleetAccess(req, res)) return;
  const r = upsertDriverHeartbeat(req.body || {});
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, id: r.id });
});

/** Véhicules actifs (récent), conducteur/admin ou clé API. */
app.get("/api/driver/vehicles", (req, res) => {
  if (!assertFleetAccess(req, res)) return;
  res.json({ vehicles: listLiveVehicles() });
});

app.get("/api/journey-trips", async (req, res) => {
  const originGid = req.query.originGid ? String(req.query.originGid) : "";
  const destinationGid = req.query.destinationGid
    ? String(req.query.destinationGid)
    : "";
  const originLabel = String(req.query.originLabel || "");
  const destLabel = String(req.query.destLabel || "");

  if (!originGid || !destinationGid) {
    return res
      .status(400)
      .json({ error: "originGid et destinationGid sont requis" });
  }

  try {
    const payload = await buildTripSuggestions(
      originGid,
      destinationGid,
      originLabel,
      destLabel
    );
    res.json(payload);
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

app.get("/api/journey-map", async (req, res) => {
  const originGid = req.query.originGid ? String(req.query.originGid) : "";
  const destinationGid = req.query.destinationGid
    ? String(req.query.destinationGid)
    : "";
  const originLabel = String(req.query.originLabel || "");
  const destLabel = String(req.query.destLabel || "");

  if (!originGid || !destinationGid) {
    return res
      .status(400)
      .json({ error: "originGid et destinationGid sont requis" });
  }

  try {
    const payload = await buildJourneyPayload(
      originGid,
      destinationGid,
      originLabel,
      destLabel
    );
    res.json(payload);
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`El Mousafar API (Tizi Ouzou) écoute sur le port ${PORT}`);
  console.log(`[db] SQLite : ${dbPath}`);
  if (fleetApiKeyConfigured()) {
    console.log("[fleet] DRIVER_API_KEY défini (appareils embarqués autorisés).");
  } else {
    console.warn(
      "[fleet] DRIVER_API_KEY absent : seuls les comptes conducteur/admin (Mon compte) peuvent envoyer des positions."
    );
  }
  if (!adminInviteConfigured()) {
    console.warn(
      "[auth] ADMIN_INVITE_SECRET absent : aucun compte administrateur ne peut être créé via l’inscription."
    );
  }
});
