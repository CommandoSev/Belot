import type { GameView, RoomView, Team } from "@belot/shared";
import { t } from "../i18n/bg";
import { contractLabel, playerName } from "../lib/table";

interface ScorePanelProps {
  game: GameView;
  view: RoomView;
}

export function ScorePanel({ game, view }: ScorePanelProps) {
  const myTeam: Team = game.myTeam ?? 0;
  const other: Team = myTeam === 0 ? 1 : 0;
  const contract =
    game.contract ??
    (game.bidding.contract !== null && game.bidding.bidder !== null
      ? { contract: game.bidding.contract, bidder: game.bidding.bidder, multiplier: game.bidding.multiplier }
      : null);

  return (
    <div className="score" data-testid="score-panel">
      <div className="score-teams">
        <div className="score-team">
          <span className="score-label">{t.teamName(myTeam, game.myTeam)}</span>
          <span className="score-value">{game.scores[myTeam]}</span>
        </div>
        <div className="score-team">
          <span className="score-label">{t.teamName(other, game.myTeam)}</span>
          <span className="score-value">{game.scores[other]}</span>
        </div>
      </div>
      <div className="score-meta-row">
        <span className="score-games" data-testid="games-won">
          {t.games} {game.gamesWon[myTeam]}:{game.gamesWon[other]}
        </span>
        {game.hanging > 0 && (
          <span className="score-hanging">
            {t.hanging}: <strong>{game.hanging}</strong>
          </span>
        )}
      </div>
      <div className="score-contract">
        {contract ? (
          <>
            <strong>{contractLabel(contract.contract)}</strong>
            {contract.multiplier > 1 && <span className="badge badge-multiplier">{t.multiplier[contract.multiplier]}</span>}
            <span className="score-bidder">
              {t.bidder}: {playerName(view, contract.bidder)}
            </span>
          </>
        ) : (
          <span className="score-muted">{t.noContract}</span>
        )}
      </div>
      <div className="score-meta">
        {t.deal} {game.dealNumber} · {t.dealer}: {playerName(view, game.dealer)}
      </div>
    </div>
  );
}
