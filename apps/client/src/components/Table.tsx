import { useEffect, useState } from "react";
import type { ClientIntent, IntentAck, RoomView, Seat as SeatIndex } from "@belot/shared";
import { t } from "../i18n/bg";
import { playerName, seatAt, type Position } from "../lib/table";
import { useSoundToggle } from "../sound";
import { useGameSounds } from "../useGameSounds";
import { BiddingPanel } from "./BiddingPanel";
import { DealSummary } from "./DealSummary";
import { Hand } from "./Hand";
import { MatchEnd } from "./MatchEnd";
import { PauseOverlay } from "./PauseOverlay";
import { ScorePanel } from "./ScorePanel";
import { Seat } from "./Seat";
import { TrickArea } from "./TrickArea";

interface TableProps {
  view: RoomView;
  send: (intent: ClientIntent, ack?: (result: IntentAck) => void) => void;
}

const POSITIONS: Position[] = [2, 3, 1, 0];

function shareUrl(code: string): string {
  return `${window.location.origin}/r/${code}`;
}

export function Table({ view, send }: TableProps) {
  const [copied, setCopied] = useState(false);
  const [soundOn, toggleSound] = useSoundToggle();
  const game = view.game;
  useGameSounds(view, view.mySeat);
  const freeSeats = view.seats.filter((s) => s === null).length;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(view.code));
      setCopied(true);
    } catch {
      window.prompt(t.share, shareUrl(view.code));
    }
  };

  const status = (() => {
    if (view.phase === "waiting") return `${t.waiting} · ${t.freeSeats(freeSeats)}`;
    if (!game) return "";
    if (game.paused) return t.paused;
    if (game.turn === null) return game.phase === "dealEnd" ? t.dealEnd : game.phase === "finished" ? t.gameOver : "";
    if (game.turn === view.mySeat) return t.yourTurn;
    return t.turnOf(playerName(view, game.turn));
  })();

  const revealed = game && game.trickNumber > 1 ? game.declared.filter((d) => d.cards) : [];
  const belots = game?.belots ?? [];
  const showHand = game !== null && view.mySeat !== null && game.hand.length > 0;
  const isMyTurnToPlay = game?.phase === "playing" && game.turn === view.mySeat;

  return (
    <div className={`table-screen phase-${view.phase}`}>
      <header className="room-header">
        <div className="room-code-block">
          <span className="room-label">{t.room}</span>
          <span className="room-code" data-testid="room-code">
            {view.code}
          </span>
        </div>
        <div className="room-status" aria-live="polite">
          {status}
        </div>
        <div className="room-actions">
          <button type="button" className="btn btn-ghost btn-small" onClick={share}>
            {copied ? t.copied : t.share}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small btn-icon"
            aria-label={t.sound}
            aria-pressed={soundOn}
            title={t.sound}
            onClick={toggleSound}
          >
            <span aria-hidden="true">{soundOn ? "🔊" : "🔇"}</span>
          </button>
          {view.phase === "waiting" && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => send({ type: "leaveRoom" })}>
              {t.leaveRoom}
            </button>
          )}
        </div>
      </header>

      <section className="felt" aria-label={t.table}>
        {POSITIONS.map((position) => (
          <Seat
            key={position}
            seat={seatAt(position, view.mySeat)}
            position={position}
            view={view}
            onSit={(seat: SeatIndex) => send({ type: "sit", seat })}
            onStand={() => send({ type: "stand" })}
          />
        ))}
        <div className="felt-center">
          {view.phase === "waiting" ? (
            <div className="felt-waiting">
              <div className="felt-waiting-title">{t.waiting}</div>
              <div className="felt-waiting-sub">{t.freeSeats(freeSeats)}</div>
            </div>
          ) : (
            game && <TrickArea trick={game.trick} lastTrick={game.lastTrick} view={view} />
          )}
        </div>
        {(revealed.length > 0 || belots.length > 0) && (
          <div className="revealed">
            {revealed.map((d, i) => (
              <span key={`d${i}`} className="revealed-item">
                {playerName(view, d.seat)}: {d.kind === "carre" ? t.carre : t.sequence(d.points)} {d.points}
              </span>
            ))}
            {belots.map((b, i) => (
              <span key={`b${i}`} className="revealed-item">
                {playerName(view, b.seat)}: {t.belot} {t.suits[b.suit]}
              </span>
            ))}
          </div>
        )}
      </section>

      {game && (
        <aside className="side-panel">
          <ScorePanel game={game} view={view} />
        </aside>
      )}

      {(game?.phase === "bidding" || showHand) && (
        <section className={`action-area${isMyTurnToPlay ? " action-area-active" : ""}`}>
          {game?.phase === "bidding" && <BiddingPanel game={game} view={view} send={send} />}
          {showHand && <Hand game={game} send={send} />}
        </section>
      )}

      {game?.phase === "dealEnd" && game.dealSummary && (
        <DealSummary summary={game.dealSummary} myTeam={game.myTeam} dealEndsInSec={game.dealEndsInSec} />
      )}
      {game?.phase === "finished" && <MatchEnd game={game} send={send} />}
      {game?.paused && <PauseOverlay paused={game.paused} view={view} send={send} />}
    </div>
  );
}
