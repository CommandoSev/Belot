import { useEffect, useState } from "react";
import type { CardId, ClientIntent, GameView, IntentAck } from "@belot/shared";
import { t } from "../i18n/bg";
import { sortHand } from "../lib/table";
import { Card, cardLabel } from "./Card";

interface HandProps {
  game: GameView;
  send: (intent: ClientIntent, ack?: (result: IntentAck) => void) => void;
}

/** One tap plays a legal card; the announcement toggles live in a toolbar above the hand. */
export function Hand({ game, send }: HandProps) {
  const [lifted, setLifted] = useState<CardId | null>(null);
  const [belot, setBelot] = useState(true);
  const [declare, setDeclare] = useState(true);

  const contract = game.contract?.contract ?? game.bidding.contract;
  const cards = sortHand(game.hand, contract);
  const legal = new Set(game.legalCards);
  const belotCards = new Set(game.belotCards);
  const declareOffered = game.trickNumber === 1 && game.declarationsOffered.length > 0;
  const belotOffered = belotCards.size > 0;

  // The lifted card stays up until the next view removes it from the hand (or the server rejects the play).
  useEffect(() => setLifted(null), [game]);

  const tap = (card: CardId) => {
    if (!legal.has(card) || lifted !== null) return;
    setLifted(card);
    const intent: ClientIntent = {
      type: "play",
      card,
      declare: declareOffered && declare,
      belot: belotOffered && belot && belotCards.has(card),
    };
    send(intent, (result) => {
      if (!result.ok) setLifted(null);
    });
  };

  return (
    <div className="hand-area">
      {(declareOffered || belotOffered) && (
        <div className="hand-options">
          {declareOffered && (
            <label className="toggle">
              <input type="checkbox" checked={declare} onChange={(e) => setDeclare(e.target.checked)} />
              <span>
                {t.declare}
                {": "}
                {game.declarationsOffered
                  .map((d) => (d.kind === "carre" ? `${t.carre} ${d.points}` : `${t.sequence(d.points)} ${d.points}`))
                  .join(", ")}
              </span>
            </label>
          )}
          {belotOffered && (
            <label className="toggle">
              <input type="checkbox" checked={belot} onChange={(e) => setBelot(e.target.checked)} />
              <span>{t.belot}</span>
            </label>
          )}
        </div>
      )}
      <div className="hand" role="group" aria-label={t.cards(cards.length)}>
        {cards.map((card) => {
          const isLegal = legal.has(card);
          return (
            <button
              key={card}
              type="button"
              className={`card-slot${lifted === card ? " card-slot-lifted" : ""}`}
              aria-label={cardLabel(card)}
              disabled={!isLegal}
              onClick={() => tap(card)}
            >
              <Card id={card} muted={legal.size > 0 && !isLegal} badge={belotCards.has(card) ? t.belot : undefined} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
