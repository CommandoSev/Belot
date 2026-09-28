import { RANKS, SUITS, trumpSuitOf, type Card, type CardId, type Contract, type Rank, type Suit } from "./types";

export function makeCard(rank: Rank, suit: Suit): Card {
  return { id: `${rank}${suit}`, rank, suit };
}

/** All 32 cards, grouped by suit in SUITS order and by rank in RANKS order. */
export const DECK: readonly Card[] = SUITS.flatMap((suit) => RANKS.map((rank) => makeCard(rank, suit)));

const CARD_BY_ID: ReadonlyMap<string, Card> = new Map(DECK.map((card) => [card.id, card]));

export function cardFromId(id: CardId): Card {
  const card = CARD_BY_ID.get(id);
  if (!card) throw new Error(`Unknown card id: ${String(id)}`);
  return card;
}

/** How a card ranks and scores: "trump" order in the trump suit (or everywhere in alltrumps), "plain" otherwise. */
export type CardStrength = "trump" | "plain";

export function strengthFor(contract: Contract, suit: Suit): CardStrength {
  if (contract === "alltrumps") return "trump";
  if (contract === "notrumps") return "plain";
  return trumpSuitOf(contract) === suit ? "trump" : "plain";
}

const ORDER: Record<CardStrength, readonly Rank[]> = {
  trump: ["7", "8", "Q", "K", "10", "A", "9", "J"],
  plain: ["7", "8", "9", "J", "Q", "K", "10", "A"],
};

const POINTS: Record<CardStrength, Record<Rank, number>> = {
  trump: { J: 20, "9": 14, A: 11, "10": 10, K: 4, Q: 3, "8": 0, "7": 0 },
  plain: { A: 11, "10": 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 },
};

/** Index of the rank within its strength order; a higher index beats a lower one. */
export function cardOrder(rank: Rank, strength: CardStrength): number {
  return ORDER[strength].indexOf(rank);
}

export function cardPoints(rank: Rank, strength: CardStrength, contract: Contract): number {
  const base = POINTS[strength][rank];
  return contract === "notrumps" ? base * 2 : base;
}
