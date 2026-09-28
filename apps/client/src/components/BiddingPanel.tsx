import { CONTRACTS, type BidAction, type ClientIntent, type GameView, type RoomView } from "@belot/shared";
import { t } from "../i18n/bg";
import { contractLabel, playerName } from "../lib/table";

interface BiddingPanelProps {
  game: GameView;
  view: RoomView;
  send: (intent: ClientIntent) => void;
}

function sameBid(a: BidAction, b: BidAction): boolean {
  return a.type === b.type && (a.type !== "bid" || b.type !== "bid" || a.contract === b.contract);
}

export function bidLabel(action: BidAction): string {
  return action.type === "bid" ? contractLabel(action.contract) : t.bids[action.type];
}

export function BiddingPanel({ game, view, send }: BiddingPanelProps) {
  const isLegal = (action: BidAction) => game.legalBids.some((legal) => sameBid(legal, action));
  const bid = (action: BidAction) => send({ type: "bid", action });
  const actions: BidAction[] = [
    ...CONTRACTS.map((contract): BidAction => ({ type: "bid", contract })),
    { type: "pass" },
    { type: "contra" },
    { type: "recontra" },
  ];

  return (
    <div className="bidding" data-testid="bidding-panel">
      <div className="bidding-title">{game.turn === view.mySeat ? t.yourTurn : t.bidding}</div>
      <div className="bidding-buttons">
        {actions.map((action) => (
          <button
            key={bidLabel(action)}
            type="button"
            className={`btn ${action.type === "bid" ? "btn-bid" : "btn-ghost"}`}
            disabled={!isLegal(action)}
            onClick={() => bid(action)}
          >
            {bidLabel(action)}
          </button>
        ))}
      </div>
      {game.bidding.history.length > 0 && (
        <div className="bidding-history">
          {game.bidding.history.map((record, i) => (
            <span key={i} className="bidding-record">
              {playerName(view, record.seat)}: <strong>{bidLabel(record.action)}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
