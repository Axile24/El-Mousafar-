import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "./apiBase.js";
import { readAuthToken } from "./authSession.js";

const LS_KEY = "el-mousafar-driver-api-key";

function readStoredKey() {
  try {
    return String(localStorage.getItem(LS_KEY) || "").trim();
  } catch {
    return "";
  }
}

function toIsoMaybe(s) {
  if (!s || !String(s).trim()) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/**
 * Mise à jour de position (GPS / flotte) — dans Mon compte uniquement.
 */
export default function ConducteurPanel() {
  const [vehicleId, setVehicleId] = useState("BUS-01");
  const [vehicleType, setVehicleType] = useState("bus");
  const [available, setAvailable] = useState(true);
  const [line, setLine] = useState("W15");
  const [destinationLabel, setDestinationLabel] = useState("");
  const [departureLocal, setDepartureLocal] = useState("");
  const [arrivalLocal, setArrivalLocal] = useState("");
  const [apiKey, setApiKey] = useState(readStoredKey);
  const [auto, setAuto] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const watchId = useRef(null);

  const sendHeartbeat = useCallback(async () => {
    setErr("");
    setMsg("");
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Géolocalisation non disponible"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      });
    });
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const headers = { "Content-Type": "application/json" };
    const bearer = readAuthToken() || apiKey.trim();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    const body = {
      vehicleId: vehicleId.trim(),
      vehicleType,
      available,
      line: line.trim(),
      lat,
      lon,
      destinationLabel: destinationLabel.trim() || undefined,
      departureAt: toIsoMaybe(departureLocal),
      arrivalAt: toIsoMaybe(arrivalLocal),
    };

    const res = await fetch(apiUrl("/api/driver/heartbeat"), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(raw.slice(0, 200) || `HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setMsg(`Position envoyée (${new Date().toLocaleTimeString("fr-FR")})`);
    return data;
  }, [
    apiKey,
    vehicleId,
    vehicleType,
    available,
    line,
    destinationLabel,
    departureLocal,
    arrivalLocal,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, apiKey);
    } catch {
      /* ignore */
    }
  }, [apiKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = readAuthToken();
      if (!t) return;
      try {
        const res = await fetch(apiUrl("/api/vehicles"), {
          headers: { Authorization: `Bearer ${t}` },
        });
        const raw = await res.text();
        const data = JSON.parse(raw);
        if (cancelled || !res.ok || !data.vehicles?.length) return;
        const v = data.vehicles[0];
        setVehicleId(v.vehicleCode || "BUS-01");
        setLine(v.line || "W15");
        setVehicleType(v.vehicleType === "taxi" ? "taxi" : "bus");
        if (v.destinationLabel) setDestinationLabel(v.destinationLabel);
        if (v.departureLocal) setDepartureLocal(v.departureLocal);
        if (v.arrivalLocal) setArrivalLocal(v.arrivalLocal);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!auto) {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      return undefined;
    }
    if (!navigator.geolocation) {
      setErr("Géolocalisation non disponible");
      setAuto(false);
      return undefined;
    }
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          const headers = { "Content-Type": "application/json" };
          const bearer = readAuthToken() || apiKey.trim();
          if (bearer) headers.Authorization = `Bearer ${bearer}`;
          const body = {
            vehicleId: vehicleId.trim(),
            vehicleType,
            available,
            line: line.trim(),
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            destinationLabel: destinationLabel.trim() || undefined,
            departureAt: toIsoMaybe(departureLocal),
            arrivalAt: toIsoMaybe(arrivalLocal),
          };
          const res = await fetch(apiUrl("/api/driver/heartbeat"), {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });
          const raw = await res.text();
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            throw new Error(raw.slice(0, 120));
          }
          if (!res.ok) throw new Error(data?.error || res.status);
          setMsg(`Auto : ${new Date().toLocaleTimeString("fr-FR")}`);
          setErr("");
        } catch (e) {
          setErr(String(e.message));
        }
      },
      (e) => setErr(String(e.message || "Erreur GPS")),
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 }
    );
    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [
    auto,
    apiKey,
    vehicleId,
    vehicleType,
    available,
    line,
    destinationLabel,
    departureLocal,
    arrivalLocal,
  ]);

  return (
    <div className="account-conducteur" id="traffic-gps">
      <p className="account-conducteur__intro">
        Envoyez votre position, la disponibilité et les horaires affichés aux
        voyageurs sur la carte. Optionnel : clé API flotte si le serveur en définit
        une (<code>DRIVER_API_KEY</code>) pour un appareil sans navigateur.
      </p>

      <div className="driver-card">
        <label className="driver-field">
          <span>ID véhicule</span>
          <input
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            placeholder="BUS-01"
            autoComplete="off"
          />
        </label>
        <label className="driver-field">
          <span>Véhicule</span>
          <select
            className="driver-select"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
          >
            <option value="bus">Bus</option>
            <option value="taxi">Taxi</option>
          </select>
        </label>
        <label className="driver-check driver-check--field">
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
          <span>Disponible (visible comme « en service »)</span>
        </label>
        <label className="driver-field">
          <span>Ligne / service</span>
          <input
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder="W15"
          />
        </label>
        <label className="driver-field">
          <span>Destination affichée</span>
          <input
            value={destinationLabel}
            onChange={(e) => setDestinationLabel(e.target.value)}
            placeholder="ex. Azazga"
          />
        </label>
        <label className="driver-field">
          <span>Départ prévu (local)</span>
          <input
            type="datetime-local"
            value={departureLocal}
            onChange={(e) => setDepartureLocal(e.target.value)}
          />
        </label>
        <label className="driver-field">
          <span>Arrivée prévue (local)</span>
          <input
            type="datetime-local"
            value={arrivalLocal}
            onChange={(e) => setArrivalLocal(e.target.value)}
          />
        </label>
        <label className="driver-field">
          <span>Clé API flotte (optionnel)</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="DRIVER_API_KEY (serveur)"
            autoComplete="off"
          />
        </label>

        <label className="driver-check">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          <span>Envoi automatique (GPS en continu, ~8 s)</span>
        </label>

        <div className="driver-actions">
          <button
            type="button"
            className="driver-btn"
            disabled={auto}
            onClick={async () => {
              try {
                await sendHeartbeat();
              } catch (e) {
                setErr(String(e.message));
              }
            }}
          >
            Envoyer une position
          </button>
        </div>

        {msg && <p className="driver-msg driver-msg--ok">{msg}</p>}
        {err && <p className="driver-msg driver-msg--err">{err}</p>}
      </div>
    </div>
  );
}
