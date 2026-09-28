import { cardFromId, type CardId } from "@belot/shared";
import { t } from "../i18n/bg";
import { isRedSuit } from "../lib/table";

interface CardProps {
  id?: CardId;
  back?: boolean;
  size?: "sm" | "md";
  muted?: boolean;
  /** Small corner tag, e.g. "Белот" on a card that would announce one. */
  badge?: string;
  className?: string;
}

export function cardLabel(id: CardId): string {
  const card = cardFromId(id);
  return `${card.rank}${t.suits[card.suit]}`;
}

export function Card({ id, back, size = "md", muted, badge, className }: CardProps) {
  const classes = ["card", `card-${size}`];
  if (muted) classes.push("card-muted");
  if (className) classes.push(className);

  if (back || !id) {
    classes.push("card-back");
    return <div className={classes.join(" ")} aria-hidden="true" />;
  }

  const card = cardFromId(id);
  classes.push(isRedSuit(card.suit) ? "card-red" : "card-black");
  const glyph = t.suits[card.suit];
  return (
    <div className={classes.join(" ")} data-card={id}>
      <span className="card-corner">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{glyph}</span>
      </span>
      <span className="card-center" aria-hidden="true">
        {glyph}
      </span>
      <span className="card-corner card-corner-bottom" aria-hidden="true">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{glyph}</span>
      </span>
      {badge && (
        <span className="card-badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </div>
  );
}
