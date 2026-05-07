import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiUrl } from "./apiBase.js";
import ConducteurPanel from "./ConducteurPanel.jsx";
import { conductorKey } from "./conductorKey.js";
import { SEED_LOCATION_RESULTS } from "./seedPlaces.js";
import {
  clearAuthToken,
  readAuthToken,
  writeAuthToken,
} from "./authSession.js";

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

function blankForm(profile) {
  return {
    id: null,
    conductorName: profile?.name || "",
    conductorAftername: profile?.aftername || "",
    conductorLicense: "",
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

function alertText(alert) {
  return {
    ok: "Aucun problème",
    info: "Information",
    delay: "Retard",
    issue: "Problème technique",
    cancelled: "Bus ne vient pas",
  }[alert || "ok"];
}

function shortLocalDate(value) {
  return value ? String(value).replace("T", " ") : "—";
}

function vehicleToForm(vehicle) {
  return {
    id: vehicle.id,
    conductorName: vehicle.conductorName || "",
    conductorAftername: vehicle.conductorAftername || "",
    conductorLicense: vehicle.conductorLicense || "",
    vehicleCode: vehicle.vehicleCode || "",
    line: vehicle.line || "",
    vehicleType: vehicle.vehicleType || "bus",
    routeStart: vehicle.routeStart || "",
    routeEnd: vehicle.routeEnd || "",
    destinationLabel: vehicle.destinationLabel || vehicle.routeEnd || "",
    departureLocal: vehicle.departureLocal || "",
    arrivalLocal: vehicle.arrivalLocal || "",
    seatsTotal: vehicle.seatsTotal ?? "",
    available: vehicle.available !== false,
    serviceAlert: vehicle.serviceAlert || "ok",
    serviceNote: vehicle.serviceNote || "",
    ownerEmail:
      vehicle.ownerEmail ||
      conductorKey(vehicle.conductorName, vehicle.conductorAftername),
  };
}

function AdminFleetTablePanel({
  vehicles,
  selectedVehicleId,
  setSelectedVehicleId,
  selectedVehicle,
  onEditVehicle,
  onStartNewVehicle,
  deleteVehicleRow,
  deleteVehicleLine,
  toggleVehicleAvailability,
  setErr,
  density,
}) {
  const tableWrapClass =
    density === "full"
      ? "account-info__table-wrap account-info__table-wrap--fullscreen"
      : "account-info__table-wrap";
  const tableClass =
    density === "full"
      ? "account-info__table account-info__table--fullscreen"
      : "account-info__table";

  if (!vehicles.length) {
    return (
      <p className="account-vehicles__empty account-vehicles__empty--fullscreen">
        Aucune information enregistrée pour le moment.
      </p>
    );
  }

  return (
    <div className={tableWrapClass}>
      <table className={tableClass}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Conducteur</th>
            <th>Bus</th>
            <th>Ligne</th>
            <th>Route</th>
            <th>Départ estimé</th>
            <th>Arrivée estimée</th>
            <th>Places</th>
            <th>Statut</th>
            <th>Info bus</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((vehicle) => {
            const selected = selectedVehicleId === vehicle.id;
            return (
              <tr
                key={vehicle.id}
                className={selected ? "account-info__row--selected" : ""}
              >
                <td>{vehicle.id}</td>
                <td>
                  {`${vehicle.conductorName || "Conducteur"} ${
                    vehicle.conductorAftername || ""
                  }`.trim()}
                </td>
                <td>{vehicle.vehicleCode || "—"}</td>
                <td>
                  <button
                    type="button"
                    className="account-info__line-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedVehicleId(selected ? null : vehicle.id);
                    }}
                  >
                    {vehicle.line || "—"}
                  </button>
                </td>
                <td>
                  {vehicle.routeStart || "—"} →{" "}
                  {vehicle.routeEnd || vehicle.destinationLabel || "—"}
                </td>
                <td>{shortLocalDate(vehicle.departureLocal)}</td>
                <td>{shortLocalDate(vehicle.arrivalLocal)}</td>
                <td>{vehicle.seatsTotal ?? "—"}</td>
                <td>
                  <label className="account-lines__availability">
                    <input
                      type="checkbox"
                      checked={vehicle.available !== false}
                      onChange={() =>
                        toggleVehicleAvailability(vehicle, vehicle.available === false).catch(
                          (e) => setErr(String(e.message))
                        )
                      }
                    />
                    <span
                      className={
                        vehicle.available !== false
                          ? "account-lines__status account-lines__status--on"
                          : "account-lines__status account-lines__status--off"
                      }
                    >
                      {vehicle.available !== false ? "Dispo" : "Gelée"}
                    </span>
                  </label>
                </td>
                <td>{vehicle.serviceNote || alertText(vehicle.serviceAlert)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selectedVehicle ? (
        <div className="account-crud-panel">
          <strong>
            Vald linje {selectedVehicle.line || "—"} · {selectedVehicle.vehicleCode || "—"}
          </strong>
          <div className="account-crud-panel__buttons">
            <button
              type="button"
              className="account-lines__edit"
              onClick={() => onEditVehicle(selectedVehicle)}
            >
              Modifiera
            </button>
            <button
              type="button"
              className="account-lines__edit"
              onClick={() => onStartNewVehicle()}
            >
              Lägg till
            </button>
            <button
              type="button"
              className="account-lines__delete"
              onClick={() =>
                deleteVehicleRow(selectedVehicle).catch((e) => setErr(String(e.message)))
              }
            >
              Radera linje
            </button>
            <button
              type="button"
              className="account-lines__delete"
              onClick={() =>
                deleteVehicleLine(selectedVehicle).catch((e) => setErr(String(e.message)))
              }
            >
              Ta bort linje
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
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
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [fleetFullOpen, setFleetFullOpen] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [driverDirForm, setDriverDirForm] = useState({
    id: null,
    name: "",
    aftername: "",
    line: "",
    licenseNumber: "",
    phone: "",
    notes: "",
  });
  const [serverUser, setServerUser] = useState(null);
  const [apiUsers, setApiUsers] = useState([]);
  const [regOptions, setRegOptions] = useState({
    emailConfigured: false,
  });
  const [apiAuthTab, setApiAuthTab] = useState("login");
  const [apiEmail, setApiEmail] = useState("");
  const [apiPassword, setApiPassword] = useState("");
  const [registerPendingVerify, setRegisterPendingVerify] = useState(false);
  const [apiVerifyCode, setApiVerifyCode] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("driver");
  const [apiAuthBanner, setApiAuthBanner] = useState("");

  const isAdmin = profile?.role === "admin";
  const isDriver = profile?.role === "driver";
  const showDriverFleetUi =
    isDriver && serverUser?.role === "driver";
  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId]
  );
  const currentKey = useMemo(
    () => (profile ? conductorKey(profile.name, profile.aftername) : ""),
    [profile]
  );
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

  const loadDrivers = useCallback(async () => {
    if (!profile || !isAdmin) {
      setDrivers([]);
      return;
    }
    const res = await fetch(apiUrl("/api/drivers"));
    const data = await readJsonResponse(res);
    setDrivers(data.drivers || []);
  }, [profile, isAdmin]);

  useEffect(() => {
    loadDrivers().catch((e) => setErr(String(e.message)));
  }, [loadDrivers]);

  useEffect(() => {
    if (!fleetFullOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setFleetFullOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [fleetFullOpen]);

  useEffect(() => {
    if (!isAdmin) setFleetFullOpen(false);
  }, [isAdmin]);

  const refreshServerUser = useCallback(async () => {
    const t = readAuthToken();
    if (!t) {
      setServerUser(null);
      setApiUsers([]);
      return;
    }
    try {
      const res = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error("session");
      setServerUser(data.user);
    } catch {
      clearAuthToken();
      setServerUser(null);
      setApiUsers([]);
    }
  }, []);

  const loadApiUsers = useCallback(async () => {
    const t = readAuthToken();
    if (!t) return;
    try {
      const res = await fetch(apiUrl("/api/admin/users"), {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await readJsonResponse(res);
      setApiUsers(data.users || []);
    } catch {
      setApiUsers([]);
    }
  }, []);

  useEffect(() => {
    fetch(apiUrl("/api/auth/registration-options"))
      .then((r) => r.json())
      .then((d) =>
        setRegOptions({
          emailConfigured: Boolean(d?.emailConfigured),
        })
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (profile) refreshServerUser();
  }, [profile, refreshServerUser]);

  useEffect(() => {
    if (serverUser?.role === "admin") loadApiUsers();
    else setApiUsers([]);
  }, [serverUser, loadApiUsers]);

  async function submitApiLogin(e) {
    e.preventDefault();
    setApiAuthBanner("");
    setErr("");
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: apiEmail.trim(),
          password: apiPassword,
        }),
      });
      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        const needsVerification =
          data.needsVerification === true ||
          (typeof data.error === "string" &&
            /non vérifié|code reçu par e-mail|validez le code/i.test(
              data.error
            ));
        if (res.status === 401 && needsVerification) {
          setApiAuthTab("register");
          setRegisterPendingVerify(true);
          setApiVerifyCode("");
          setApiAuthBanner(
            data.error ||
              "Compte non encore validé : saisissez le code reçu par e-mail, ou utilisez « Renvoyer le code » (mot de passe requis)."
          );
          return;
        }
        throw new Error(
          data.error ||
            (res.status === 401
              ? "E-mail ou mot de passe incorrect. Si vous venez de créer le compte, validez d’abord le code envoyé par e-mail (onglet « Créer un compte »)."
              : `HTTP ${res.status}`)
        );
      }
      writeAuthToken(data.token);
      setServerUser(data.user);
      setApiPassword("");
      setApiAuthBanner("Connecté au serveur (jeton enregistré).");
    } catch (x) {
      setApiAuthBanner(String(x.message || x));
    }
  }

  async function submitApiRegister(e) {
    e.preventDefault();
    setApiAuthBanner("");
    setErr("");
    try {
      const body = {
        email: apiEmail.trim(),
        password: apiPassword,
        role: "driver",
      };
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRegisterPendingVerify(true);
      setApiVerifyCode("");
      const sim = Boolean(data.emailSimulated);
      if (sim && data.devOtp != null) {
        setApiAuthBanner(
          `Aucun envoi SMTP réel (EMAIL_SIMULATE=1 ou SMTP non configuré). Saisissez ce code : ${data.devOtp}`
        );
      } else if (sim) {
        setApiAuthBanner(
          "Mode simulation e-mail. Définissez SMTP_HOST (et auth si besoin) sur le serveur API, ou EMAIL_SIMULATE=1 pour les essais."
        );
      } else {
        setApiAuthBanner(
          `Code envoyé à ${data.maskedEmail || "votre adresse"}. Saisissez-le ci-dessous.`
        );
      }
    } catch (x) {
      setApiAuthBanner(String(x.message || x));
    }
  }

  async function submitVerifyRegister(e) {
    e.preventDefault();
    setApiAuthBanner("");
    setErr("");
    try {
      const res = await fetch(apiUrl("/api/auth/register/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: apiEmail.trim(),
          code: apiVerifyCode.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      writeAuthToken(data.token);
      setServerUser(data.user);
      setRegisterPendingVerify(false);
      setApiPassword("");
      setApiVerifyCode("");
      setApiAuthBanner("Compte confirmé — vous êtes connecté.");
      if (data.user?.role === "admin") loadApiUsers();
    } catch (x) {
      setApiAuthBanner(String(x.message || x));
    }
  }

  async function submitResendRegisterOtp() {
    setApiAuthBanner("");
    try {
      const res = await fetch(apiUrl("/api/auth/register/resend"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: apiEmail.trim(),
          password: apiPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const simHint =
        data.devOtp != null ? ` Code test : ${data.devOtp}.` : "";
      setApiAuthBanner(`Nouveau code envoyé.${simHint}`);
    } catch (x) {
      setApiAuthBanner(String(x.message || x));
    }
  }

  async function submitPasswordResetRequest(e) {
    e.preventDefault();
    setApiAuthBanner("");
    try {
      const res = await fetch(apiUrl("/api/auth/password-reset/request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResetCodeSent(true);
      setResetCode("");
      const simHint =
        data.devOtp != null ? ` Code (test) : ${data.devOtp}.` : "";
      if (data.silent || !data.maskedEmail) {
        setApiAuthBanner(
          `Si un compte correspond à cette adresse, un e-mail avec le code a été envoyé.${simHint}`
        );
      } else {
        setApiAuthBanner(
          `Si un compte correspond, un e-mail a été envoyé vers ${data.maskedEmail}.${simHint}`
        );
      }
    } catch (x) {
      setApiAuthBanner(String(x.message || x));
    }
  }

  async function submitPasswordResetConfirm(e) {
    e.preventDefault();
    setApiAuthBanner("");
    try {
      const res = await fetch(apiUrl("/api/auth/password-reset/confirm"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail.trim(),
          code: resetCode.trim(),
          newPassword: resetNewPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResetCodeSent(false);
      setResetNewPassword("");
      setResetCode("");
      setApiAuthTab("login");
      setApiAuthBanner("Mot de passe mis à jour. Vous pouvez vous connecter.");
    } catch (x) {
      setApiAuthBanner(String(x.message || x));
    }
  }

  async function submitApiLogout() {
    setApiAuthBanner("");
    const t = readAuthToken();
    try {
      if (t) {
        await fetch(apiUrl("/api/auth/logout"), {
          method: "POST",
          headers: { Authorization: `Bearer ${t}` },
        });
      }
    } catch {
      /* ignore */
    }
    clearAuthToken();
    setServerUser(null);
    setApiUsers([]);
    setApiAuthBanner("Déconnecté du serveur.");
  }

  async function submitCreateApiUser(ev) {
    ev.preventDefault();
    setApiAuthBanner("");
    setErr("");
    const t = readAuthToken();
    try {
      const res = await fetch(apiUrl("/api/admin/users"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({
          email: createEmail.trim(),
          password: createPassword,
          role: createRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCreateEmail("");
      setCreatePassword("");
      setApiAuthBanner(`Utilisateur créé : ${data.user?.email || ""}.`);
      await loadApiUsers();
    } catch (x) {
      setApiAuthBanner(String(x.message || x));
    }
  }

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

  function switchView(nextRole) {
    setErr("");
    setMsg("");
    setRoleChoice(nextRole);
    const p = profile
      ? { ...profile, role: nextRole }
      : {
          role: nextRole,
          name: name.trim() || (nextRole === "admin" ? "Admin" : "Conducteur"),
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

  function resetDriverDirForm() {
    setDriverDirForm({
      id: null,
      name: "",
      aftername: "",
      line: "",
      licenseNumber: "",
      phone: "",
      notes: "",
    });
  }

  async function submitDriverDirectory(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const body = {
      name: driverDirForm.name.trim(),
      aftername: driverDirForm.aftername.trim(),
      line: driverDirForm.line.trim(),
      licenseNumber: driverDirForm.licenseNumber.trim(),
      phone: driverDirForm.phone.trim(),
      notes: driverDirForm.notes.trim(),
    };
    const url = driverDirForm.id
      ? apiUrl(`/api/drivers/${driverDirForm.id}`)
      : apiUrl("/api/drivers");
    const res = await fetch(url, {
      method: driverDirForm.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await readJsonResponse(res);
    setMsg(driverDirForm.id ? "Conducteur mis à jour." : "Conducteur ajouté.");
    resetDriverDirForm();
    await loadDrivers();
  }

  async function deleteDriverRow(driver) {
    if (!window.confirm(`Supprimer ${driver.name} ${driver.aftername || ""} de l’annuaire ?`)) {
      return;
    }
    setErr("");
    setMsg("");
    const res = await fetch(apiUrl(`/api/drivers/${driver.id}`), { method: "DELETE" });
    await readJsonResponse(res);
    setMsg("Conducteur supprimé.");
    if (driverDirForm.id === driver.id) resetDriverDirForm();
    await loadDrivers();
  }

  function editDriverRow(driver) {
    setDriverDirForm({
      id: driver.id,
      name: driver.name || "",
      aftername: driver.aftername || "",
      line: driver.line || "",
      licenseNumber: driver.licenseNumber || "",
      phone: driver.phone || "",
      notes: driver.notes || "",
    });
    document.getElementById("driver-directory")?.scrollIntoView({ behavior: "smooth" });
  }

  function editVehicle(vehicle) {
    setErr("");
    setMsg("");
    setForm(vehicleToForm(vehicle));
    document.getElementById("vehicle-form")?.scrollIntoView({ behavior: "smooth" });
  }

  function startNewVehicle() {
    setErr("");
    setMsg("");
    setSelectedVehicleId(null);
    resetForm();
    document.getElementById("vehicle-form")?.scrollIntoView({ behavior: "smooth" });
  }

  async function deleteVehicleRow(vehicle) {
    if (
      !window.confirm(
        `Supprimer ${vehicle.vehicleCode || "ce bus"} — ligne ${
          vehicle.line || "sans ligne"
        } ?`
      )
    ) {
      return;
    }
    setErr("");
    setMsg("");
    const res = await fetch(apiUrl(`/api/vehicles/${vehicle.id}`), {
      method: "DELETE",
    });
    await readJsonResponse(res);
    setMsg("Inscription supprimée.");
    if (form.id === vehicle.id) resetForm();
    await loadVehicles();
  }

  async function deleteVehicleLine(vehicle) {
    const line = String(vehicle.line || "").trim();
    if (!line) return;
    const sameLineVehicles = vehicles.filter(
      (v) => String(v.line || "").trim().toUpperCase() === line.toUpperCase()
    );
    if (
      !window.confirm(
        `Ta bort hela linje ${line} och ${sameLineVehicles.length} registrerade bus(sar)?`
      )
    ) {
      return;
    }
    setErr("");
    setMsg("");
    await Promise.all(
      sameLineVehicles.map(async (v) => {
        const res = await fetch(apiUrl(`/api/vehicles/${v.id}`), {
          method: "DELETE",
        });
        await readJsonResponse(res);
      })
    );
    setMsg(`Linje ${line} borttagen.`);
    if (
      sameLineVehicles.some((v) => v.id === form.id)
    ) {
      resetForm();
    }
    setSelectedVehicleId(null);
    await loadVehicles();
  }


  async function toggleVehicleAvailability(vehicle, nextAvailable) {
    setErr("");
    setMsg("");
    const res = await fetch(apiUrl(`/api/vehicles/${vehicle.id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...vehicle,
        available: nextAvailable,
      }),
    });
    await readJsonResponse(res);
    setMsg(
      `${vehicle.vehicleCode || "Bus"} ${
        nextAvailable ? "activé comme disponible" : "marqué indisponible"
      }.`
    );
    if (form.id === vehicle.id) {
      setForm((f) => ({ ...f, available: nextAvailable }));
    }
    await loadVehicles();
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
      conductorLicense: form.conductorLicense.trim(),
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
    if (isAdmin) {
      setFleetFullOpen(true);
    }
  }

  async function setCurrentLineAvailability(nextAvailable) {
    setForm((f) => ({ ...f, available: nextAvailable }));
    if (!form.id) return;
    const vehicle = vehicles.find((v) => v.id === form.id);
    if (!vehicle) return;
    await toggleVehicleAvailability(vehicle, nextAvailable);
  }

  return (
    <div className="account-shell">
      <header className="account-shell__head">
        <h1 className="account-shell__title">Inscription</h1>
        <a className="account-shell__back" href="#/">
          Recherche trajet
        </a>
      </header>

      <div className="account-view-tabs" role="tablist" aria-label="Choisir la vue">
        <button
          type="button"
          className={`account-view-tab ${
            (profile?.role || roleChoice) === "driver" ? "account-view-tab--active" : ""
          }`}
          onClick={() => switchView("driver")}
          role="tab"
          aria-selected={(profile?.role || roleChoice) === "driver"}
        >
          Conducteur
        </button>
        <button
          type="button"
          className={`account-view-tab ${
            (profile?.role || roleChoice) === "admin" ? "account-view-tab--active" : ""
          }`}
          onClick={() => switchView("admin")}
          role="tab"
          aria-selected={(profile?.role || roleChoice) === "admin"}
        >
          Admin
        </button>
      </div>

      {!profile ? (
        <form className="account-card" onSubmit={startProfile}>
          <h2 className="account-card__title">
            {roleChoice === "admin" ? "Vue administrateur" : "Vue conducteur"}
          </h2>
          <p className="account-intro">
            Choisissez votre vue. Pas d’e-mail, pas de confirmation et pas de
            connexion : vous arrivez directement dans l’espace de gestion.
          </p>
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
        <div
          className={`account-card account-card--logged account-card--${profile.role}${
            isDriver && serverUser?.role === "driver"
              ? " account-card--driver-app"
              : ""
          }`}
        >
          {!(isDriver && serverUser?.role === "driver") ? (
            <p className="account-logged-as">
              Vue active : <strong>{isAdmin ? "Administrateur" : "Conducteur"}</strong>
              {profile.name ? ` — ${profile.name} ${profile.aftername || ""}` : ""}
            </p>
          ) : null}

          {isDriver ? (
          serverUser?.role === "driver" ? (
            <>
              <div
                className="account-driver-toolbar"
                aria-label="Session et espace conducteur"
              >
                <div className="account-driver-toolbar__main">
                  <h2 className="account-driver-toolbar__heading">Espace conducteur</h2>
                  <p className="account-driver-toolbar__profile">
                    <strong>{isAdmin ? "Administrateur" : "Conducteur"}</strong>
                    {profile.name
                      ? ` — ${profile.name} ${profile.aftername || ""}`
                      : ""}
                  </p>
                  <p className="account-driver-toolbar__session">
                    <strong>{serverUser.email}</strong>
                    <span className="account-api-auth__role-badge">{serverUser.role}</span>
                  </p>
                </div>
                <button
                  type="button"
                  className="account-btn account-btn--ghost account-driver-toolbar__logout"
                  onClick={() => submitApiLogout()}
                >
                  Déconnexion
                </button>
              </div>
              {apiAuthBanner ? (
                <p className="account-api-auth__banner" role="status">
                  {apiAuthBanner}
                </p>
              ) : null}
            </>
          ) : (
          <section className="account-api-auth" aria-labelledby="account-api-auth-title">
            <h2 id="account-api-auth-title" className="account-api-auth__title">
              Créer ton compte
            </h2>
            <p className="account-api-auth__hint">
              Connexion avec e-mail et mot de passe.{" "}
              <strong>Inscription ouverte aux conducteurs uniquement</strong>
              {regOptions.emailConfigured
                ? " Après inscription, un code à 6 chiffres est envoyé à votre adresse e-mail pour confirmer le compte."
                : " L’envoi du code e-mail nécessite SMTP sur le serveur (ou EMAIL_SIMULATE=1 en développement)."}
            </p>
            {apiAuthBanner ? (
              <p className="account-api-auth__banner" role="status">
                {apiAuthBanner}
              </p>
            ) : null}
            {serverUser ? (
              <div className="account-api-auth__session">
                <p className="account-api-auth__session-line">
                  <strong>{serverUser.email}</strong>
                  <span className="account-api-auth__role-badge">{serverUser.role}</span>
                </p>
                <button
                  type="button"
                  className="account-btn account-btn--ghost"
                  onClick={() => submitApiLogout()}
                >
                  Déconnexion API
                </button>
                {serverUser.role === "admin" ? (
                  <div className="account-api-auth__admin">
                    <h3 className="account-api-auth__subtitle">Créer un utilisateur</h3>
                    <form className="account-api-auth__form" onSubmit={submitCreateApiUser}>
                      <label className="account-field">
                        <span>E-mail</span>
                        <input
                          type="email"
                          value={createEmail}
                          onChange={(e) => setCreateEmail(e.target.value)}
                          autoComplete="off"
                          required
                        />
                      </label>
                      <label className="account-field">
                        <span>Mot de passe (min. 6)</span>
                        <input
                          type="password"
                          value={createPassword}
                          onChange={(e) => setCreatePassword(e.target.value)}
                          autoComplete="new-password"
                          required
                          minLength={6}
                        />
                      </label>
                      <label className="account-field">
                        <span>Rôle</span>
                        <select
                          className="account-select"
                          value={createRole}
                          onChange={(e) => setCreateRole(e.target.value)}
                        >
                          <option value="driver">Conducteur</option>
                          <option value="admin">Administrateur</option>
                        </select>
                      </label>
                      <button type="submit" className="account-btn account-btn--secondary">
                        Créer l’utilisateur
                      </button>
                    </form>
                    <h3 className="account-api-auth__subtitle">Utilisateurs enregistrés</h3>
                    {apiUsers.length ? (
                      <ul className="account-api-auth__user-list">
                        {apiUsers.map((u) => (
                          <li key={u.email}>
                            <span className="account-api-auth__user-email">{u.email}</span>
                            <span className="account-api-auth__role-badge">{u.role}</span>
                            {u.phoneMasked ? (
                              <span className="account-api-auth__user-phone">{u.phoneMasked}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="account-api-auth__empty">Aucun compte ou liste non chargée.</p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="account-api-auth__forms">
                <div className="account-api-auth__tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    className={`account-api-auth__tab ${
                      apiAuthTab === "login" ? "account-api-auth__tab--active" : ""
                    }`}
                    aria-selected={apiAuthTab === "login"}
                    onClick={() => {
                      setApiAuthTab("login");
                      setRegisterPendingVerify(false);
                    }}
                  >
                    Connexion
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`account-api-auth__tab ${
                      apiAuthTab === "register" ? "account-api-auth__tab--active" : ""
                    }`}
                    aria-selected={apiAuthTab === "register"}
                    onClick={() => {
                      setApiAuthTab("register");
                      setRegisterPendingVerify(false);
                    }}
                  >
                    Créer un compte
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`account-api-auth__tab ${
                      apiAuthTab === "reset" ? "account-api-auth__tab--active" : ""
                    }`}
                    aria-selected={apiAuthTab === "reset"}
                    onClick={() => {
                      setApiAuthTab("reset");
                      setResetCodeSent(false);
                      setRegisterPendingVerify(false);
                    }}
                  >
                    Mot de passe oublié
                  </button>
                </div>
                {apiAuthTab === "login" ? (
                  <form className="account-api-auth__form" onSubmit={submitApiLogin}>
                    <label className="account-field">
                      <span>E-mail</span>
                      <input
                        type="email"
                        value={apiEmail}
                        onChange={(e) => setApiEmail(e.target.value)}
                        autoComplete="username"
                        required
                      />
                    </label>
                    <label className="account-field">
                      <span>Mot de passe</span>
                      <input
                        type="password"
                        value={apiPassword}
                        onChange={(e) => setApiPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    <button type="submit" className="account-btn account-btn--secondary">
                      Se connecter
                    </button>
                  </form>
                ) : null}
                {apiAuthTab === "register" && !registerPendingVerify ? (
                  <form className="account-api-auth__form" onSubmit={submitApiRegister}>
                    <label className="account-field">
                      <span>E-mail</span>
                      <input
                        type="email"
                        value={apiEmail}
                        onChange={(e) => setApiEmail(e.target.value)}
                        autoComplete="off"
                        required
                      />
                    </label>
                    <label className="account-field">
                      <span>Mot de passe (min. 6)</span>
                      <input
                        type="password"
                        value={apiPassword}
                        onChange={(e) => setApiPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        minLength={6}
                      />
                    </label>
                    <button type="submit" className="account-btn account-btn--secondary">
                      Envoyer le code par e-mail
                    </button>
                  </form>
                ) : null}
                {apiAuthTab === "register" && registerPendingVerify ? (
                  <form className="account-api-auth__form" onSubmit={submitVerifyRegister}>
                    <p className="account-api-auth__verify-hint">
                      Code à 6 chiffres reçu par e-mail pour <strong>{apiEmail}</strong>
                    </p>
                    <label className="account-field">
                      <span>Code reçu par e-mail</span>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={apiVerifyCode}
                        onChange={(e) => setApiVerifyCode(e.target.value)}
                        autoComplete="one-time-code"
                        required
                      />
                    </label>
                    <button type="submit" className="account-btn account-btn--secondary">
                      Confirmer et ouvrir la session
                    </button>
                    <button
                      type="button"
                      className="account-btn account-btn--ghost"
                      onClick={() => submitResendRegisterOtp()}
                    >
                      Renvoyer le code
                    </button>
                    <button
                      type="button"
                      className="account-btn account-btn--ghost"
                      onClick={() => {
                        setRegisterPendingVerify(false);
                        setApiVerifyCode("");
                      }}
                    >
                      Modifier l’inscription
                    </button>
                  </form>
                ) : null}
                {apiAuthTab === "reset" ? (
                  <div className="account-api-auth__reset">
                    {!resetCodeSent ? (
                      <form
                        className="account-api-auth__form"
                        onSubmit={submitPasswordResetRequest}
                      >
                        <label className="account-field">
                          <span>E-mail du compte</span>
                          <input
                            type="email"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            required
                          />
                        </label>
                        <button type="submit" className="account-btn account-btn--secondary">
                          Envoyer le code par e-mail
                        </button>
                      </form>
                    ) : (
                      <form
                        className="account-api-auth__form"
                        onSubmit={submitPasswordResetConfirm}
                      >
                        <label className="account-field">
                          <span>Code reçu par e-mail</span>
                          <input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            value={resetCode}
                            onChange={(e) => setResetCode(e.target.value)}
                            required
                          />
                        </label>
                        <label className="account-field">
                          <span>Nouveau mot de passe (min. 6)</span>
                          <input
                            type="password"
                            value={resetNewPassword}
                            onChange={(e) => setResetNewPassword(e.target.value)}
                            minLength={6}
                            required
                          />
                        </label>
                        <button type="submit" className="account-btn account-btn--secondary">
                          Enregistrer le nouveau mot de passe
                        </button>
                        <button
                          type="button"
                          className="account-btn account-btn--ghost"
                          onClick={() => setResetCodeSent(false)}
                        >
                          Retour
                        </button>
                      </form>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </section>
          )
          ) : null}

          {(isAdmin || showDriverFleetUi) ? (
          <div
            className={
              showDriverFleetUi ? "account-driver-workspace" : "account-fleet-slot"
            }
          >
          <section
            className={`account-vehicles${
              showDriverFleetUi ? " account-vehicles--driver-main" : ""
            }`}
            id="vehicle-form"
          >
            <div className="account-vehicles__head">
              <h2 className="account-vehicles__title">
                {isAdmin ? "Admin : bus, lignes et conducteurs" : "Conducteur : mon bus"}
              </h2>
              {showDriverFleetUi ? (
                <button
                  type="button"
                  className="account-btn account-btn--ghost account-vehicles__logout"
                  onClick={() => submitApiLogout()}
                >
                  Déconnexion
                </button>
              ) : null}
            </div>
            <p className="account-vehicles__hint">
              {isAdmin
                ? "Vous avez les droits CRUD complets : créer, lire, modifier et supprimer les bus, lignes, routes et conducteurs. Plusieurs bus peuvent partager la même ligne ou le même propriétaire ; chaque numéro de bus (code, ex. BUS-01) doit en revanche être unique dans toute l’application."
                : "Renseignez nom, ligne, numéro de bus, route, horaires, disponibilité et places. Plusieurs bus peuvent utiliser la même ligne ou le même compte ; le numéro de bus (code véhicule) doit être unique dans toute l’application."}
            </p>

            {isAdmin ? (
              <div className="account-drivers" id="driver-directory">
                <h3 className="account-drivers__title">Propriétaire de bus / société</h3>
                <p className="account-drivers__hint">
                  Annuaire des conducteurs : ligne d’affectation, permis, coordonnées. Sélectionnez une fiche dans le formulaire bus pour remplir nom et prénom.
                </p>
                <form className="account-drivers__form" onSubmit={submitDriverDirectory}>
                  <label className="account-field">
                    <span>Nom</span>
                    <input
                      value={driverDirForm.name}
                      onChange={(e) =>
                        setDriverDirForm((d) => ({ ...d, name: e.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="account-field">
                    <span>Prénom / après-nom</span>
                    <input
                      value={driverDirForm.aftername}
                      onChange={(e) =>
                        setDriverDirForm((d) => ({ ...d, aftername: e.target.value }))
                      }
                    />
                  </label>
                  <label className="account-field">
                    <span>Numéro de ligne</span>
                    <input
                      value={driverDirForm.line}
                      onChange={(e) =>
                        setDriverDirForm((d) => ({ ...d, line: e.target.value }))
                      }
                      placeholder="ex. W15"
                      autoComplete="off"
                    />
                  </label>
                  <label className="account-field">
                    <span>N° permis de conduire</span>
                    <input
                      value={driverDirForm.licenseNumber}
                      onChange={(e) =>
                        setDriverDirForm((d) => ({ ...d, licenseNumber: e.target.value }))
                      }
                      autoComplete="off"
                    />
                  </label>
                  <label className="account-field">
                    <span>Téléphone</span>
                    <input
                      value={driverDirForm.phone}
                      onChange={(e) =>
                        setDriverDirForm((d) => ({ ...d, phone: e.target.value }))
                      }
                      autoComplete="tel"
                    />
                  </label>
                  <label className="account-field">
                    <span>Notes</span>
                    <input
                      value={driverDirForm.notes}
                      onChange={(e) =>
                        setDriverDirForm((d) => ({ ...d, notes: e.target.value }))
                      }
                    />
                  </label>
                  <div className="account-drivers__form-actions">
                    <button type="submit" className="account-btn account-btn--secondary">
                      {driverDirForm.id ? "Enregistrer" : "Ajouter"}
                    </button>
                    {driverDirForm.id ? (
                      <button
                        type="button"
                        className="account-btn account-btn--ghost"
                        onClick={resetDriverDirForm}
                      >
                        Nouveau
                      </button>
                    ) : null}
                  </div>
                </form>
                {drivers.length ? (
                  <div className="account-drivers__table-wrap">
                    <table className="account-drivers__table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Nom</th>
                          <th>Prénom</th>
                          <th>Ligne</th>
                          <th>Permis</th>
                          <th>Tél.</th>
                          <th>Notes</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {drivers.map((d) => (
                          <tr key={d.id} className="account-drivers__row">
                            <td data-label="ID">{d.id}</td>
                            <td data-label="Nom">{d.name}</td>
                            <td data-label="Prénom">{d.aftername || "—"}</td>
                            <td data-label="Ligne">{d.line || "—"}</td>
                            <td data-label="Permis">{d.licenseNumber || "—"}</td>
                            <td data-label="Tél.">{d.phone || "—"}</td>
                            <td data-label="Notes">{d.notes || "—"}</td>
                            <td className="account-drivers__actions">
                              <button
                                type="button"
                                className="account-lines__edit"
                                onClick={() => editDriverRow(d)}
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                className="account-lines__delete"
                                onClick={() =>
                                  deleteDriverRow(d).catch((x) => setErr(String(x.message)))
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
                  <p className="account-drivers__empty">Aucun conducteur dans l’annuaire.</p>
                )}
              </div>
            ) : null}

            <div className="account-vehicles-body">
            <form className="account-vehicles__form" onSubmit={submitVehicle}>
              <label className="account-field">
                <span>Nom conducteur</span>
                <input
                  value={form.conductorName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, conductorName: e.target.value }))
                  }
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
                <span>N° permis de conduire</span>
                <input
                  value={form.conductorLicense}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, conductorLicense: e.target.value }))
                  }
                  autoComplete="off"
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
              <div className="account-form-actions">
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
                {isAdmin ? (
                  <button
                    type="button"
                    className="account-btn account-btn--table-jump"
                    onClick={() => setFleetFullOpen(true)}
                  >
                    Toutes les informations
                  </button>
                ) : null}
              </div>
            </form>
            </div>

          </section>

          {showDriverFleetUi ? (
            <div className="account-conducteur-wrap">
              <h2 className="account-conducteur-wrap__title">GPS live</h2>
              <ConducteurPanel />
            </div>
          ) : null}
          </div>
          ) : null}
        </div>
      )}

      {fleetFullOpen && isAdmin && profile
        ? createPortal(
            <div
              className="account-fleet-fullscreen"
              role="dialog"
              aria-modal="true"
              aria-labelledby="account-fleet-full-title"
            >
              <header className="account-fleet-fullscreen__head">
                <h2 id="account-fleet-full-title" className="account-fleet-fullscreen__title">
                  Toutes les informations
                </h2>
                <button
                  type="button"
                  className="account-fleet-fullscreen__close account-btn account-btn--ghost"
                  onClick={() => setFleetFullOpen(false)}
                >
                  Fermer
                </button>
              </header>
              <div className="account-fleet-fullscreen__body">
                <AdminFleetTablePanel
                  density="full"
                  vehicles={vehicles}
                  selectedVehicleId={selectedVehicleId}
                  setSelectedVehicleId={setSelectedVehicleId}
                  selectedVehicle={selectedVehicle}
                  onEditVehicle={(v) => {
                    setFleetFullOpen(false);
                    editVehicle(v);
                  }}
                  onStartNewVehicle={() => {
                    setFleetFullOpen(false);
                    startNewVehicle();
                  }}
                  deleteVehicleRow={deleteVehicleRow}
                  deleteVehicleLine={deleteVehicleLine}
                  toggleVehicleAvailability={toggleVehicleAvailability}
                  setErr={setErr}
                />
              </div>
            </div>,
            document.body
          )
        : null}

      {msg && <p className="account-msg account-msg--ok">{msg}</p>}
      {err && <p className="account-msg account-msg--err">{err}</p>}
    </div>
  );
}
