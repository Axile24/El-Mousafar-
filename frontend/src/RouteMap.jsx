import { useRef, useEffect, useMemo } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";

const TRANSPORT_BASEMAP_STYLE = {
  version: 8,
  sources: {
    carto_voyager: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    {
      id: "carto_voyager",
      type: "raster",
      source: "carto_voyager",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

const DEFAULT_VIEW = {
  longitude: 4.045,
  latitude: 36.715,
  zoom: 10.35,
  pitch: 0,
  bearing: 0,
};

function wireMapLabel(text, role) {
  const s = String(text || "").trim();
  if (role === "origin" && s.length > 3) {
    return `${s.slice(0, 2)}.`;
  }
  return s || "…";
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

function routeSourceKey(positions) {
  if (!positions.length) return "";
  const a = positions[0];
  const z = positions[positions.length - 1];
  const mid = positions[Math.floor(positions.length / 2)] || a;
  return `${positions.length}-${a[0]},${a[1]}-${mid[0]},${mid[1]}-${z[0]},${z[1]}`;
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

export default function RouteMap({
  line,
  routeLegs,
  markers,
  stops,
  vehicles,
  variant = "default",
}) {
  const mapRef = useRef(null);
  const wrapRef = useRef(null);

  const positions = useMemo(() => {
    if (Array.isArray(routeLegs) && routeLegs.length) {
      return positionsFromLegs(routeLegs);
    }
    return positionsFromLine(line);
  }, [routeLegs, line]);

  const routeGeo = useMemo(() => {
    if (!positions.length) return null;
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: positions.map(([lat, lng]) => [lng, lat]),
      },
    };
  }, [positions]);

  const routeKey = useMemo(() => {
    if (routeLegs?.length) {
      return routeLegs
        .map((l, i) => `${l.id}-${i}-${l.coordinates?.length}-${l.mode}`)
        .join("|");
    }
    return routeSourceKey(positions);
  }, [routeLegs, positions]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return undefined;

    const fitRoute = () => {
      if (!map.isStyleLoaded() || !positions.length) return;

      const b = new maplibregl.LngLatBounds();
      positions.forEach(([lat, lng]) => {
        b.extend([lng, lat]);
      });
      (markers || []).forEach((m) => {
        if (
          m?.lat != null &&
          m?.lon != null &&
          Number.isFinite(m.lat) &&
          Number.isFinite(m.lon)
        ) {
          b.extend([m.lon, m.lat]);
        }
      });

      const pad =
        variant === "detail"
          ? { top: 56, bottom: 12, left: 14, right: 14 }
          : { top: 20, bottom: 28, left: 18, right: 18 };

      map.fitBounds(b, {
        padding: pad,
        maxZoom: variant === "detail" ? 15.5 : 16.75,
        duration: 750,
        pitch: 0,
        bearing: 0,
        essential: true,
      });
    };

    if (map.isStyleLoaded()) {
      fitRoute();
    } else {
      map.once("load", fitRoute);
    }

    return () => {
      map.off("load", fitRoute);
    };
  }, [routeKey, positions, markers, variant]);

  useEffect(() => {
    const el = wrapRef.current;
    const map = mapRef.current?.getMap?.();
    if (!el || !map) return undefined;
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasRoute = positions.length >= 2;
  const useLegs = Array.isArray(routeLegs) && routeLegs.length > 0;

  const mapBlockClass =
    variant === "detail" ? "map-block map-block--detail" : "map-block";
  const mapWrapClass =
    variant === "detail"
      ? "map-wrap map-wrap--wire map-wrap--gl map-wrap--detail"
      : "map-wrap map-wrap--wire map-wrap--gl";

  return (
    <div className={mapBlockClass} ref={wrapRef}>
      <div className={mapWrapClass}>
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          initialViewState={DEFAULT_VIEW}
          mapStyle={TRANSPORT_BASEMAP_STYLE}
          style={{ width: "100%", height: "100%" }}
          attributionControl={{ compact: true }}
          reuseMaps
        >
          {hasRoute &&
            useLegs &&
            routeLegs.map((leg, idx) => {
              const pos = positionsFromLine(leg.coordinates);
              if (pos.length < 2) return null;
              const geo = {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: pos.map(([lat, lng]) => [lng, lat]),
                },
              };
              const isBus = leg.mode === "bus";
              const color = isBus ? leg.color || "#111" : "#4a4a4a";
              const paint = {
                "line-color": color,
                "line-width": isBus ? 7 : 5,
                "line-opacity": isBus ? 1 : 0.88,
                ...(leg.dashed ? { "line-dasharray": [0.35, 2] } : {}),
              };
              return (
                <Source
                  key={`${leg.id}-${idx}`}
                  id={`leg-${idx}`}
                  type="geojson"
                  data={geo}
                >
                  <Layer
                    id={`leg-line-${idx}`}
                    type="line"
                    layout={{
                      "line-cap": "round",
                      "line-join": "round",
                    }}
                    paint={paint}
                  />
                </Source>
              );
            })}

          {hasRoute && !useLegs && routeGeo && (
            <Source
              id="route"
              type="geojson"
              data={routeGeo}
              key={routeSourceKey(positions)}
            >
              <Layer
                id="route-line"
                type="line"
                layout={{
                  "line-cap": "round",
                  "line-join": "round",
                }}
                paint={{
                  "line-color": "#000000",
                  "line-width": 6,
                  "line-opacity": 1,
                }}
              />
            </Source>
          )}

          {hasRoute &&
            (markers || []).map((m, i) => (
              <Marker
                key={`m-${i}`}
                longitude={m.lon}
                latitude={m.lat}
                anchor="bottom"
              >
                <div
                  className={
                    m.role === "destination"
                      ? "map-label-marker map-label-marker--dest"
                      : "map-label-marker map-label-marker--origin"
                  }
                >
                  {wireMapLabel(m.label || "", m.role)}
                </div>
              </Marker>
            ))}
          {hasRoute &&
            variant !== "detail" &&
            (stops || []).map((s, i) => (
              <Marker
                key={`s-${i}`}
                longitude={s.lon}
                latitude={s.lat}
                anchor="center"
              >
                <div className="stop-badge">3</div>
              </Marker>
            ))}
          {hasRoute &&
            (vehicles || []).map((v) => (
              <Marker
                key={v.id}
                longitude={v.lon}
                latitude={v.lat}
                anchor="center"
              >
                <div
                  className={`vehicle-marker${
                    v.available === false ? " vehicle-marker--offline" : ""
                  }`}
                  title={vehicleMarkerTitle(v)}
                >
                  <span className="vehicle-marker-bus" aria-hidden="true">
                    {v.vehicleType === "taxi" ? "🚕" : "🚌"}
                  </span>
                  <span className="vehicle-marker-line">{v.line || "?"}</span>
                </div>
              </Marker>
            ))}
        </Map>
      </div>
    </div>
  );
}
