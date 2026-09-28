import { cardFromId, type CardId } from "@belot/shared";
import { t } from "../i18n/bg";
import { isRedSuit } from "../lib/table";

interface CardProps {
  id?: CardId;
  back?: boolean;
  size?: "sm" | "md";
  selected?: boolean;
  muted?: boolean;
  className?: string;
}

export function cardLabel(id: CardId): string {
  const card = cardFromId(id);
  return `${card.rank}${t.suits[card.suit]}`;
}

export function Card({ id, back, size = "md", selected, muted, className }: CardProps) {
  const classes = ["card", `card-${size}`];
  if (selected) classes.push("card-selected");
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
    </div>
  );
}
