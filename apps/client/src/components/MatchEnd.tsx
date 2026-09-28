import type { ClientIntent, GameView, Team } from "@belot/shared";
import { t } from "../i18n/bg";

interface MatchEndProps {
  game: GameView;
  send: (intent: ClientIntent) => void;
}

export function MatchEnd({ game, send }: MatchEndProps) {
  const first: Team = game.myTeam ?? 0;
  const second: Team = first === 0 ? 1 : 0;
  const winner = game.winner;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t.gameOver}>
      <div className="modal match-end">
        <h2 className="modal-title">{t.gameOver}</h2>
        {winner !== null && (
          <p className="match-winner">
            {t.winner}: <strong>{t.teamName(winner, game.myTeam)}</strong>
          </p>
        )}
        <p className="match-games">
          {t.games} {game.gamesWon[first]}:{game.gamesWon[second]}
        </p>
        <p className="modal-subtitle">{t.finalScore}</p>
        <div className="score-teams">
          <div className="score-team">
            <span className="score-label">{t.teamName(first, game.myTeam)}</span>
            <span className="score-value">{game.scores[first]}</span>
          </div>
          <div className="score-team">
            <span className="score-label">{t.teamName(second, game.myTeam)}</span>
            <span className="score-value">{game.scores[second]}</span>
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-large" onClick={() => send({ type: "newGame" })}>
          {t.newGame}
        </button>
      </div>
    </div>
  );
}
