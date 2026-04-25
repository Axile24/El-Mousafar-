import { useCallback, useEffect, useMemo, useState } from "react";
import { apiUrl } from "./apiBase.js";
import ConducteurPanel from "./ConducteurPanel.jsx";
import { SEED_LOCATION_RESULTS } from "./seedPlaces.js";

async function readJsonResponse(res) {
  const raw = await res.text();
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("<")) {
    throw new Error("Réponse HTML au lieu de JSON (API joignable ?)");
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("JSON invalide");
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function conductorKey(name, aftername) {
  const n = String(name || "conducteur").trim().toLowerCase() || "conducteur";
  const a = String(aftername || "bus").trim().toLowerCase() || "bus";
  return `${n}.${a}@local`;
}

function blankForm(profile) {
  return {
    id: null,
    conductorName: profile?.name || "",
    conductorAftername: profile?.aftername || "",
    vehicleCode: "BUS-01",
    line: "W15",
    vehicleType: "bus",
    routeStart: "",
    routeEnd: "",
    destinationLabel: "",
    departureLocal: "",
    arrivalLocal: "",
    seatsTotal: "",
    available: true,
    serviceAlert: "ok",
    serviceNote: "",
    ownerEmail: profile ? conductorKey(profile.name, profile.aftername) : "",
  };
}

export default function AccountView() {
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("el-mousafar-profile") || "null");
    } catch {
      return null;
    }
  });
  const [roleChoice, setRoleChoice] = useState("driver");
  const [name, setName] = useState("");
  const [aftername, setAftername] = useState("");
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState(() => blankForm(profile));
  const [routeStartSuggestions, setRouteStartSuggestions] = useState([]);
  const [routeEndSuggestions, setRouteEndSuggestions] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const isAdmin = profile?.role === "admin";
  const isDriver = profile?.role === "driver";
  const currentKey = useMemo(
    () => (profile ? conductorKey(profile.name, profile.aftername) : ""),
    [profile]
  );
  const adminLines = useMemo(() => {
    const map = new Map();
    for (const v of vehicles) {
      const key = String(v.line || "").trim().toUpperCase();
      if (!key) continue;
      const row = map.get(key) || {
        line: key,
        ids: [],
        buses: [],
        routes: new Set(),
        conductors: new Set(),
        seats: 0,
        available: 0,
        alerts: new Set(),
        notes: new Set(),
      };
      row.ids.push(v.id);
      row.buses.push(v.vehicleCode);
      if (v.routeStart || v.routeEnd || v.destinationLabel) {
        row.routes.add(`${v.routeStart || "—"} → ${v.routeEnd || v.destinationLabel || "—"}`);
      }
      if (v.conductorName || v.conductorAftername) {
        row.conductors.add(`${v.conductorName || ""} ${v.conductorAftername || ""}`.trim());
      }
      row.seats += Number(v.seatsTotal || 0);
      if (v.available) row.available += 1;
      if (v.serviceAlert && v.serviceAlert !== "ok") row.alerts.add(v.serviceAlert);
      if (v.serviceNote) row.notes.add(v.serviceNote);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => a.line.localeCompare(b.line));
  }, [vehicles]);

  const loadVehicles = useCallback(async () => {
    if (!profile) {
      setVehicles([]);
      return;
    }
    const params = new URLSearchParams();
    if (!isAdmin) params.set("conductorKey", currentKey);
    const res = await fetch(apiUrl(`/api/vehicles?${params.toString()}`));
    const data = await readJsonResponse(res);
    setVehicles(data.vehicles || []);
  }, [profile, isAdmin, currentKey]);

  useEffect(() => {
    loadVehicles().catch((e) => setErr(String(e.message)));
  }, [loadVehicles]);

  const loadRouteSuggestions = useCallback(async (q, which) => {
    const text = String(q || "").trim();
    if (!text) {
      if (which === "start") setRouteStartSuggestions(SEED_LOCATION_RESULTS);
      else setRouteEndSuggestions(SEED_LOCATION_RESULTS);
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/locations?q=${encodeURIComponent(text)}`));
      const data = await readJsonResponse(res);
      const list = data.results?.length ? data.results : SEED_LOCATION_RESULTS;
      if (which === "start") setRouteStartSuggestions(list);
      else setRouteEndSuggestions(list);
    } catch {
      const filtered = SEED_LOCATION_RESULTS.filter((p) =>
        String(p.name || "").toLowerCase().includes(text.toLowerCase())
      );
      if (which === "start") setRouteStartSuggestions(filtered);
      else setRouteEndSuggestions(filtered);
    }
  }, []);

  function pickRouteSuggestion(which, item) {
    const name = item.name || item.display_name || "";
    setForm((f) =>
      which === "start"
        ? { ...f, routeStart: name }
        : { ...f, routeEnd: name, destinationLabel: name }
    );
    if (which === "start") setRouteStartSuggestions([]);
    else setRouteEndSuggestions([]);
  }

  function startProfile(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const p = {
      role: roleChoice,
      name: name.trim() || (roleChoice === "admin" ? "Admin" : "Conducteur"),
      aftername: aftername.trim() || "",
    };
    try {
      localStorage.setItem("el-mousafar-profile", JSON.stringify(p));
    } catch {
      /* ignore */
    }
    setProfile(p);
    setForm(blankForm(p));
  }

  function resetForm() {
    setForm(blankForm(profile));
  }

  async function submitVehicle(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const conductorName = form.conductorName.trim() || profile?.name || "";
    const conductorAftername = form.conductorAftername.trim() || profile?.aftername || "";
    const payload = {
      conductorName,
      conductorAftername,
      ownerEmail: isAdmin
        ? form.ownerEmail.trim() || conductorKey(conductorName, conductorAftername)
        : currentKey,
      vehicleCode: form.vehicleCode.trim(),
      line: form.line.trim(),
      vehicleType: form.vehicleType,
      routeStart: form.routeStart.trim(),
      routeEnd: form.routeEnd.trim(),
      destinationLabel: form.destinationLabel.trim() || form.routeEnd.trim(),
      departureLocal: form.departureLocal || null,
      arrivalLocal: form.arrivalLocal || null,
      seatsTotal: form.seatsTotal === "" ? null : Number(form.seatsTotal),
      available: form.available,
      serviceAlert: form.serviceAlert,
      serviceNote: form.serviceNote.trim(),
    };
    const res = await fetch(
      form.id ? apiUrl(`/api/vehicles/${form.id}`) : apiUrl("/api/vehicles"),
      {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    await readJsonResponse(res);
    setMsg(form.id ? "Bus modifié." : "Bus ajouté.");
    resetForm();
    await loadVehicles();
  }

  async function deleteLine(line) {
    const ids = line.ids || [];
    if (!ids.length) return;
    if (
      !window.confirm(
        `Supprimer la ligne ${line.line} et ses ${ids.length} bus enregistrés ?`
      )
    ) {
      return;
    }
    setErr("");
    setMsg("");
    await Promise.all(
      ids.map((id) => fetch(apiUrl(`/api/vehicles/${id}`), { method: "DELETE" }))
    );
    setMsg(`Ligne ${line.line} supprimée.`);
    await loadVehicles();
  }

  async function toggleLineAvailability(line) {
    const ids = line.ids || [];
    if (!ids.length) return;
    const nextAvailable = line.available === 0;
    setErr("");
    setMsg("");
    await Promise.all(
      vehicles
        .filter((v) => ids.includes(v.id))
        .map((v) =>
          fetch(apiUrl(`/api/vehicles/${v.id}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...v,
              available: nextAvailable,
            }),
          })
        )
    );
    setMsg(
      `Ligne ${line.line} ${
        nextAvailable ? "activée comme disponible" : "marquée indisponible"
      }.`
    );
    setForm((f) =>
      String(f.line || "").trim().toUpperCase() === line.line
        ? { ...f, available: nextAvailable }
        : f
    );
    await loadVehicles();
  }

  async function setCurrentLineAvailability(nextAvailable) {
    setForm((f) => ({ ...f, available: nextAvailable }));
    const key = String(form.line || "").trim().toUpperCase();
    const line = adminLines.find((l) => l.line === key);
    if (!line || line.ids.length === 0) return;
    await Promise.all(
      vehicles
        .filter((v) => line.ids.includes(v.id))
        .map((v) =>
          fetch(apiUrl(`/api/vehicles/${v.id}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...v,
              available: nextAvailable,
            }),
          })
        )
    );
    await loadVehicles();
  }

  return (
    <div className="account-shell">
      <header className="account-shell__head">
        <h1 className="account-shell__title">Inscription</h1>
        <a className="account-shell__back" href="#/">
          Recherche trajet
        </a>
      </header>

      {!profile ? (
        <form className="account-card" onSubmit={startProfile}>
          <p className="account-intro">
            Choisissez votre vue. Pas d’e-mail, pas de confirmation et pas de
            connexion : vous arrivez directement dans l’espace de gestion.
          </p>
          <label className="account-field">
            <span>Vue</span>
            <select
              className="account-select"
              value={roleChoice}
              onChange={(e) => setRoleChoice(e.target.value)}
            >
              <option value="driver">Conducteur / driver</option>
              <option value="admin">Administrateur</option>
            </select>
          </label>
          <label className="account-field">
            <span>Nom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="account-field">
            <span>Prénom / après-nom</span>
            <input value={aftername} onChange={(e) => setAftername(e.target.value)} />
          </label>
          <button type="submit" className="account-btn">
            Entrer
          </button>
        </form>
      ) : (
        <div className="account-card account-card--logged">
          <p className="account-logged-as">
            Vue active : <strong>{isAdmin ? "Administrateur" : "Conducteur"}</strong>
            {profile.name ? ` — ${profile.name} ${profile.aftername || ""}` : ""}
          </p>
          <button
            type="button"
            className="account-btn account-btn--ghost"
            onClick={() => {
              localStorage.removeItem("el-mousafar-profile");
              setProfile(null);
              setVehicles([]);
              setMsg("");
              setErr("");
            }}
          >
            Changer de vue
          </button>

          <section className="account-vehicles" id="vehicle-form">
            <h2 className="account-vehicles__title">
              {isAdmin ? "Admin : bus, lignes et conducteurs" : "Conducteur : mon bus"}
            </h2>
            <p className="account-vehicles__hint">
              {isAdmin
                ? "Vous avez les droits CRUD complets : créer, lire, modifier et supprimer les bus, lignes, routes et conducteurs."
                : "Ajoutez votre nom, ligne, numéro de bus, départ, arrivée, horaires estimés, disponibilité et nombre de places."}
            </p>

            <form className="account-vehicles__form" onSubmit={submitVehicle}>
              <label className="account-field">
                <span>Nom conducteur</span>
                <input
                  value={form.conductorName}
                  onChange={(e) => setForm((f) => ({ ...f, conductorName: e.target.value }))}
                  required
                />
              </label>
              <label className="account-field">
                <span>Prénom / après-nom conducteur</span>
                <input
                  value={form.conductorAftername}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, conductorAftername: e.target.value }))
                  }
                />
              </label>
              <label className="account-field">
                <span>Numéro du bus</span>
                <input
                  value={form.vehicleCode}
                  onChange={(e) => setForm((f) => ({ ...f, vehicleCode: e.target.value }))}
                  required
                />
              </label>
              <label className="account-field">
                <span>Numéro de ligne</span>
                <input
                  value={form.line}
                  onChange={(e) => setForm((f) => ({ ...f, line: e.target.value }))}
                  required
                />
              </label>
              <label className="account-field">
                <span>Route départ</span>
                <input
                  value={form.routeStart}
                  onChange={(e) => {
                    const value = e.target.value;
                    setForm((f) => ({ ...f, routeStart: value }));
                    void loadRouteSuggestions(value, "start");
                  }}
                  onFocus={() => void loadRouteSuggestions(form.routeStart, "start")}
                  placeholder="ex. Tizi Ouzou centre-ville"
                  autoComplete="off"
                />
                {routeStartSuggestions.length ? (
                  <ul className="suggestions suggestions--account-route">
                    {routeStartSuggestions.map((item, i) => (
                      <li
                        key={item.gid || item.id || `${item.name}-${i}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickRouteSuggestion("start", item)}
                      >
                        {item.name || item.display_name}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </label>
              <label className="account-field">
                <span>Route arrivée / place d’arrivée</span>
                <input
                  value={form.routeEnd}
                  onChange={(e) => {
                    const value = e.target.value;
                    setForm((f) => ({ ...f, routeEnd: value }));
                    void loadRouteSuggestions(value, "end");
                  }}
                  onFocus={() => void loadRouteSuggestions(form.routeEnd, "end")}
                  placeholder="ex. Gare routière"
                  autoComplete="off"
                />
                {routeEndSuggestions.length ? (
                  <ul className="suggestions suggestions--account-route">
                    {routeEndSuggestions.map((item, i) => (
                      <li
                        key={item.gid || item.id || `${item.name}-${i}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickRouteSuggestion("end", item)}
                      >
                        {item.name || item.display_name}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </label>
              <label className="account-field">
                <span>Départ estimé</span>
                <input
                  type="datetime-local"
                  value={form.departureLocal}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, departureLocal: e.target.value }))
                  }
                />
              </label>
              <label className="account-field">
                <span>Arrivée estimée</span>
                <input
                  type="datetime-local"
                  value={form.arrivalLocal}
                  onChange={(e) => setForm((f) => ({ ...f, arrivalLocal: e.target.value }))}
                />
              </label>
              <label className="account-field">
                <span>Nombre de places</span>
                <input
                  type="number"
                  min="0"
                  value={form.seatsTotal}
                  onChange={(e) => setForm((f) => ({ ...f, seatsTotal: e.target.value }))}
                />
              </label>
              <label className="driver-check driver-check--field">
                <input
                  type="checkbox"
                  checked={form.available}
                  onChange={(e) => {
                    setCurrentLineAvailability(e.target.checked).catch((error) =>
                      setErr(String(error.message))
                    );
                  }}
                />
                <span>Disponible</span>
              </label>
              <label className="account-field">
                <span>Info urgente bus</span>
                <select
                  className="account-select"
                  value={form.serviceAlert}
                  onChange={(e) => setForm((f) => ({ ...f, serviceAlert: e.target.value }))}
                >
                  <option value="ok">Aucun problème</option>
                  <option value="info">Information</option>
                  <option value="delay">Retard</option>
                  <option value="issue">Problème technique</option>
                  <option value="cancelled">Bus ne vient pas</option>
                </select>
              </label>
              <label className="account-field">
                <span>Message pour les passagers</span>
                <textarea
                  value={form.serviceNote}
                  onChange={(e) => setForm((f) => ({ ...f, serviceNote: e.target.value }))}
                  maxLength={240}
                  placeholder="ex. Bus en panne, prochain départ dans 20 min."
                />
              </label>
              <button type="submit" className="account-btn account-btn--secondary">
                {form.id ? "Modifier" : "Créer"}
              </button>
              {form.id ? (
                <button
                  type="button"
                  className="account-btn account-btn--ghost"
                  onClick={resetForm}
                >
                  Nouveau
                </button>
              ) : null}
            </form>

            {isAdmin ? (
              <section className="account-lines">
                <h3 className="account-lines__title">Toutes les lignes</h3>
                {adminLines.length ? (
                  <div className="account-lines__table-wrap">
                    <table className="account-lines__table">
                      <thead>
                        <tr>
                          <th>Ligne</th>
                          <th>Bus</th>
                          <th>Conducteurs</th>
                          <th>Routes</th>
                          <th>Statut</th>
                          <th>Info bus</th>
                          <th>Places</th>
                          <th>Dispo</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminLines.map((line) => (
                          <tr
                            key={line.line}
                            className={
                              line.available > 0
                                ? "account-lines__row--service"
                                : "account-lines__row--frozen"
                            }
                          >
                            <td>
                              <strong>{line.line}</strong>
                            </td>
                            <td>{line.buses.join(", ")}</td>
                            <td>{[...line.conductors].join(", ") || "—"}</td>
                            <td>{[...line.routes].join(" · ") || "—"}</td>
                            <td>
                              <label className="account-lines__availability">
                                <input
                                  type="checkbox"
                                  checked={line.available > 0}
                                  onChange={() =>
                                    toggleLineAvailability(line).catch((e) =>
                                      setErr(String(e.message))
                                    )
                                  }
                                />
                                <span
                                  className={
                                    line.available > 0
                                      ? "account-lines__status account-lines__status--on"
                                      : "account-lines__status account-lines__status--off"
                                  }
                                >
                                  {line.available > 0 ? "Disponible" : "Gelée"}
                                </span>
                              </label>
                            </td>
                            <td>
                              {[...line.notes][0] ||
                                ([...line.alerts][0] ? [...line.alerts][0] : "—")}
                            </td>
                            <td>{line.seats || "—"}</td>
                            <td>
                              {line.available}/{line.buses.length}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="account-lines__delete"
                                onClick={() =>
                                  deleteLine(line).catch((e) => setErr(String(e.message)))
                                }
                              >
                                Supprimer
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="account-vehicles__empty">Aucune ligne enregistrée.</p>
                )}
              </section>
            ) : null}

          </section>

          {isDriver ? (
            <div className="account-conducteur-wrap">
              <h2 className="account-conducteur-wrap__title">GPS live</h2>
              <ConducteurPanel />
            </div>
          ) : null}
        </div>
      )}

      {msg && <p className="account-msg account-msg--ok">{msg}</p>}
      {err && <p className="account-msg account-msg--err">{err}</p>}
    </div>
  );
}
