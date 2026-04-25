import { useMemo, useState } from "react";

const DEFAULT_BOUNDS = {
  minLat: 36.58,
  maxLat: 36.83,
  minLon: 3.85,
  maxLon: 4.25,
};

const FALLBACK_LINE_COLORS = [
  "#c4151c",
  "#0073c7",
  "#e69500",
  "#16803c",
  "#7d3fc7",
  "#008c8c",
];

function wireMapLabel(text, role) {
  const s = String(text || "").trim();
  if (role === "origin" && s.length > 3) return `${s.slice(0, 2)}.`;
  return s || "...";
}

function vehicleMarkerTitle(v) {
  const kind = v.vehicleType === "taxi" ? "Taxi" : "Bus";
  const parts = [`${kind} ${v.line || "?"}`];
  if (v.available === false) parts.push("Indisponible");
  if (v.destinationLabel) parts.push(String(v.destinationLabel));
  const fmt = (iso) => {
    try {
      return new Date(iso).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return String(iso);
    }
  };
  if (v.departureAt) parts.push(`Départ : ${fmt(v.departureAt)}`);
  if (v.arrivalAt) parts.push(`Arrivée : ${fmt(v.arrivalAt)}`);
  return parts.join(" · ");
}

function positionsFromLine(line) {
  return Array.isArray(line) ? line.map(([lat, lon]) => [lat, lon]) : [];
}

function positionsFromLegs(routeLegs) {
  if (!Array.isArray(routeLegs) || !routeLegs.length) return [];
  return routeLegs.flatMap((leg) =>
    Array.isArray(leg.coordinates)
      ? leg.coordinates.map(([lat, lon]) => [lat, lon])
      : []
  );
}

function validPoint(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon);
}

function padBounds(bounds, ratio = 0.06) {
  const latSpan = Math.max(0.01, bounds.maxLat - bounds.minLat);
  const lonSpan = Math.max(0.01, bounds.maxLon - bounds.minLon);
  return {
    minLat: bounds.minLat - latSpan * ratio,
    maxLat: bounds.maxLat + latSpan * ratio,
    minLon: bounds.minLon - lonSpan * ratio,
    maxLon: bounds.maxLon + lonSpan * ratio,
  };
}

function fitBoundsToMapAspect(bounds, targetAspect = 0.86) {
  const latSpan = Math.max(0.01, bounds.maxLat - bounds.minLat);
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const lonScale = Math.max(0.35, Math.cos((midLat * Math.PI) / 180));
  const lonSpanKmLike = Math.max(0.01, (bounds.maxLon - bounds.minLon) * lonScale);
  const currentAspect = lonSpanKmLike / latSpan;
  const latMid = (bounds.minLat + bounds.maxLat) / 2;
  const lonMid = (bounds.minLon + bounds.maxLon) / 2;

  if (currentAspect > targetAspect) {
    const neededLatSpan = lonSpanKmLike / targetAspect;
    const d = neededLatSpan / 2;
    return {
      minLat: latMid - d,
      maxLat: latMid + d,
      minLon: bounds.minLon,
      maxLon: bounds.maxLon,
    };
  }

  const neededLonSpan = latSpan * targetAspect / lonScale;
  const d = neededLonSpan / 2;
  return {
    minLat: bounds.minLat,
    maxLat: bounds.maxLat,
    minLon: lonMid - d,
    maxLon: lonMid + d,
  };
}

function computeBounds(points) {
  const usable = points.filter(([lat, lon]) => validPoint(lat, lon));
  if (!usable.length) return DEFAULT_BOUNDS;
  const bounds = usable.reduce(
    (acc, [lat, lon]) => ({
      minLat: Math.min(acc.minLat, lat),
      maxLat: Math.max(acc.maxLat, lat),
      minLon: Math.min(acc.minLon, lon),
      maxLon: Math.max(acc.maxLon, lon),
    }),
    {
      minLat: usable[0][0],
      maxLat: usable[0][0],
      minLon: usable[0][1],
      maxLon: usable[0][1],
    }
  );
  return fitBoundsToMapAspect(padBounds(bounds));
}

