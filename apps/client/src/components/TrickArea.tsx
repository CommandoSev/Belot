import { useEffect, useState } from "react";
import type { CompletedTrickView, RoomView, TrickView } from "@belot/shared";
import { positionOf } from "../lib/table";
import { Card } from "./Card";

interface TrickAreaProps {
  trick: TrickView | null;
  lastTrick: CompletedTrickView | null;
  view: RoomView;
}

const LAST_TRICK_MS = 1500;
const POSITION_CLASS = ["bottom", "right", "top", "left"] as const;

function trickKey(trick: CompletedTrickView | null): string {
  return trick ? `${trick.winner}:${trick.plays.map((p) => p.card).join(",")}` : "";
}

/** The current trick around the centre; a just-finished trick lingers faintly for a moment. */
export function TrickArea({ trick, lastTrick, view }: TrickAreaProps) {
  const [ghost, setGhost] = useState<CompletedTrickView | null>(null);
  const key = trickKey(lastTrick);

  useEffect(() => {
    if (!lastTrick) return;
    setGhost(lastTrick);
    const timer = setTimeout(() => setGhost(null), LAST_TRICK_MS);
    return () => clearTimeout(timer);
    // Keyed on the trick's contents so a re-sent view of the same trick does not restart the fade.
  }, [key]);

  const showGhost = ghost !== null && (trick?.plays.length ?? 0) === 0;
  const plays = showGhost ? ghost.plays : (trick?.plays ?? []);

  return (
    <div className={`trick${showGhost ? " trick-ghost" : ""}`} data-testid="trick-area">
      {plays.map((play) => {
        const position = positionOf(play.seat, view.mySeat);
        const winner = showGhost && ghost.winner === play.seat;
        return (
          <div
            key={play.card}
            className={`trick-play trick-play-${POSITION_CLASS[position]}${winner ? " trick-play-winner" : ""}`}
          >
            <Card id={play.card} size="sm" />
          </div>
        );
      })}
    </div>
  );
}
