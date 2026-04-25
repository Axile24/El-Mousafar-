function WalkIcon() {
  return (
    <span className="vt-spark-walk" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.2 3.1l-2.1 8.6H6.9l1.3-5.3-1.4 1.4v3.8H5V12l3.3-3.3 1-3.9c.3-1.1 1.3-1.9 2.5-1.9H13c.8 0 1.5.3 2 .8l2.2 2.2 1.4-1.4v2.8l-2.5 2.5-1.3 5.2h-2.2l2.1-8.6-1.5-1.5-2.5 2.5z" />
      </svg>
    </span>
  );
}

function WheelchairBadge() {
  return (
    <span className="vt-a11y-badge" title="Trajet accessible (démo)">
      ♿
    </span>
  );
}

function Sparkline({ tripId, legs }) {
  return (
    <div className="vt-spark" aria-hidden="true">
      {legs.map((leg, i) => (
        <span key={`${tripId}-seg-${i}`} className="vt-spark-group">
          {i > 0 ? <span className="vt-spark-node" /> : null}
          {leg.mode === "walk" ? (
            <span className="vt-spark-seg vt-spark-seg--walk">
              <WalkIcon />
              <span className="vt-spark-dots" />
            </span>
          ) : (
            <span className="vt-spark-seg vt-spark-seg--bus">
              <span
                className="vt-spark-badge"
                style={{ backgroundColor: leg.color || "#333" }}
              >
                {leg.line || "?"}
              </span>
              <span
                className="vt-spark-line"
                style={{ backgroundColor: leg.color || "#333" }}
              />
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export default function TripSuggestionList({ trips, onSelect }) {
  if (!trips?.length) return null;

  return (
    <div className="vt-trip-list-wrap">
      <ul className="vt-trip-list vt-trip-list--flat">
        {trips.map((trip) => (
          <li
            key={trip.id}
            className={`vt-trip-row${
              trip.serviceAvailable === false ? " vt-trip-row--frozen" : ""
            }`}
          >
            <button
              type="button"
              className="vt-trip-row__btn"
              disabled={trip.serviceAvailable === false}
              onClick={() => {
                if (trip.serviceAvailable !== false) onSelect(trip);
              }}
            >
              <div className="vt-trip-row__top">
                <span className="vt-trip-row__stop">
                  {trip.fromStopName}
                  <WheelchairBadge />
                </span>
                <span className="vt-trip-row__times">
                  <span className="vt-trip-row__time-pill">
                    <span className="vt-trip-row__time-strong">
                      {trip.timeStart} – {trip.timeEnd}
                    </span>
                  </span>
                </span>
              </div>
              <div className="vt-trip-row__meta">
                {trip.serviceAvailable === false ? (
                  <span className="vt-trip-row__offline">
                    Bus hors service
                    {trip.unavailableLines?.length
                      ? ` (${trip.unavailableLines.join(", ")})`
                      : ""}
                  </span>
                ) : trip.serviceAlert && trip.serviceAlert !== "ok" ? (
                  <span className="vt-trip-row__notice">
                    {trip.serviceAlert === "delay"
                      ? "Retard"
                      : trip.serviceAlert === "issue"
                        ? "Problème signalé"
                        : "Info bus"}
                    {trip.serviceNote ? ` : ${trip.serviceNote}` : ""}
                  </span>
                ) : (
                  <>
                    Durée {trip.durationMin} min
                    {trip.roadDistanceKm != null
                      ? ` · ${trip.roadDistanceKm} km`
                      : ""}{" "}
                    · {trip.title}
                  </>
                )}
              </div>
              <Sparkline tripId={trip.id} legs={trip.legs} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
