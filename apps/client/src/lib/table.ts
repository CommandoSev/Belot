// Presentation helpers: seat rotation, hand sorting and labels derived from a view.
import {
  cardFromId,
  cardOrder,
  strengthFor,
  trumpSuitOf,
  type CardId,
  type Contract,
  type RoomView,
  type Seat,
  type Suit,
} from "@belot/shared";
import { SEAT_NAMES, t } from "../i18n/bg";

/** Table position relative to the viewer: 0 bottom, 1 right, 2 top, 3 left (counter-clockwise). */
export type Position = 0 | 1 | 2 | 3;

export function positionOf(seat: Seat, mySeat: Seat | null): Position {
  return ((seat - (mySeat ?? 0) + 4) % 4) as Position;
}

export function seatAt(position: Position, mySeat: Seat | null): Seat {
  return ((position + (mySeat ?? 0)) % 4) as Seat;
}

export function seatName(seat: Seat, mySeat: Seat | null): string {
  return SEAT_NAMES[positionOf(seat, mySeat)];
}

/** Nickname of a seat, falling back to its relative name when empty. */
export function playerName(view: RoomView, seat: Seat): string {
  return view.seats[seat]?.name || seatName(seat, view.mySeat);
}

/** Alternating colours so neighbouring suits never blend; trump goes first once known. */
const SUIT_DISPLAY_ORDER: readonly Suit[] = ["S", "H", "C", "D"];

export function sortHand(hand: readonly CardId[], contract: Contract | null): CardId[] {
  const trump = contract ? trumpSuitOf(contract) : null;
  const suitRank = (suit: Suit): number => (suit === trump ? -1 : SUIT_DISPLAY_ORDER.indexOf(suit));
  const rankOrder = (id: CardId): number => {
    const card = cardFromId(id);
    return cardOrder(card.rank, contract ? strengthFor(contract, card.suit) : "plain");
  };
  return [...hand].sort((a, b) => {
    const suitDiff = suitRank(cardFromId(a).suit) - suitRank(cardFromId(b).suit);
    return suitDiff !== 0 ? suitDiff : rankOrder(b) - rankOrder(a);
  });
}

export function contractLabel(contract: Contract): string {
  const suit = trumpSuitOf(contract);
  return suit ? `${t.contracts[contract]} ${t.suits[suit]}` : t.contracts[contract];
}

export function isRedSuit(suit: Suit): boolean {
  return suit === "H" || suit === "D";
}