function zoomBounds(bounds, zoomLevel) {
  if (!zoomLevel) return bounds;
  const factor = 0.72 ** zoomLevel;
  const latMid = (bounds.minLat + bounds.maxLat) / 2;
  const lonMid = (bounds.minLon + bounds.maxLon) / 2;
  const latHalf = ((bounds.maxLat - bounds.minLat) * factor) / 2;
  const lonHalf = ((bounds.maxLon - bounds.minLon) * factor) / 2;
  return {
    minLat: latMid - latHalf,
    maxLat: latMid + latHalf,
    minLon: lonMid - lonHalf,
    maxLon: lonMid + lonHalf,
  };
}

function lonToX(lon) {
  return (lon + 180) / 360;
}

function latToY(lat) {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

function createProjector(bounds) {
  const x0 = lonToX(bounds.minLon);
  const x1 = lonToX(bounds.maxLon);
  const y0 = latToY(bounds.maxLat);
  const y1 = latToY(bounds.minLat);
  const dx = x1 - x0 || 1;
  const dy = y1 - y0 || 1;
  return ([lat, lon]) => {
    const x = ((lonToX(lon) - x0) / dx) * 100;
    const y = ((latToY(lat) - y0) / dy) * 100;
    return [Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))];
  };
}

function linePoints(points, project) {
  return points
    .filter(([lat, lon]) => validPoint(lat, lon))
    .map((p) => project(p).map((n) => n.toFixed(2)).join(","))
    .join(" ");
}

function tileXToLon(x, z) {
  return (x / 2 ** z) * 360 - 180;
}

function tileYToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function zoomForBounds(bounds) {
  const lonSpan = Math.max(0.01, bounds.maxLon - bounds.minLon);
  const latSpan = Math.max(0.01, bounds.maxLat - bounds.minLat);
  const span = Math.max(lonSpan, latSpan);
  if (span > 3.2) return 9;
  if (span > 1.6) return 10;
  if (span > 0.8) return 11;
  if (span > 0.4) return 12;
  if (span > 0.2) return 13;
  if (span > 0.1) return 14;
  return 15;
}

function tileSetForBounds(bounds) {
  const z = zoomForBounds(bounds);
  const scale = 2 ** z;
  const x0 = Math.floor(lonToX(bounds.minLon) * scale);
  const x1 = Math.floor(lonToX(bounds.maxLon) * scale);
  const y0 = Math.floor(latToY(bounds.maxLat) * scale);
  const y1 = Math.floor(latToY(bounds.minLat) * scale);
  const tiles = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      tiles.push({ x, y, z });
    }
  }
  return {
    tiles,
    x0,
    y0,
    xCount: Math.max(1, x1 - x0 + 1),
    yCount: Math.max(1, y1 - y0 + 1),
    bounds: {
      minLon: tileXToLon(x0, z),
      maxLon: tileXToLon(x1 + 1, z),
      maxLat: tileYToLat(y0, z),
      minLat: tileYToLat(y1 + 1, z),
    },
  };
}

function normalizeLine(s) {
  return String(s || "").trim().toUpperCase();
}

