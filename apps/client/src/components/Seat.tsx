import type { RoomView, Seat as SeatIndex } from "@belot/shared";
import { t } from "../i18n/bg";
import { seatName, type Position } from "../lib/table";
import { Card } from "./Card";

interface SeatProps {
  seat: SeatIndex;
  position: Position;
  view: RoomView;
  onSit: (seat: SeatIndex) => void;
  onStand: () => void;
}

const POSITION_CLASS: Record<Position, string> = { 0: "bottom", 1: "right", 2: "top", 3: "left" };

export function Seat({ seat, position, view, onSit, onStand }: SeatProps) {
  const occupant = view.seats[seat];
  const game = view.game;
  const isMe = view.mySeat === seat;
  const isTurn = game?.turn === seat;
  const isDealer = game?.dealer === seat;
  const waiting = view.phase === "waiting";
  const handCount = game?.handCounts[seat] ?? 0;
  const label = seatName(seat, view.mySeat);

  const classes = ["seat", `seat-${POSITION_CLASS[position]}`];
  if (isTurn) classes.push("seat-turn");
  if (isMe) classes.push("seat-me");
  if (!occupant) classes.push("seat-empty");
  if (occupant && !occupant.connected) classes.push("seat-offline");

  return (
    <div className={classes.join(" ")} data-seat={seat} data-testid={`seat-${POSITION_CLASS[position]}`}>
      <div className="seat-label">{label}</div>
      {occupant ? (
        <>
          <div className="seat-name">
            {occupant.name}
            {isMe && <span className="seat-you"> ({t.you})</span>}
          </div>
          {!occupant.connected && <span className="badge badge-offline">{t.disconnected}</span>}
          {isDealer && <span className="badge badge-dealer">{t.dealer}</span>}
          {game && handCount > 0 && !isMe && (
            <div className="seat-cards" aria-label={t.cards(handCount)} title={t.cards(handCount)}>
              {Array.from({ length: Math.min(handCount, 8) }, (_, i) => (
                <Card key={i} back size="sm" />
              ))}
              <span className="seat-count">{handCount}</span>
            </div>
          )}
          {waiting && isMe && (
            <button type="button" className="btn btn-ghost btn-small" onClick={onStand}>
              {t.stand}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="seat-name seat-name-empty">{t.emptySeat}</div>
          {waiting && (
            <button type="button" className="btn btn-primary btn-small" onClick={() => onSit(seat)}>
              {t.sit}
            </button>
          )}
        </>
      )}
    </div>
  );
}
