import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "./apiBase.js";
import { AUTH_TOKEN_KEY, readAuthToken } from "./authSession.js";
import ConducteurPanel from "./ConducteurPanel.jsx";

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

function readToken() {
  return readAuthToken();
}

/** Valeur pour un champ datetime-local à partir d’une chaîne API. */
function toDatetimeLocalValue(s) {
  if (!s || !String(s).trim()) return "";
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) return t.slice(0, 16);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AccountView() {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [role, setRole] = useState("driver");
  const [adminInvite, setAdminInvite] = useState("");
  const [showAdminInviteCode, setShowAdminInviteCode] = useState(false);
  /** null = pas encore chargé ; sert à afficher l’aide admin clairement. */
  const [regOptions, setRegOptions] = useState(null);
  const [token, setToken] = useState(() => readToken());
  const [me, setMe] = useState(null);
  const [adminUsers, setAdminUsers] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [vehicles, setVehicles] = useState([]);
  const [vCode, setVCode] = useState("BUS-01");
  const [vLine, setVLine] = useState("W15");
  const [vType, setVType] = useState("bus");
  const [vDest, setVDest] = useState("");
  const [vDep, setVDep] = useState("");
  const [vArr, setVArr] = useState("");
  /** Conducteur propriétaire (admin : création / édition de n’importe quel bus). */
  const [vOwnerEmail, setVOwnerEmail] = useState("");
  /** Ligne SQLite en cours d’édition (modifier ligne, horaires, etc.). */
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [hashTick, setHashTick] = useState(0);
  /** E-mail pour lequel proposer « renvoyer la confirmation » (inscription ou échec de connexion). */
  const [verificationEmailHint, setVerificationEmailHint] = useState("");

  useEffect(() => {
    const onHash = () => setHashTick((n) => n + 1);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /** Lien de confirmation : #/compte?v=… */
  useEffect(() => {
    const h = window.location.hash.replace(/^#\/?/, "");
    const qIdx = h.indexOf("?");
    const q = qIdx >= 0 ? h.slice(qIdx + 1) : "";
    const vTok = new URLSearchParams(q).get("v");
    if (!vTok || vTok.length < 16) return undefined;
    let cancelled = false;
    (async () => {
      setErr("");
      try {
        const res = await fetch(apiUrl("/api/auth/verify-email"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: vTok }),
        });
        const data = await readJsonResponse(res);
        if (cancelled) return;
        setMsg(
          `E-mail confirmé${data.email ? ` (${data.email})` : ""}. Vous pouvez vous connecter.`
        );
        setTab("login");
        window.location.hash = "#/compte";
        setHashTick((n) => n + 1);
      } catch (e) {
        if (!cancelled) setErr(String(e.message));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hashTick]);

  /** Anciens liens #/chauffeur, #/compte/conducteur → #/compte ; scroll GPS si demandé. */
  useEffect(() => {
    const h = window.location.hash.replace(/^#\/?/, "");
    const pathOnly = h.split("?")[0];
    const parts = pathOnly.split("/").filter(Boolean);
    const seg0 = parts[0] || "";
    const legacyConducteur =
      seg0 === "chauffeur" ||
      seg0 === "driver" ||
      ((seg0 === "compte" || seg0 === "account") && parts[1] === "conducteur");
    if (!legacyConducteur) return undefined;
    try {
      sessionStorage.setItem("accountScrollTraffic", "1");
    } catch {
      /* ignore */
    }
    const base = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", `${base}#/compte`);
    setHashTick((n) => n + 1);
    return undefined;
  }, [hashTick]);

  useEffect(() => {
    if (!me) return;
    let scroll = false;
    try {
      scroll = sessionStorage.getItem("accountScrollTraffic") === "1";
      if (scroll) sessionStorage.removeItem("accountScrollTraffic");
    } catch {
      /* ignore */
    }
    if (!scroll) return undefined;
    const id = requestAnimationFrame(() => {
      document.getElementById("traffic-gps")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [me]);

  const resetVehicleForm = useCallback(() => {
    setEditingVehicleId(null);
    setVCode("BUS-01");
    setVLine("W15");
    setVType("bus");
    setVDest("");
    setVDep("");
    setVArr("");
    setVOwnerEmail("");
  }, []);

  const loadVehicleIntoForm = useCallback((v) => {
    setEditingVehicleId(v.id);
    setVCode(v.vehicleCode || "");
    setVLine(v.line || "");
    setVType(v.vehicleType === "taxi" ? "taxi" : "bus");
    setVDest(v.destinationLabel ? String(v.destinationLabel) : "");
    setVDep(toDatetimeLocalValue(v.departureLocal));
    setVArr(toDatetimeLocalValue(v.arrivalLocal));
    setVOwnerEmail(v.ownerEmail ? String(v.ownerEmail) : "");
  }, []);

  const loadMe = useCallback(async (t) => {
    const tok = t ?? readToken();
    if (!tok) {
      setMe(null);
      return;
    }
    try {
      const res = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await readJsonResponse(res);
      setMe(data.user || null);
    } catch {
      setMe(null);
      try {
        localStorage.removeItem(AUTH_TOKEN_KEY);
      } catch {
        /* ignore */
      }
      setToken("");
    }
  }, []);

  useEffect(() => {
    loadMe(token);
  }, [token, loadMe]);

  const loadRegOptions = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/auth/registration-options"));
      const data = await readJsonResponse(res);
      setRegOptions({
        adminInviteConfigured: Boolean(data.adminInviteConfigured),
      });
    } catch {
      setRegOptions(null);
    }
  }, []);

  useEffect(() => {
    if (me) return;
    loadRegOptions();
  }, [me, loadRegOptions]);

  useEffect(() => {
    if (me || tab !== "register") return;
    loadRegOptions();
  }, [tab, me, loadRegOptions]);

  const authHeaders = (t) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${t || readToken()}`,
  });

  const loadAdminUsers = useCallback(async () => {
    const t = readToken();
    if (!t) return;
    try {
      const res = await fetch(apiUrl("/api/admin/users"), {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await readJsonResponse(res);
      setAdminUsers(data.users || []);
    } catch {
      setAdminUsers(null);
    }
  }, []);

  useEffect(() => {
    if (me?.role === "admin") loadAdminUsers();
    else setAdminUsers(null);
  }, [me, loadAdminUsers]);

  const loadVehicles = useCallback(async () => {
    const t = readToken();
    if (!t || !me || (me.role !== "driver" && me.role !== "admin")) {
      setVehicles([]);
      return;
    }
    try {
      const q = me.role === "admin" ? "?all=1" : "";
      const res = await fetch(apiUrl(`/api/vehicles${q}`), {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await readJsonResponse(res);
      setVehicles(data.vehicles || []);
    } catch {
      setVehicles([]);
    }
  }, [me]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles, token, me]);

  async function submitLogin(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(raw.slice(0, 160));
      }
      if (!res.ok) {
        if (data?.needsVerification) {
          setVerificationEmailHint(email.trim());
        }
        throw new Error(data?.error || res.status);
      }
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      setToken(data.token);
      setMe(data.user);
      setVerificationEmailHint("");
      setMsg("Connecté.");
      setPassword("");
    } catch (e) {
      setErr(String(e.message));
    }
  }

  async function submitRegister(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (password !== password2) {
      setErr("Les mots de passe ne correspondent pas.");
      return;
    }
    try {
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          role,
          adminInviteSecret:
            role === "admin" ? adminInvite.trim() : undefined,
        }),
      });
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(raw.slice(0, 160));
      }
      if (!res.ok) {
        if (data?.adminInviteMissingOnServer) void loadRegOptions();
        throw new Error(data?.error || res.status);
      }
      if (data.needsVerification) {
        setVerificationEmailHint(data.email || email.trim());
        setMsg(
          data.message ||
            "Un e-mail de confirmation vous a été envoyé. Ouvrez le lien, puis connectez-vous."
        );
        setPassword("");
        setPassword2("");
        setTab("login");
        return;
      }
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      setToken(data.token);
      setMe(data.user);
      setVerificationEmailHint("");
      setMsg("Compte créé et connecté.");
      setPassword("");
      setPassword2("");
    } catch (e) {
      setErr(String(e.message));
    }
  }

  async function logout() {
    const t = readToken();
    try {
      if (t) {
        await fetch(apiUrl("/api/auth/logout"), {
          method: "POST",
          headers: authHeaders(t),
        });
      }
    } catch {
      /* ignore */
    }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setToken("");
    setMe(null);
    setAdminUsers(null);
    setVerificationEmailHint("");
    setMsg("Déconnecté.");
  }

  return (
    <div className="account-shell">
      <header className="account-shell__head">
        <h1 className="account-shell__title">Mon compte</h1>
        <a className="account-shell__back" href="#/">
          Recherche trajet
        </a>
      </header>

      {!me ? (
        <>
          <div className="account-tabs">
            <button
              type="button"
              className={`account-tab ${tab === "login" ? "account-tab--on" : ""}`}
              onClick={() => setTab("login")}
            >
              Connexion
            </button>
            <button
              type="button"
              className={`account-tab ${tab === "register" ? "account-tab--on" : ""}`}
              onClick={() => setTab("register")}
            >
              Inscription
            </button>
          </div>

          {tab === "login" ? (
            <form className="account-card" onSubmit={submitLogin}>
              <p className="account-intro">
                Réservé aux <strong>conducteurs</strong> et{" "}
                <strong>administrateurs</strong> pour publier bus / taxi et
                horaires.
              </p>
              <label className="account-field">
                <span>E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label className="account-field">
                <span>Mot de passe</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button type="submit" className="account-btn">
                Se connecter
              </button>
              {verificationEmailHint ? (
                <div className="account-verify-resend">
                  <p className="account-verify-resend__txt">
                    Compte non confirmé pour <strong>{verificationEmailHint}</strong>.
                  </p>
                  <button
                    type="button"
                    className="account-btn account-btn--secondary"
                    onClick={async () => {
                      setErr("");
                      setMsg("");
                      try {
                        const res = await fetch(
                          apiUrl("/api/auth/resend-verification"),
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              email: verificationEmailHint,
                            }),
                          }
                        );
                        await readJsonResponse(res);
                        setMsg("Un nouvel e-mail de confirmation a été envoyé.");
                      } catch (e2) {
                        setErr(String(e2.message));
                      }
                    }}
                  >
                    Renvoyer l’e-mail de confirmation
                  </button>
                </div>
              ) : null}
            </form>
          ) : (
            <form className="account-card" onSubmit={submitRegister}>
              <p className="account-intro">
                <strong>Conducteur</strong> : après inscription, confirmez l’e-mail
                puis connectez-vous. <strong>Administrateur</strong> : compte actif
                tout de suite, avec un <strong>code d’invitation</strong> (voir
                encadré ci-dessous si vous choisissez « Administrateur »).
              </p>
              <label className="account-field">
                <span>E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label className="account-field">
                <span>Mot de passe (min. 6)</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </label>
              <label className="account-field">
                <span>Confirmer le mot de passe</span>
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="account-field">
                <span>Type de compte</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="account-select"
                >
                  <option value="driver">Conducteur (bus / taxi)</option>
                  <option value="admin">
                    Administrateur (code d’invitation requis)
                  </option>
                </select>
              </label>
              {role === "admin" ? (
                <div className="account-admin-invite">
                  {regOptions && !regOptions.adminInviteConfigured ? (
                    <div className="account-admin-invite__warn" role="status">
                      <p className="account-admin-invite__lead">
                        <strong>Étape 1 — opérateur du serveur</strong> : définir un
                        code secret, puis redémarrer l’API. Exemple (macOS / Linux) :
                      </p>
                      <pre className="account-admin-invite__pre">
                        {`export ADMIN_INVITE_SECRET='mon-code-secret-choisi'
npm start`}
                      </pre>
                      <p className="account-admin-invite__sub">
                        Windows (PowerShell) :{" "}
                        <code>
                          {`$env:ADMIN_INVITE_SECRET='mon-code-secret-choisi'`}
                        </code>{" "}
                        puis lancez Node depuis le dossier <code>backend</code>.
                      </p>
                      <p className="account-admin-invite__sub">
                        <strong>Étape 2 — vous</strong> : dans le champ ci-dessous,
                        saisissez <em>exactement</em> le même texte que entre les
                        guillemets (sans les guillemets si votre terminal ne les
                        utilise pas — le plus simple est de copier-coller la valeur
                        choisie par l’opérateur).
                      </p>
                    </div>
                  ) : null}
                  {regOptions?.adminInviteConfigured ? (
                    <p className="account-admin-invite__ok">
                      Ce serveur accepte la création d’un compte administrateur.
                      Demandez le <strong>code d’invitation</strong> à la personne qui
                      gère l’API : c’est la valeur de{" "}
                      <code>ADMIN_INVITE_SECRET</code> sur le serveur (reste
                      confidentielle).
                    </p>
                  ) : null}
                  <label className="account-field account-field--admin-invite">
                    <span>Code d’invitation administrateur</span>
                    <div className="account-admin-invite__field-row">
                      <input
                        className="account-admin-invite__input"
                        type={showAdminInviteCode ? "text" : "password"}
                        value={adminInvite}
                        onChange={(e) => setAdminInvite(e.target.value)}
                        placeholder="Même valeur que ADMIN_INVITE_SECRET sur le serveur"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="account-admin-invite__toggle"
                        onClick={() => setShowAdminInviteCode((v) => !v)}
                      >
                        {showAdminInviteCode ? "Masquer" : "Afficher"}
                      </button>
                    </div>
                    <span className="account-field__hint">
                      Respectez majuscules et minuscules ; les espaces en début et
                      fin sont ignorés.
                    </span>
                  </label>
                </div>
              ) : null}
              <button type="submit" className="account-btn">
                Créer le compte
              </button>
            </form>
          )}
        </>
      ) : (
        <div className="account-card account-card--logged">
          <p className="account-logged-as">
            Connecté : <strong>{me.email}</strong> ({me.role})
          </p>
          <div className="account-actions-row">
            <button type="button" className="account-btn account-btn--ghost" onClick={logout}>
              Déconnexion
            </button>
          </div>

          {(me.role === "driver" || me.role === "admin") && (
            <div className="account-vehicles" id="lignes-horaires">
              <h2 className="account-vehicles__title">Lignes, horaires et bus</h2>
              <p className="account-vehicles__hint">
                {me.role === "admin" ? (
                  <>
                    <strong>Administrateur</strong> : liste de <strong>tous</strong>{" "}
                    les bus enregistrés — création, modification (ligne, horaires,
                    code, conducteur) et suppression. Pour un nouveau bus, indiquez
                    l’e-mail du conducteur propriétaire.
                  </>
                ) : (
                  <>
                    Ajoutez un ou plusieurs véhicules, modifiez la ligne, les heures de
                    départ et d’arrivée, ou supprimez une fiche. La section « Position en
                    direct » plus bas reprend par défaut le premier véhicule pour le GPS.
                  </>
                )}
              </p>
              {editingVehicleId ? (
                <p className="account-vehicles__editing">
                  {me.role === "admin" ? (
                    <>
                      Modification du bus n°<strong>{editingVehicleId}</strong> — vous
                      pouvez changer le code, le conducteur propriétaire, la ligne et les
                      horaires.
                    </>
                  ) : (
                    <>
                      Modification du véhicule <strong>{vCode}</strong> — le code ne
                      peut pas être changé ici ; pour un autre bus, utilisez « Nouveau
                      véhicule ».
                    </>
                  )}
                  <button
                    type="button"
                    className="account-vehicles__new-link"
                    onClick={() => {
                      resetVehicleForm();
                      setMsg("");
                      setErr("");
                    }}
                  >
                    Nouveau véhicule
                  </button>
                </p>
              ) : null}
              <form
                className="account-vehicles__form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setErr("");
                  setMsg("");
                  if (
                    me.role === "admin" &&
                    (!vOwnerEmail.trim() || !vOwnerEmail.includes("@"))
                  ) {
                    setErr("Indiquez l’e-mail du conducteur propriétaire du bus.");
                    return;
                  }
                  const payload = {
                    vehicleCode: vCode.trim(),
                    line: vLine.trim(),
                    vehicleType: vType,
                    destinationLabel: vDest.trim() || null,
                    departureLocal: vDep ? vDep : null,
                    arrivalLocal: vArr ? vArr : null,
                  };
                  if (me.role === "admin") {
                    payload.ownerEmail = vOwnerEmail.trim();
                  }
                  try {
                    const isAdminEdit =
                      me.role === "admin" && editingVehicleId != null;
                    const res = await fetch(
                      isAdminEdit
                        ? apiUrl(`/api/vehicles/${editingVehicleId}`)
                        : apiUrl("/api/vehicles"),
                      {
                        method: isAdminEdit ? "PUT" : "POST",
                        headers: authHeaders(readToken()),
                        body: JSON.stringify(payload),
                      }
                    );
                    await readJsonResponse(res);
                    setMsg(
                      editingVehicleId
                        ? "Bus mis à jour."
                        : "Bus enregistré."
                    );
                    resetVehicleForm();
                    await loadVehicles();
                  } catch (e2) {
                    setErr(String(e2.message));
                  }
                }}
              >
                {me.role === "admin" ? (
                  <label className="account-field">
                    <span>Conducteur propriétaire (e-mail)</span>
                    <input
                      type="email"
                      value={vOwnerEmail}
                      onChange={(e) => setVOwnerEmail(e.target.value)}
                      placeholder="ex. conducteur@example.com"
                      autoComplete="off"
                      required
                    />
                    <span className="account-field__hint">
                      Compte conducteur existant (même e-mail qu’à l’inscription).
                    </span>
                  </label>
                ) : null}
                <label className="account-field">
                  <span>Code véhicule (identifiant)</span>
                  <input
                    value={vCode}
                    onChange={(e) => setVCode(e.target.value)}
                    required
                    readOnly={
                      editingVehicleId != null && me.role !== "admin"
                    }
                    title={
                      editingVehicleId && me.role !== "admin"
                        ? "Pour un autre code, créez un nouveau véhicule."
                        : undefined
                    }
                  />
                </label>
                <label className="account-field">
                  <span>Ligne / service</span>
                  <input
                    value={vLine}
                    onChange={(e) => setVLine(e.target.value)}
                    required
                    placeholder="ex. W15"
                  />
                </label>
                <label className="account-field">
                  <span>Type</span>
                  <select
                    className="account-select"
                    value={vType}
                    onChange={(e) => setVType(e.target.value)}
                  >
                    <option value="bus">Bus</option>
                    <option value="taxi">Taxi</option>
                  </select>
                </label>
                <label className="account-field">
                  <span>Destination affichée</span>
                  <input
                    value={vDest}
                    onChange={(e) => setVDest(e.target.value)}
                    placeholder="ex. Azazga"
                  />
                </label>
                <label className="account-field">
                  <span>Départ (heure locale)</span>
                  <input
                    type="datetime-local"
                    value={vDep}
                    onChange={(e) => setVDep(e.target.value)}
                  />
                </label>
                <label className="account-field">
                  <span>Arrivée (heure locale)</span>
                  <input
                    type="datetime-local"
                    value={vArr}
                    onChange={(e) => setVArr(e.target.value)}
                  />
                </label>
                <button type="submit" className="account-btn account-btn--secondary">
                  {editingVehicleId
                    ? "Enregistrer les modifications"
                    : "Ajouter le véhicule"}
                </button>
              </form>

              {vehicles.length > 0 ? (
                <ul className="account-vehicles__list">
                  {vehicles.map((v) => (
                    <li key={v.id} className="account-vehicles__row">
                      <div className="account-vehicles__body">
                        <span className="account-vehicles__id">#{v.id}</span>{" "}
                        <strong>{v.vehicleCode}</strong> — {v.line} ({v.vehicleType})
                        {v.destinationLabel ? (
                          <div className="account-vehicles__meta">{v.destinationLabel}</div>
                        ) : null}
                        {(v.departureLocal || v.arrivalLocal) && (
                          <div className="account-vehicles__meta">
                            {v.departureLocal ? `Départ : ${v.departureLocal}` : ""}
                            {v.departureLocal && v.arrivalLocal ? " · " : ""}
                            {v.arrivalLocal ? `Arrivée : ${v.arrivalLocal}` : ""}
                          </div>
                        )}
                        {me.role === "admin" ? (
                          <div className="account-vehicles__meta account-vehicles__owner">
                            Propriétaire : {v.ownerEmail}
                          </div>
                        ) : null}
                      </div>
                      <div className="account-vehicles__actions">
                        <button
                          type="button"
                          className="account-vehicles__edit"
                          onClick={() => {
                            setErr("");
                            loadVehicleIntoForm(v);
                            setMsg("");
                            document.getElementById("lignes-horaires")?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="account-vehicles__del"
                          onClick={async () => {
                            if (!window.confirm("Supprimer ce véhicule ?")) return;
                            try {
                              const res = await fetch(apiUrl(`/api/vehicles/${v.id}`), {
                                method: "DELETE",
                                headers: { Authorization: `Bearer ${readToken()}` },
                              });
                              await readJsonResponse(res);
                              if (editingVehicleId === v.id) resetVehicleForm();
                              await loadVehicles();
                              setMsg("Véhicule supprimé.");
                            } catch (e2) {
                              setErr(String(e2.message));
                            }
                          }}
                        >
                          Supprimer
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="account-vehicles__empty">Aucun véhicule enregistré.</p>
              )}
            </div>
          )}

          {(me.role === "driver" || me.role === "admin") && (
            <div className="account-conducteur-wrap">
              <h2 className="account-conducteur-wrap__title">
                Position en direct (carte & flotte)
              </h2>
              <ConducteurPanel />
            </div>
          )}

          {me.role === "admin" && adminUsers ? (
            <div className="account-admin">
              <h2 className="account-admin__title">Comptes enregistrés</h2>
              <ul className="account-admin__list">
                {adminUsers.map((u) => (
                  <li key={u.email}>
                    {u.email} — {u.role}
                    {u.emailVerified === false ? (
                      <span className="account-admin__pending"> (e-mail non confirmé)</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {msg && <p className="account-msg account-msg--ok">{msg}</p>}
      {err && <p className="account-msg account-msg--err">{err}</p>}
    </div>
  );
}