function colorForLine(lineName, lineColors) {
  const key = normalizeLine(lineName);
  if (lineColors.has(key)) return lineColors.get(key);
  let hash = 0;
  for (const ch of key || "BUS") {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return FALLBACK_LINE_COLORS[hash % FALLBACK_LINE_COLORS.length];
}

function choosePrimaryVehicle(vehicles) {
  const usable = (vehicles || []).filter((v) =>
    validPoint(Number(v.lat), Number(v.lon))
  );
  if (!usable.length) return [];
  const live = usable.find((v) => v.source === "driver");
  return [live || usable[0]];
}

export default function RouteMap({
  line,
  routeLegs,
  markers,
  stops,
  vehicles,
  variant = "default",
}) {
  const [zoomLevel, setZoomLevel] = useState(0);
  const positions = useMemo(() => {
    if (Array.isArray(routeLegs) && routeLegs.length) {
      return positionsFromLegs(routeLegs);
    }
    return positionsFromLine(line);
  }, [routeLegs, line]);

  const bounds = useMemo(() => {
    const markerPoints = (markers || []).map((m) => [Number(m.lat), Number(m.lon)]);
    const vehiclePoints = choosePrimaryVehicle(vehicles).map((v) => [
      Number(v.lat),
      Number(v.lon),
    ]);
    return computeBounds([...positions, ...markerPoints, ...vehiclePoints]);
  }, [positions, markers, vehicles]);

  const viewBounds = useMemo(() => zoomBounds(bounds, zoomLevel), [bounds, zoomLevel]);
  const tileSet = useMemo(() => tileSetForBounds(viewBounds), [viewBounds]);
  const project = useMemo(() => createProjector(tileSet.bounds), [tileSet]);
  const visibleVehicles = useMemo(() => choosePrimaryVehicle(vehicles), [vehicles]);
  const lineColors = useMemo(() => {
    const map = new Map();
    for (const leg of routeLegs || []) {
      if (leg?.mode !== "bus") continue;
      const key = normalizeLine(leg.line);
      if (key && leg.color) map.set(key, leg.color);
    }
    return map;
  }, [routeLegs]);
  const hasRoute = positions.length >= 2;
  const useLegs = Array.isArray(routeLegs) && routeLegs.length > 0;

  const mapBlockClass =
    variant === "detail" ? "map-block map-block--detail" : "map-block";
  const mapWrapClass =
    variant === "detail"
      ? "map-wrap map-wrap--wire map-wrap--simple map-wrap--detail"
      : "map-wrap map-wrap--wire map-wrap--simple";

  return (
    <div className={mapBlockClass}>
      <div className={mapWrapClass}>
        <div className="simple-map-controls" aria-label="Zoom carte">
          <button
            type="button"
            className="simple-map-control"
            onClick={() => setZoomLevel((z) => Math.min(3, z + 1))}
            aria-label="Zoomer la carte"
          >
            +
          </button>
          <button
            type="button"
            className="simple-map-control"
            onClick={() => setZoomLevel((z) => Math.max(-2, z - 1))}
            aria-label="Dézoomer la carte"
          >
            -
          </button>
          <button
            type="button"
            className="simple-map-control simple-map-control--fit"
            onClick={() => setZoomLevel(0)}
            aria-label="Réajuster la carte"
          >
            Fit
          </button>
        </div>
        <div className="simple-tile-layer" aria-hidden="true">
          {tileSet.tiles.map((tile) => (
            <img
              key={`${tile.z}-${tile.x}-${tile.y}`}
              className="simple-map-tile"
              src={`https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`}
              alt=""
              draggable="false"
              style={{
                left: `${((tile.x - tileSet.x0) / tileSet.xCount) * 100}%`,
                top: `${((tile.y - tileSet.y0) / tileSet.yCount) * 100}%`,
                width: `${100 / tileSet.xCount}%`,
                height: `${100 / tileSet.yCount}%`,
              }}
            />
          ))}
        </div>
        <svg className="simple-map-overlay" viewBox="0 0 100 100" aria-hidden="true">
          {hasRoute && useLegs
            ? routeLegs.map((leg, idx) => {
                const pts = positionsFromLine(leg.coordinates);
                if (pts.length < 2) return null;
                return (
                  <polyline
                    key={`${leg.id}-${idx}`}
                    points={linePoints(pts, project)}
                    className={`simple-route-line${
                      leg.dashed ? " simple-route-line--dashed" : ""
                    }`}
                  />
                );
              })
            : null}
          {hasRoute && !useLegs ? (
            <polyline
              points={linePoints(positions, project)}
              className="simple-route-line"
            />
          ) : null}
        </svg>

        {hasRoute &&
          (markers || []).map((m, i) => {
            const [x, y] = project([Number(m.lat), Number(m.lon)]);
            return (
              <div
                key={`m-${i}`}
                className={
                  m.role === "destination"
                    ? "map-label-marker map-label-marker--dest simple-map-pin"
                    : "map-label-marker map-label-marker--origin simple-map-pin"
                }
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                {wireMapLabel(m.label || "", m.role)}
              </div>
            );
          })}

        {hasRoute &&
          variant !== "detail" &&
          (stops || []).map((s, i) => {
            const [x, y] = project([Number(s.lat), Number(s.lon)]);
            return (
              <div
                key={`s-${i}`}
                className="stop-badge simple-stop-pin"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                3
              </div>
            );
          })}

        {hasRoute &&
          visibleVehicles.map((v) => {
            const [x, y] = project([Number(v.lat), Number(v.lon)]);
            return (
              <div
                key={v.id}
                className={`vehicle-marker vehicle-marker--dot simple-vehicle-pin${
                  v.vehicleType === "taxi" ? " vehicle-marker--taxi" : ""
                }${v.available === false ? " vehicle-marker--offline" : ""}`}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  backgroundColor: colorForLine(v.line, lineColors),
                }}
                title={vehicleMarkerTitle(v)}
                aria-label={vehicleMarkerTitle(v)}
              />
            );
          })}
      </div>
    </div>
  );
}
