import { useState } from "react";
import type { CardId, ClientIntent, GameView } from "@belot/shared";
import { t } from "../i18n/bg";
import { sortHand } from "../lib/table";
import { Card, cardLabel } from "./Card";

interface HandProps {
  game: GameView;
  send: (intent: ClientIntent) => void;
}

/** Two taps on every device: the first lifts a legal card, the second on the same card plays it. */
export function Hand({ game, send }: HandProps) {
  const [picked, setPicked] = useState<CardId | null>(null);
  const [belot, setBelot] = useState(true);
  const [declare, setDeclare] = useState(true);

  const contract = game.contract?.contract ?? game.bidding.contract;
  const cards = sortHand(game.hand, contract);
  const legal = new Set(game.legalCards);
  const selected = picked && legal.has(picked) ? picked : null;
  const belotOffered = selected !== null && game.belotCards.includes(selected);
  const declareOffered = selected !== null && game.trickNumber === 1 && game.declarationsOffered.length > 0;

  const tap = (card: CardId) => {
    if (!legal.has(card)) return;
    if (selected === card) {
      send({ type: "play", card, declare: declareOffered && declare, belot: belotOffered && belot });
      setPicked(null);
      return;
    }
    setPicked(card);
  };

  return (
    <div className="hand-area">
      {selected && (
        <div className="hand-options">
          {belotOffered && (
            <label className="toggle">
              <input type="checkbox" checked={belot} onChange={(e) => setBelot(e.target.checked)} />
              <span>{t.belot}</span>
            </label>
          )}
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
          <span className="hand-hint">{t.selectCard}</span>
        </div>
      )}
      <div className="hand" role="group" aria-label={t.cards(cards.length)}>
        {cards.map((card) => {
          const isLegal = legal.has(card);
          return (
            <button
              key={card}
              type="button"
              className={`card-slot${selected === card ? " card-slot-selected" : ""}`}
              aria-label={cardLabel(card)}
              aria-pressed={selected === card}
              disabled={!isLegal}
              onClick={() => tap(card)}
            >
              <Card id={card} selected={selected === card} muted={legal.size > 0 && !isLegal} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
