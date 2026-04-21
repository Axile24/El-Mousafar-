function WalkIconSm() {
  return (
    <span className="vt-sheet-walk-ic" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.2 3.1l-2.1 8.6H6.9l1.3-5.3-1.4 1.4v3.8H5V12l3.3-3.3 1-3.9c.3-1.1 1.3-1.9 2.5-1.9H13c.8 0 1.5.3 2 .8l2.2 2.2 1.4-1.4v2.8l-2.5 2.5-1.3 5.2h-2.2l2.1-8.6-1.5-1.5-2.5 2.5z" />
      </svg>
    </span>
  );
}

export default function JourneyBottomSheet({
  trip,
  originLabel,
  destLabel,
  onClose,
}) {
  if (!trip) return null;

  return (
    <div className="vt-sheet">
      <div className="vt-sheet__handle" aria-hidden="true" />
      <div className="vt-sheet__head">
        <button type="button" className="vt-sheet__back" onClick={onClose}>
          ← Trajets
        </button>
        <span className="vt-sheet__share" aria-hidden="true">
          ↗
        </span>
      </div>
      <div className="vt-sheet__summary">
        <p className="vt-sheet__route">
          {originLabel} → {destLabel}
        </p>
        <p className="vt-sheet__times">
          <strong>
            {trip.timeStart} – {trip.timeEnd}
          </strong>
          <span className="vt-sheet__dur">Durée {trip.durationMin} min</span>
        </p>
        <p className="vt-sheet__hint">Démo · horaires indicatifs</p>
      </div>
      <div className="vt-sheet__timeline">
        {trip.legs.map((leg, i) => (
          <div
            key={`${leg.id}-${i}`}
            className={`vt-leg vt-leg--${leg.mode}`}
            style={
              leg.mode === "bus"
                ? { "--leg-color": leg.color || "#333333" }
                : undefined
            }
          >
            <div className="vt-leg__rail" aria-hidden="true">
              {leg.mode === "walk" ? (
                <span className="vt-leg__dash" />
              ) : (
                <span className="vt-leg__solid" />
              )}
            </div>
            <div className="vt-leg__body">
              {leg.mode === "walk" ? (
                <div className="vt-leg__pill">
                  <WalkIconSm />
                  <span>{leg.label}</span>
                </div>
              ) : (
                <div className="vt-leg__bus">
                  <span
                    className="vt-leg__badge"
                    style={{ backgroundColor: leg.color }}
                  >
                    {leg.line}
                  </span>
                  <div>
                    <div className="vt-leg__stop">{leg.fromStop}</div>
                    <div className="vt-leg__stop vt-leg__stop--muted">
                      → {leg.toStop}
                    </div>
                  </div>
                </div>
              )}
              <span className="vt-leg__min">{leg.minutes} min</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
