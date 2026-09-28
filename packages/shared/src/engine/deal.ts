import { DECK } from "./cards";
import { nextSeat, type Card, type Seat } from "./types";

/** Random source returning a number in [0, 1). Injected so deals are reproducible in tests. */
export type Rng = () => number;

/** mulberry32: small, fast, good enough for shuffling cards. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy; the input is left untouched. */
export function shuffle<T>(deck: readonly T[], rng: Rng): T[] {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Seats in the order they receive cards: right of the dealer first, the dealer last. */
export function dealOrder(dealer: Seat): Seat[] {
  const order: Seat[] = [];
  let seat = nextSeat(dealer);
  for (let i = 0; i < 4; i++) {
    order.push(seat);
    seat = nextSeat(seat);
  }
  return order;
}

/**
 * Deals 3, then 2, then 3 cards to each seat in deal order. hands[seat][0..4] are the
 * bidding cards, hands[seat][5..7] the three revealed once bidding ends.
 */
export function dealHands(rng: Rng, dealer: Seat = 0): Card[][] {
  const deck = shuffle(DECK, rng);
  const hands: Card[][] = [[], [], [], []];
  let cursor = 0;
  for (const count of [3, 2, 3]) {
    for (const seat of dealOrder(dealer)) {
      hands[seat]!.push(...deck.slice(cursor, cursor + count));
      cursor += count;
    }
  }
  return hands;
}
