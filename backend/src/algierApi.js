/**
 * El Mousafar — demo-API för hållplatser i wilaya Tizi Ouzou (Kabylie)
 * samt geokodning via OSM Nominatim för andra städer/byar i Algeriet.
 */

const PLACES = [
  { id: "dz-tizi-centre", name: "Tizi Ouzou (centre-ville)", lat: 36.7118, lon: 4.0457 },
  { id: "dz-tizi-gare", name: "Gare routière Tizi Ouzou", lat: 36.7164, lon: 4.0489 },
  { id: "dz-alger", name: "Alger", lat: 36.7538, lon: 3.0588 },
  { id: "dz-bejaia", name: "Béjaïa", lat: 36.7511, lon: 5.0836 },
  { id: "dz-constantine", name: "Constantine", lat: 36.365, lon: 6.6147 },
  { id: "dz-setif", name: "Sétif", lat: 36.1911, lon: 5.4137 },
  { id: "dz-boumerdes", name: "Boumerdès", lat: 36.7664, lon: 3.4778 },
  { id: "dz-blida", name: "Blida", lat: 36.47, lon: 2.827 },
  { id: "dz-oran", name: "Oran", lat: 35.697, lon: -0.633 },
  { id: "dz-jijel", name: "Jijel", lat: 36.8206, lon: 5.7667 },
  { id: "dz-azazga", name: "Azazga", lat: 36.7445, lon: 4.3694 },
  { id: "dz-draa-mizan", name: "Draâ El Mizan", lat: 36.5361, lon: 3.8333 },
  {
    id: "dz-larbaa-nath-irathen",
    name: "Larbaâ Nath Irathen",
    lat: 36.6347,
    lon: 4.2067,
  },
  { id: "dz-mekla", name: "Mekla", lat: 36.6811, lon: 4.2636 },
  { id: "dz-ain-el-hammam", name: "Aïn El Hammam", lat: 36.5689, lon: 4.3069 },
  { id: "dz-tizi-rached", name: "Tizi Rached", lat: 36.6717, lon: 4.1919 },
  { id: "dz-freha", name: "Freha", lat: 36.7528, lon: 4.3208 },
  { id: "dz-akbou", name: "Akbou", lat: 36.5286, lon: 4.5344 },
  { id: "dz-timizart", name: "Timizart", lat: 36.8, lon: 4.233 },
  { id: "dz-boghni", name: "Boghni", lat: 36.543, lon: 3.953 },
];

const NOM_USER_AGENT =
  "ElMousafar/1.0 (reseplan-demo; https://nominatim.org/usage-policy)";

/** Kabylie / wilaya 15 — prioriterar träffar här utan att stänga ute övriga DZ. */
const NOM_VIEWBOX = "3.55,37.12,4.95,36.42";

const nominatimCache = new Map();
const CACHE_MS = 5 * 60 * 1000;
let nominatimQueue = Promise.resolve();

async function withNominatimSlot(fn) {
  const next = nominatimQueue.then(async () => {
    await new Promise((r) => setTimeout(r, 1100));
    return fn();
  });
  nominatimQueue = next.catch(() => {});
  return next;
}

function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toResult(p) {
  return {
    name: p.name,
    gid: p.id,
    lat: p.lat,
    lon: p.lon,
  };
}

