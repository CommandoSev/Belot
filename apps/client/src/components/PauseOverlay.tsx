import { useEffect, useState } from "react";
import type { ClientIntent, RoomView, Seat } from "@belot/shared";
import { t } from "../i18n/bg";
import { playerName, seatName } from "../lib/table";

interface PauseOverlayProps {
  paused: { seat: Seat; forSec: number };
  view: RoomView;
  send: (intent: ClientIntent) => void;
}

const RELEASE_AFTER_SEC = 60;

export function PauseOverlay({ paused, view, send }: PauseOverlayProps) {
  const [elapsed, setElapsed] = useState(paused.forSec);

  useEffect(() => {
    setElapsed(paused.forSec);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [paused.forSec, paused.seat]);

  const name = `${playerName(view, paused.seat)} (${seatName(paused.seat, view.mySeat)})`;
  const canRelease = elapsed >= RELEASE_AFTER_SEC && view.mySeat !== null;

  return (
    <div className="overlay overlay-light" role="status" aria-live="polite">
      <div className="modal pause">
        <div className="spinner" aria-hidden="true" />
        <h2 className="modal-title">{t.paused}</h2>
        <p className="pause-text">{t.playerMissing(name)}</p>
        <p className="pause-time">{t.goneFor(elapsed)}</p>
        {canRelease ? (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => send({ type: "releaseSeat", seat: paused.seat })}
          >
            {t.releaseSeat}
          </button>
        ) : (
          <p className="pause-hint">{t.releaseHint}</p>
        )}
      </div>
    </div>
  );
}
