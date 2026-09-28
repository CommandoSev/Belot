import { useEffect, useState } from "react";
import type { DealSummaryView, Team, TeamDealSummaryView } from "@belot/shared";
import { t } from "../i18n/bg";
import { contractLabel } from "../lib/table";

interface DealSummaryProps {
  summary: DealSummaryView;
  myTeam: Team | null;
  dealEndsInSec: number | null;
}

const ROWS: Array<[keyof TeamDealSummaryView, string]> = [
  ["cardPoints", t.cardPoints],
  ["lastTrick", t.lastTrick],
  ["declarations", t.declarations],
  ["belots", t.belots],
  ["valat", t.valat],
  ["raw", t.total],
  ["rounded", t.rounded],
  ["awarded", t.awarded],
];

/** Counts down locally from the last server value so the number moves between state pushes. */
function useCountdown(value: number | null): number | null {
  const [left, setLeft] = useState(value);
  useEffect(() => {
    setLeft(value);
    if (value === null) return;
    const timer = setInterval(() => setLeft((s) => (s === null || s <= 0 ? 0 : s - 1)), 1000);
    return () => clearInterval(timer);
  }, [value]);
  return left;
}

export function DealSummary({ summary, myTeam, dealEndsInSec }: DealSummaryProps) {
  const first: Team = myTeam ?? 0;
  const second: Team = first === 0 ? 1 : 0;
  const left = useCountdown(dealEndsInSec);
  const { contract } = summary;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t.dealEnd}>
      <div className="modal deal-summary">
        <h2 className="modal-title">{t.dealEnd}</h2>
        <p className="modal-subtitle">
          {contractLabel(contract.contract)}
          {contract.multiplier > 1 ? ` · ${t.multiplier[contract.multiplier]}` : ""}
          {" · "}
          {t.result[summary.result]}
          {summary.valatBy !== null ? ` · ${t.valat}: ${t.teamName(summary.valatBy, myTeam)}` : ""}
        </p>
        <table className="summary-table">
          <thead>
            <tr>
              <th />
              <th>{t.teamName(first, myTeam)}</th>
              <th>{t.teamName(second, myTeam)}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([key, label]) => (
              <tr key={key} className={key === "awarded" ? "summary-row-total" : undefined}>
                <th scope="row">{label}</th>
                <td>{summary.teams[first][key]}</td>
                <td>{summary.teams[second][key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {summary.hangingBefore > 0 && summary.result !== "hanging" && (
          <p className="summary-note">{t.hangingCarried(summary.hangingBefore)}</p>
        )}
        {summary.hangingAfter > 0 && (
          <p className="summary-note">
            {t.hanging}: {summary.hangingAfter}
          </p>
        )}
        {left !== null && (
          <p className="countdown">
            {t.nextDealIn} {t.seconds(left)}
          </p>
        )}
      </div>
    </div>
  );
}
