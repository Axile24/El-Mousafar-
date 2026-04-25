import "./loadEnv.js";
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
} from "./authStore.js";
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
  lineIsAvailable,
  getLineServiceInfo,
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
  const byLine = new Map();
  for (const v of [...demo, ...live]) {
    const key = String(v.line || v.vehicleId || v.id || "").trim().toUpperCase();
    if (!key) continue;
    if (!lineIsAvailable(key)) continue;
    // Live GPS is appended after demo, so it replaces the demo vehicle for that line.
    byLine.set(key, v);
  }
  res.json({ vehicles: [...byLine.values()] });
});

app.post("/api/auth/register", (req, res) => {
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
  const out = loginUser(email, password);
  if (!out.ok) {
    return res
      .status(500)
      .json({ error: "Inscription OK mais connexion impossible" });
  }
  res.json({ user: out.user, token: out.token });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const out = loginUser(email, password);
  if (!out.ok) {
    return res.status(401).json({
      error: out.error,
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
  const ownerEmail =
    String(req.body?.ownerEmail || "").trim().toLowerCase() ||
    `${String(req.body?.conductorName || "conducteur").trim().toLowerCase()}.${String(
      req.body?.conductorAftername || "bus"
    )
      .trim()
      .toLowerCase()}@local`;
  const r = upsertRegisteredVehicle(ownerEmail, req.body || {});
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r.vehicle);
});

/** Mise à jour par id — conducteur (ses bus) ou administrateur (tous). */
app.put("/api/vehicles/:id", (req, res) => {
  const r = updateVehicleById(req.params.id, req.body || {}, {
    email: String(req.body?.ownerEmail || "admin@local"),
    role: "admin",
  });
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r.vehicle);
});

app.get("/api/vehicles", (req, res) => {
  const conductorKey = String(req.query.conductorKey || "").trim().toLowerCase();
  const list = conductorKey ? listVehiclesForOwner(conductorKey) : listAllVehicles();
  res.json({ vehicles: list });
});

app.get("/api/bus-service-info", (req, res) => {
  const lines = String(req.query.lines || "")
    .split(",")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length) {
    return res.json({ lines: lines.map(getLineServiceInfo) });
  }
  const seen = new Set();
  const infos = [];
  for (const v of listAllVehicles()) {
    const line = String(v.line || "").trim().toUpperCase();
    if (!line || seen.has(line)) continue;
    seen.add(line);
    infos.push(getLineServiceInfo(line));
  }
  res.json({ lines: infos.sort((a, b) => a.line.localeCompare(b.line)) });
});

app.delete("/api/vehicles/:id", (req, res) => {
  const r = deleteVehicle("admin@local", req.params.id, true);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});

/** Flotte : position + métadonnées (compte Mon compte ou DRIVER_API_KEY). */
app.post("/api/driver/heartbeat", (req, res) => {
  if (!assertFleetAccess(req, res)) return;
  if (!lineIsAvailable(req.body?.line)) {
    return res.status(409).json({
      error: "Ligne gelée : elle est marquée non disponible par l’administrateur.",
    });
  }
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
    payload.trips = (payload.trips || []).map((trip) => {
      const busLines = [
        ...new Set(
          (trip.legs || [])
            .filter((leg) => leg.mode === "bus" && leg.line)
            .map((leg) => String(leg.line).trim().toUpperCase())
        ),
      ];
      const unavailableLines = busLines.filter((line) => !lineIsAvailable(line));
      const serviceInfos = busLines.map(getLineServiceInfo);
      const issueInfos = serviceInfos.filter(
        (info) => !info.available || info.serviceAlert !== "ok" || info.serviceNote
      );
      return {
        ...trip,
        busLines,
        serviceAvailable: unavailableLines.length === 0,
        unavailableLines,
        serviceInfos,
        serviceAlert: issueInfos[0]?.serviceAlert || "ok",
        serviceNote: issueInfos[0]?.serviceNote || "",
      };
    });
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