/** gid från Nominatim: geo:<lat>,<lon> (URL-kodas i frontend). */
export function parseGeoGid(id) {
  const m = String(id).match(/^geo:([\d.-]+),([\d.-]+)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function resolvePlace(id) {
  const fromList = PLACES.find((p) => p.id === id);
  if (fromList) return { ...fromList };
  const g = parseGeoGid(id);
  if (g) return { id, lat: g.lat, lon: g.lon, name: "" };
  return null;
}

function almostSameCoords(a, b) {
  return (
    Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5
  );
}

function shortDisplayName(row) {
  if (row.name && String(row.name).trim()) {
    return String(row.name).trim();
  }
  const d = String(row.display_name || "");
  const parts = d.split(",").map((s) => s.trim());
  return parts.slice(0, 2).join(", ") || d || "Plats";
}

/** Prioriterar städer/orter (Nominatim class=place) framför gator, adresser och POI. */
function sortNominatimBySettlement(rows) {
  const typeRank = {
    city: 0,
    town: 1,
    municipality: 2,
    village: 3,
    hamlet: 4,
    suburb: 5,
    neighbourhood: 6,
    quarter: 7,
    locality: 8,
    isolated_dwelling: 9,
    farm: 10,
  };
  const lowPriorityClass = new Set([
    "highway",
    "building",
    "amenity",
    "shop",
    "tourism",
    "historic",
    "railway",
    "aeroway",
    "boundary",
  ]);
  function group(row) {
    const cls = String(row.class || "");
    if (cls === "place") return 0;
    if (lowPriorityClass.has(cls)) return 2;
    return 1;
  }
  return [...rows].sort((a, b) => {
    const gA = group(a);
    const gB = group(b);
    if (gA !== gB) return gA - gB;
    if (gA === 0) {
      const typA = String(a.type || "");
      const typB = String(b.type || "");
      const pA = typA in typeRank ? typeRank[typA] : 50;
      const pB = typB in typeRank ? typeRank[typB] : 50;
      if (pA !== pB) return pA - pB;
    }
    const impA = Number(a.importance) || 0;
    const impB = Number(b.importance) || 0;
    return impB - impA;
  });
}

async function nominatimFetchJson(query, limit) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "dz");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("viewbox", NOM_VIEWBOX);
  url.searchParams.set("bounded", "0");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": NOM_USER_AGENT,
      "Accept-Language": "fr,ar,en",
    },
  });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

/**
 * OSM Nominatim (max ~1 req/s — seriell kö + cache).
 * https://operations.osmfoundation.org/policies/nominatim/
 */
