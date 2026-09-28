// Core card and contract types shared by the engine, the server and the client.

export const SUITS = ["C", "D", "H", "S"] as const;
export type Suit = (typeof SUITS)[number]; // C=спатия D=каро H=купа S=пика

export const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export type Rank = (typeof RANKS)[number];

/** A card id is rank + suit, e.g. "JS" for the jack of spades, "10H" for the ten of hearts. */
export type CardId = `${Rank}${Suit}`;

export interface Card {
  id: CardId;
  rank: Rank;
  suit: Suit;
}

/** Seats go 0..3 counter-clockwise. Seats 0 and 2 are team 0, seats 1 and 3 are team 1. */
export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;

export const SEATS: readonly Seat[] = [0, 1, 2, 3];

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

/** Contracts in ascending bidding order. */
export const CONTRACTS = ["clubs", "diamonds", "hearts", "spades", "notrumps", "alltrumps"] as const;
export type Contract = (typeof CONTRACTS)[number];

export function contractRank(contract: Contract): number {
  return CONTRACTS.indexOf(contract);
}

/** Suit contracts map to their trump suit; notrumps and alltrumps have none. */
export function trumpSuitOf(contract: Contract): Suit | null {
  switch (contract) {
    case "clubs":
      return "C";
    case "diamonds":
      return "D";
    case "hearts":
      return "H";
    case "spades":
      return "S";
    default:
      return null;
  }
}

/** Multiplier is 1 (plain), 2 (контра) or 4 (реконтра). */
export type Multiplier = 1 | 2 | 4;

export type BidAction =
  | { type: "pass" }
  | { type: "bid"; contract: Contract }
  | { type: "contra" }
  | { type: "recontra" };
