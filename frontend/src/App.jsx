import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import RouteMap from "./RouteMap.jsx";
import Reklam from "./Reklam.jsx";
import TripSuggestionList from "./TripSuggestionList.jsx";
import JourneyBottomSheet from "./JourneyBottomSheet.jsx";
import {
  IconChevronLeft,
  IconSliders,
  IconSwapVertical,
} from "./VtIcons.jsx";
import { apiUrl, fetchApiJson } from "./apiBase.js";
import {
  LOCAL_LOCATION_RESULTS,
  SEED_LOCATION_RESULTS,
  matchKnownPlaceGid,
} from "./seedPlaces.js";

function useDebounced(value, ms) {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

function serviceAlertLabel(alert) {
  return {
    ok: "Service normal",
    info: "Information",
    delay: "Retard",
    issue: "Problème signalé",
    cancelled: "Bus hors service",
  }[alert || "ok"];
}

function serviceAlertClass(alert) {
  return ["delay", "issue", "cancelled"].includes(alert)
    ? ` vt-bus-info__status--${alert}`
    : "";
}

function servicePriority(alert) {
  return { cancelled: 4, issue: 3, delay: 2, info: 1, ok: 0 }[alert] || 0;
}

function buildBusInfoFromVehicles(vehicles, visibleLines) {
  const wanted = new Set(visibleLines.map((line) => line.toUpperCase()));
  const byLine = new Map();
  for (const vehicle of vehicles || []) {
    const line = String(vehicle.line || "").trim().toUpperCase();
    if (!line || (wanted.size && !wanted.has(line))) continue;
    const row = byLine.get(line) || {
      line,
      registered: true,
      available: false,
      busCount: 0,
      activeCount: 0,
      serviceAlert: "ok",
      serviceNote: "",
      buses: [],
    };
    const alert = vehicle.available === false ? "cancelled" : vehicle.serviceAlert || "ok";
    row.busCount += 1;
    if (vehicle.available !== false) row.activeCount += 1;
    if (servicePriority(alert) > servicePriority(row.serviceAlert)) {
      row.serviceAlert = alert;
    }
    if (!row.serviceNote && vehicle.serviceNote) row.serviceNote = vehicle.serviceNote;
    row.buses.push(vehicle);
    byLine.set(line, row);
  }
  return [...byLine.values()]
    .map((line) => ({
      ...line,
      available: line.activeCount > 0,
      serviceAlert: line.activeCount > 0 ? line.serviceAlert : "cancelled",
      serviceNote:
        line.serviceNote ||
        (line.activeCount > 0
          ? ""
          : "Bus non disponible pour le moment."),
    }))
    .sort((a, b) => a.line.localeCompare(b.line));
}

export default function App() {
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [originGid, setOriginGid] = useState("");
  const [destGid, setDestGid] = useState("");
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [tripBundle, setTripBundle] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [busInfoOpen, setBusInfoOpen] = useState(false);
  const [busInfoLines, setBusInfoLines] = useState([]);
  const [busInfoLoading, setBusInfoLoading] = useState(false);
  const [busInfoError, setBusInfoError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const debOrigin = useDebounced(originText, 280);
  const debDest = useDebounced(destText, 280);

  /** Layout carte : avant peinture pour éviter une frame sans hauteur. */
  useLayoutEffect(() => {
    const tripOpen = Boolean(selectedTrip && tripBundle);
    document.documentElement.classList.toggle("vt-trip-page", tripOpen);
    return () => document.documentElement.classList.remove("vt-trip-page");
  }, [selectedTrip, tripBundle]);

  const fetchSuggestions = useCallback(async (q, which) => {
    const t = q.trim();
    if (t.length < 1) {
      return;
    }
    try {
      const data = await fetchApiJson(
        apiUrl(`/api/locations?q=${encodeURIComponent(t)}`)
      );
      const list = data.results || [];
      if (which === "o") setOriginSuggestions(list);
      else setDestSuggestions(list);
    } catch {
      if (which === "o") setOriginSuggestions([]);
      else setDestSuggestions([]);
    }
  }, []);

  const applySeedSuggestions = useCallback((which) => {
    if (which === "o") setOriginSuggestions(SEED_LOCATION_RESULTS);
    else setDestSuggestions(SEED_LOCATION_RESULTS);
  }, []);

  useEffect(() => {
    if (originGid) return;
    if (debOrigin.trim().length < 1) return;
    fetchSuggestions(debOrigin, "o");
  }, [debOrigin, originGid, fetchSuggestions]);

  useEffect(() => {
    if (destGid) return;
    if (debDest.trim().length < 1) return;
    fetchSuggestions(debDest, "d");
  }, [debDest, destGid, fetchSuggestions]);

  const pickOrigin = (item) => {
    const gid = item.gid ?? item.id ?? "";
    setOriginText(item.name);
    setOriginGid(String(gid));
    setOriginSuggestions([]);
    setTripBundle(null);
    setSelectedTrip(null);
  };

  const pickDest = (item) => {
    const gid = item.gid ?? item.id ?? "";
    setDestText(item.name);
    setDestGid(String(gid));
    setDestSuggestions([]);
    setTripBundle(null);
    setSelectedTrip(null);
  };

  function swapFromTo() {
    const t = originText;
    const g = originGid;
    setOriginText(destText);
    setOriginGid(destGid);
    setDestText(t);
    setDestGid(g);
    setOriginSuggestions([]);
    setDestSuggestions([]);
    setTripBundle(null);
    setSelectedTrip(null);
  }

  function normName(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u2019/g, "'")
      .trim()
      .toLowerCase();
  }

  async function resolveGidFromText(text, currentGid) {
    if (currentGid) return currentGid;
    const t = text.trim();
    if (t.length < 1) return "";
    const nt = normName(t);
    if (nt === "depart" || nt === "arrivee") return "";

    const localGid = matchKnownPlaceGid(nt, LOCAL_LOCATION_RESULTS);
    if (localGid) return localGid;

    let list = [];
    try {
      const data = await fetchApiJson(
        apiUrl(`/api/locations?q=${encodeURIComponent(t)}`)
      );
      list = data.results || [];
    } catch {
      return "";
    }

    return matchKnownPlaceGid(nt, list);
  }

  const searchTrips = async () => {
    setError("");
    setSelectedTrip(null);
    let og = originGid;
    let dg = destGid;
    if (!og) og = await resolveGidFromText(originText, og);
    if (!dg) dg = await resolveGidFromText(destText, dg);
    if (!og || !dg) {
      setError(
        "Impossible d’identifier le départ et l’arrivée. Choisissez une ligne dans chaque liste, ou saisissez le nom d’une ville de la liste. Pour d’autres lieux, l’API doit répondre (port 4000)."
      );
      return;
    }
    setLoading(true);
    try {
      const data = await fetchApiJson(
        apiUrl(
          `/api/journey-trips?originGid=${encodeURIComponent(
            og
          )}&destinationGid=${encodeURIComponent(
            dg
          )}&originLabel=${encodeURIComponent(
            originText
          )}&destLabel=${encodeURIComponent(destText)}`
        )
      );
      setOriginGid(og);
      setDestGid(dg);
      setTripBundle(data);
    } catch (e) {
      setError(String(e.message));
    } finally {
      setLoading(false);
    }
  };

  async function loadBusInfo() {
    setBusInfoError("");
    setBusInfoLoading(true);
    const lines = [
      ...new Set(
        (tripBundle?.trips || [])
          .flatMap((trip) => trip.busLines || [])
          .map((line) => String(line).trim())
          .filter(Boolean)
      ),
    ];
    try {
      const data = await fetchApiJson(apiUrl("/api/vehicles"));
      setBusInfoLines(buildBusInfoFromVehicles(data.vehicles || [], lines));
    } catch {
      setBusInfoError(
        "Impossible de charger les infos écrites par les conducteurs. Vérifiez que l’API est démarrée."
      );
      setBusInfoLines([]);
    } finally {
      setBusInfoLoading(false);
    }
  }

  function toggleBusInfo() {
    const next = !busInfoOpen;
    setBusInfoOpen(next);
    if (next) void loadBusInfo();
  }

  useEffect(() => {
    const bounds = selectedTrip && tripBundle?.positionBounds;
    if (!bounds) {
      setVehicles([]);
      return undefined;
    }

    let cancelled = false;
    const lines =
      tripBundle.pollLineDesignations ?? tripBundle.lineDesignations ?? [];

    const loadVehicles = async () => {
      const params = new URLSearchParams();
      params.set("lowerLeftLat", String(bounds.lowerLeftLat));
      params.set("lowerLeftLong", String(bounds.lowerLeftLong));
      params.set("upperRightLat", String(bounds.upperRightLat));
      params.set("upperRightLong", String(bounds.upperRightLong));
      for (const l of lines) {
        params.append("lineDesignations", l);
      }
      try {
        const data = await fetchApiJson(
          apiUrl(`/api/vehicle-positions?${params.toString()}`)
        );
        if (!cancelled) setVehicles(data.vehicles ?? []);
      } catch {
        if (!cancelled) setVehicles([]);
      }
    };

    loadVehicles();
    const id = setInterval(loadVehicles, 9000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedTrip, tripBundle]);

  if (selectedTrip && tripBundle) {
    return (
      <div className="vt-detail-root">
        <header className="vt-top-bar">
          <button
            type="button"
            className="vt-top-bar__back"
            onClick={() => setSelectedTrip(null)}
            aria-label="Retour aux propositions"
          >
            <IconChevronLeft />
          </button>
          <h1 className="vt-top-bar__title">Trajet</h1>
          <span className="vt-top-bar__spacer" />
        </header>
        <div className="vt-map-stack">
          <RouteMap
            variant="detail"
            routeLegs={selectedTrip.legs}
            markers={tripBundle.markers}
            stops={[]}
            vehicles={vehicles}
            line={[]}
          />
        </div>
        <JourneyBottomSheet
          trip={selectedTrip}
          originLabel={tripBundle.originLabel}
          destLabel={tripBundle.destLabel}
          onClose={() => setSelectedTrip(null)}
        />
      </div>
    );
  }

  return (
    <div className="vt-shell">
      <header className="vt-app-bar">
        <button
          type="button"
          className="vt-app-bar__iconbtn"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
          }}
          aria-label="Retour"
        >
          <IconChevronLeft />
        </button>
        <h1 className="vt-app-bar__title">Rechercher un trajet</h1>
        <div className="vt-app-bar__actions">
          <a className="vt-app-bar__account" href="#/compte">
            Mon compte
          </a>
        </div>
      </header>

      <main className="vt-scroll">
        <div className="vt-search-card">
          <div className="vt-search-card__grid">
            <div className="vt-search-card__fields">
              <label className="vt-field" htmlFor="from">
                <span className="vt-field__lbl">Départ</span>
                <input
                  id="from"
                  className="vt-field__input"
                  value={originText}
                  onChange={(e) => {
                    const v = e.target.value;
                    setOriginText(v);
                    setOriginGid("");
                    setTripBundle(null);
                    if (v.trim().length < 1) setOriginSuggestions([]);
                  }}
                  onPointerDown={() => {
                    if (originText.trim().length < 1) {
                      applySeedSuggestions("o");
                    }
                  }}
                  onFocus={() => {
                    const t = originText.trim();
                    if (t.length < 1) {
                      applySeedSuggestions("o");
                    } else {
                      void fetchSuggestions(originText, "o");
                    }
                  }}
                  placeholder="Ville ou arrêt, ex. Tizi Ouzou"
                  autoComplete="off"
                />
              </label>
              <div className="vt-field-divider" />
              <label className="vt-field" htmlFor="to">
                <span className="vt-field__lbl">Arrivée</span>
                <input
                  id="to"
                  className="vt-field__input"
                  value={destText}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDestText(v);
                    setDestGid("");
                    setTripBundle(null);
                    if (v.trim().length < 1) setDestSuggestions([]);
                  }}
                  onPointerDown={() => {
                    if (destText.trim().length < 1) {
                      applySeedSuggestions("d");
                    }
                  }}
                  onFocus={() => {
                    const t = destText.trim();
                    if (t.length < 1) {
                      applySeedSuggestions("d");
                    } else {
                      void fetchSuggestions(destText, "d");
                    }
                  }}
                  placeholder="Ville de destination, ex. Alger"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="vt-search-card__tools">
              <button
                type="button"
                className="vt-tool-btn"
                title="Infos bus"
                aria-label="Infos bus"
                onClick={toggleBusInfo}
              >
                <IconSliders />
              </button>
              <button
                type="button"
                className="vt-tool-btn"
                onClick={swapFromTo}
                aria-label="Échanger départ et arrivée"
              >
                <IconSwapVertical />
              </button>
            </div>
          </div>
        </div>

        {busInfoOpen ? (
          <section className="vt-bus-info" aria-live="polite">
            <div className="vt-bus-info__head">
              <strong>Infos bus urgentes</strong>
              <button type="button" onClick={() => void loadBusInfo()}>
                Actualiser
              </button>
            </div>
            {busInfoLoading ? <p>Chargement des infos bus…</p> : null}
            {busInfoError ? <p className="vt-bus-info__error">{busInfoError}</p> : null}
            {!busInfoLoading && !busInfoLines.length && !busInfoError ? (
              <p>Aucune info urgente publiée pour le moment.</p>
            ) : null}
            {busInfoLines.length ? (
              <ul className="vt-bus-info__list">
                {busInfoLines.map((line) => (
                  <li
                    key={line.line}
                    className={`vt-bus-info__item${
                      line.available ? "" : " vt-bus-info__item--offline"
                    }`}
                  >
                    <div className="vt-bus-info__row">
                      <strong>Ligne {line.line}</strong>
                      <span
                        className={`vt-bus-info__status${serviceAlertClass(
                          line.serviceAlert
                        )}`}
                      >
                        {line.available
                          ? serviceAlertLabel(line.serviceAlert)
                          : "Bus hors service"}
                      </span>
                    </div>
                    <p>
                      {line.serviceNote ||
                        (line.available
                          ? `${line.activeCount}/${line.busCount || line.activeCount} bus en service.`
                          : "Cette ligne est gelée par l’administrateur.")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {originSuggestions.length > 0 && (
          <>
            <p className="vt-sug-hint" id="origin-sug-label">
              Suggestions — Départ
            </p>
            <ul
              className="suggestions suggestions--vt"
              role="listbox"
              aria-labelledby="origin-sug-label"
            >
              {originSuggestions.map((item, i) => (
                <li
                  key={item.gid ?? item.id ?? i}
                  role="option"
                  tabIndex={0}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickOrigin(item)}
                >
                  {item.name}
                </li>
              ))}
            </ul>
          </>
        )}

        {destSuggestions.length > 0 && (
          <>
            <p className="vt-sug-hint" id="dest-sug-label">
              Suggestions — Arrivée
            </p>
            <ul
              className="suggestions suggestions--vt"
              role="listbox"
              aria-labelledby="dest-sug-label"
            >
              {destSuggestions.map((item, i) => (
                <li
                  key={item.gid ?? item.id ?? i}
                  role="option"
                  tabIndex={0}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickDest(item)}
                >
                  {item.name}
                </li>
              ))}
            </ul>
          </>
        )}

        <button type="button" className="vt-link-history">
          <span className="vt-link-history__ic" aria-hidden="true">
            ↻
          </span>
          Charger les trajets précédents
        </button>

        {error && <div className="error-banner error-banner--vt">{error}</div>}

        <button
          type="button"
          className="vt-btn-search"
          disabled={loading}
          onClick={searchTrips}
        >
          {loading ? "…" : "Rechercher"}
        </button>

        {!originGid || !destGid ? (
          <p className="vt-hint">
            Choisissez départ et arrivée, puis « Rechercher ». Inversez le sens avec les flèches à droite.
          </p>
        ) : null}

        <TripSuggestionList
          trips={tripBundle?.trips}
          onSelect={(trip) => setSelectedTrip(trip)}
        />

        <div className="reklam-section vt-reklam-section">
          <Reklam />
        </div>

        <p className="vt-driver-foot">
          <a href="#/compte">Mon compte</a> — bus, ligne, horaires et position
        </p>
      </main>

    </div>
  );
}