async function nominatimSearch(query, want) {
  const key = norm(query);
  if (key.length < 2) return [];

  const cached = nominatimCache.get(key);
  if (cached && Date.now() - cached.t < CACHE_MS) {
    return cached.results;
  }

  return withNominatimSlot(async () => {
    const again = nominatimCache.get(key);
    if (again && Date.now() - again.t < CACHE_MS) {
      return again.results;
    }
    const fetchLimit = Math.max(want + 16, 20);
    const rowsRaw = await nominatimFetchJson(query, fetchLimit);
    const rows = sortNominatimBySettlement(rowsRaw);
    const out = [];
    const seen = new Set();
    for (const row of rows) {
      const lat = parseFloat(row.lat);
      const lon = parseFloat(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const name = shortDisplayName(row);
      const gid = `geo:${lat},${lon}`;
      const dedupe = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({
        name,
        gid,
        lat,
        lon,
        display_name: row.display_name || name,
      });
      if (out.length >= want) break;
    }
    nominatimCache.set(key, { t: Date.now(), results: out });
    return out;
  });
}

function mergeDedupeLocalFirst(local, remote, limit) {
  const merged = [...local];
  const seen = new Set(local.map((r) => `${r.lat?.toFixed(4)},${r.lon?.toFixed(4)}`));
  for (const r of remote) {
    const k = `${Number(r.lat).toFixed(4)},${Number(r.lon).toFixed(4)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push({
      name: r.name,
      gid: r.gid,
      lat: r.lat,
      lon: r.lon,
      display_name: r.display_name,
    });
    if (merged.length >= limit) break;
  }
  return merged.slice(0, limit);
}

/** Förslag utan sökning — städer och orter i Kabylie + större städer i DZ. */
export function featuredPlaces(limit = 14) {
  return PLACES.slice(0, limit).map(toResult);
}

export function searchPlaces(query, limit = 12) {
  const q = norm(query.trim());
  if (q.length < 1) return [];
  return PLACES.filter(
    (p) => norm(p.name).includes(q) || norm(p.id).includes(q)
  )
    .slice(0, limit)
    .map(toResult);
}

/**
 * Lokala hållplatser + Nominatim (städer, byar, stadsdelar i Algeriet).
 */
export async function searchPlacesRemote(query, limit = 12) {
  const qTrim = String(query || "").trim();
  const local = searchPlaces(qTrim, limit);
  const nq = norm(qTrim);
  /** Nominatim från 3 tecken, eller 2 om inget lokalt hittas (t.ex. by utanför listan). */
  const wantRemote =
    local.length < limit &&
    (nq.length >= 3 || (nq.length >= 2 && local.length === 0));
  if (!wantRemote) {
    return local.slice(0, limit);
  }
  try {
    const need = limit - local.length;
    const remote = await nominatimSearch(qTrim, Math.max(need, 6));
    return mergeDedupeLocalFirst(local, remote, limit);
  } catch {
    return local.slice(0, limit);
  }
}

function interpolateLine(a, b, steps = 24) {
  const line = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    line.push([
      a.lat + t * (b.lat - a.lat),
      a.lon + t * (b.lon - a.lon),
    ]);
  }
  return line;
}

/**
 * OSRM (driving) : géométrie + durée et distance réelles sur le réseau routier.
 * https://project-osrm.org/ — serveur public, à remplacer en production.
 */
async function fetchOsrmDrivingRoute(a, b) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": NOM_USER_AGENT },
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (j.code !== "Ok" || !j.routes?.[0]?.geometry?.coordinates?.length) {
      return null;
    }
    const route = j.routes[0];
    const coords = route.geometry.coordinates;
    if (coords.length < 2) return null;
    return {
      line: coords.map(([lng, lat]) => [lat, lng]),
      durationSec: Number(route.duration) || 0,
      distanceM: Number(route.distance) || 0,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function bboxFromLine(line, ratio = 0.12) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [lat, lon] of line) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }
  const spanLat = Math.max(maxLat - minLat, 0.008);
  const spanLon = Math.max(maxLon - minLon, 0.008);
  const padLat = spanLat * ratio + 0.004;
  const padLon = spanLon * ratio + 0.004;
  return {
    lowerLeftLat: minLat - padLat,
    lowerLeftLong: minLon - padLon,
    upperRightLat: maxLat + padLat,
    upperRightLong: maxLon + padLon,
  };
}

export function vehiclesAlongRoute(line, seed = 0) {
  if (!line || line.length < 2) return [];
  const t = (Date.now() / 1000 + seed) % 140;
  const u = t / 140;
  const idx = Math.min(
    line.length - 2,
    Math.floor(u * (line.length - 1))
  );
  const f = u * (line.length - 1) - idx;
  const [la0, lo0] = line[idx];
  const [la1, lo1] = line[idx + 1];
  const lat = la0 + f * (la1 - la0);
  const lon = lo0 + f * (lo1 - lo0);
  const u2 = (u + 0.35) % 1;
  const idx2 = Math.min(
    line.length - 2,
    Math.floor(u2 * (line.length - 1))
  );
  const f2 = u2 * (line.length - 1) - idx2;
  const [la0b, lo0b] = line[idx2];
  const [la1b, lo1b] = line[idx2 + 1];
  return [
    { id: "w15-bus-1", lat, lon, line: "W15" },
    {
      id: "w15-bus-2",
      lat: la0b + f2 * (la1b - la0b),
      lon: lo0b + f2 * (lo1b - lo0b),
      line: "W15",
    },
  ];
}

function haversineKm(a, b) {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function lineLengthKm(line) {
  let km = 0;
  for (let i = 1; i < line.length; i++) {
    km += haversineKm(line[i - 1], line[i]);
  }
  return km;
}

function sliceLineByT(line, tStart, tEnd) {
  const n = line.length;
  if (n < 2) return line.length ? [...line] : [];
  const i0 = Math.max(0, Math.floor(tStart * (n - 1)));
  const i1 = Math.min(n - 1, Math.ceil(tEnd * (n - 1)));
  const slice = line.slice(i0, Math.max(i0 + 1, i1 + 1));
  if (slice.length < 2 && slice.length === 1) {
    return [slice[0], slice[0]];
  }
  return slice;
}

function clockPair(durationMin, offsetMin) {
  const now = new Date();
  const dep = new Date(now.getTime() + (8 + offsetMin) * 60 * 1000);
  const arr = new Date(dep.getTime() + durationMin * 60 * 1000);
  const fmt = (d) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { dep: fmt(dep), arr: fmt(arr) };
}

export async function buildJourneyPayload(
  originId,
  destinationId,
  originLabel,
  destLabel
) {
  const a = resolvePlace(originId);
  const b = resolvePlace(destinationId);
  if (!a || !b) {
    throw new Error(
      "Lieu introuvable — choisissez une suggestion dans la liste ou précisez la saisie (au moins 3 caractères pour la recherche)."
    );
  }
  if (a.id === b.id || almostSameCoords(a, b)) {
    throw new Error("Choisissez deux lieux différents.");
  }

  const labelA = originLabel?.trim() || a.name || "Départ";
  const labelB = destLabel?.trim() || b.name || "Arrivée";

  const osrm = await fetchOsrmDrivingRoute(
    { lat: a.lat, lon: a.lon },
    { lat: b.lat, lon: b.lon }
  );
  const line =
    osrm?.line && osrm.line.length >= 2 ? osrm.line : interpolateLine(a, b, 36);
  const osrmDriveMinutes =
    osrm && osrm.durationSec > 0
      ? Math.max(1, Math.round(osrm.durationSec / 60))
      : null;
  const osrmDistanceKm =
    osrm && osrm.distanceM > 0 ? osrm.distanceM / 1000 : null;

  const stops = [0.25, 0.5, 0.75].map((t) => {
    const i = Math.round(t * (line.length - 1));
    const [lat, lon] = line[i];
    return { lat, lon, minutes: 3, name: "" };
  });

  const positionBounds = bboxFromLine(line);
  const vehicles = vehiclesAlongRoute(line);

  return {
    originLabel: labelA,
    destLabel: labelB,
    line,
    osrmDriveMinutes,
    osrmDistanceKm,
    markers: [
      { lat: a.lat, lon: a.lon, label: labelA, role: "origin" },
      { lat: b.lat, lon: b.lon, label: labelB, role: "destination" },
    ],
    stops,
    positionBounds,
    lineDesignations: ["W15"],
    pollLineDesignations: [],
    vehicles,
  };
}

/**
 * Flera reseförslag (demo) med sträckor längs samma väg — inspirerat av kollektivtrafik-UI.
 */
export async function buildTripSuggestions(
  originId,
  destinationId,
  originLabel,
  destLabel
) {
  const base = await buildJourneyPayload(
    originId,
    destinationId,
    originLabel,
    destLabel
  );
  const {
    line,
    markers,
    originLabel: oL,
    destLabel: dL,
    positionBounds,
    osrmDriveMinutes,
    osrmDistanceKm,
  } = base;
  const fromStop = `${oL} — arrêt principal`;
  const toStop = dL;
  const km = osrmDistanceKm ?? lineLengthKm(line);
  /** Durée trajet : OSRM (réel) + marge accès arrêt ; sinon estimation vitesse moyenne. */
  const baseMin =
    osrmDriveMinutes != null
      ? Math.max(18, Math.min(200, Math.round(osrmDriveMinutes * 1.06) + 8))
      : Math.max(22, Math.min(120, Math.round((km / 34) * 60)));

  const legsDirect = [
    {
      id: "w0",
      mode: "walk",
      label: "280 m à pied",
      minutes: 4,
      dashed: true,
      coordinates: sliceLineByT(line, 0, 0.035),
    },
    {
      id: "b1",
      mode: "bus",
      line: "W15",
      color: "#c4151c",
      minutes: Math.max(12, baseMin - 8),
      fromStop,
      toStop,
      coordinates: sliceLineByT(line, 0.035, 0.965),
    },
    {
      id: "w1",
      mode: "walk",
      label: "150 m à pied",
      minutes: 4,
      dashed: true,
      coordinates: sliceLineByT(line, 0.965, 1),
    },
  ];

  const legsGare = [
    {
      id: "w0",
      mode: "walk",
      label: "420 m à pied",
      minutes: 5,
      dashed: true,
      coordinates: sliceLineByT(line, 0, 0.045),
    },
    {
      id: "b1",
      mode: "bus",
      line: "W15",
      color: "#0073c7",
      minutes: Math.max(14, baseMin - 5),
      fromStop: `${oL} — Gare routière`,
      toStop,
      coordinates: sliceLineByT(line, 0.045, 1),
    },
  ];

  const legsTransfer = [
    {
      id: "w0",
      mode: "walk",
      label: "310 m à pied",
      minutes: 4,
      dashed: true,
      coordinates: sliceLineByT(line, 0, 0.028),
    },
    {
      id: "b1",
      mode: "bus",
      line: "W15",
      color: "#c4151c",
      minutes: Math.round(baseMin * 0.4),
      fromStop,
      toStop: "Mekla — correspondance",
      coordinates: sliceLineByT(line, 0.028, 0.44),
    },
    {
      id: "w2",
      mode: "walk",
      label: "5 min à pied",
      minutes: 6,
      dashed: true,
      coordinates: sliceLineByT(line, 0.44, 0.48),
    },
    {
      id: "b2",
      mode: "bus",
      line: "L6",
      color: "#e69500",
      minutes: Math.round(baseMin * 0.42),
      fromStop: "Mekla",
      toStop,
      coordinates: sliceLineByT(line, 0.48, 0.972),
    },
    {
      id: "w3",
      mode: "walk",
      label: "200 m à pied",
      minutes: 3,
      dashed: true,
      coordinates: sliceLineByT(line, 0.972, 1),
    },
  ];

  const sumMin = (legs) => legs.reduce((s, L) => s + (L.minutes || 0), 0);
  const t1 = clockPair(sumMin(legsDirect), 0);
  const t2 = clockPair(sumMin(legsGare), 4);
  const t3 = clockPair(sumMin(legsTransfer), 2);

  const roadKm =
    osrmDistanceKm != null
      ? Math.round(osrmDistanceKm * 10) / 10
      : Math.round(lineLengthKm(line) * 10) / 10;

  return {
    originLabel: oL,
    destLabel: dL,
    markers,
    positionBounds,
    roadDistanceKm: roadKm,
    osrmDriveMinutes,
    lineDesignations: base.lineDesignations,
    pollLineDesignations: base.pollLineDesignations,
    trips: [
      {
        id: "t1",
        title: "Direct",
        fromStopName: fromStop,
        toStopName: toStop,
        timeStart: t1.dep,
        timeEnd: t1.arr,
        durationMin: sumMin(legsDirect),
        roadDistanceKm: roadKm,
        legs: legsDirect,
      },
      {
        id: "t2",
        title: "Depuis la gare",
        fromStopName: `${oL} — Gare routière`,
        toStopName: toStop,
        timeStart: t2.dep,
        timeEnd: t2.arr,
        durationMin: sumMin(legsGare),
        roadDistanceKm: roadKm,
        legs: legsGare,
      },
      {
        id: "t3",
        title: "Avec correspondance",
        fromStopName: fromStop,
        toStopName: toStop,
        timeStart: t3.dep,
        timeEnd: t3.arr,
        durationMin: sumMin(legsTransfer),
        roadDistanceKm: roadKm,
        legs: legsTransfer,
      },
    ],
  };
}

export function vehiclesInBounds(bounds) {
  const { lowerLeftLat, lowerLeftLong, upperRightLat, upperRightLong } = bounds;
  const line = interpolateLine(
    { lat: lowerLeftLat, lon: lowerLeftLong },
    { lat: upperRightLat, lon: upperRightLong },
    20
  );
  return vehiclesAlongRoute(line, 17);
}
