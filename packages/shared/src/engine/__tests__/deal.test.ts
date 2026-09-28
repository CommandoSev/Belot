import { describe, expect, it } from "vitest";
import { DECK } from "../cards";
import { dealHands, dealOrder, seededRng, shuffle } from "../deal";
import { SEATS, nextSeat, type Seat } from "../types";

describe("seededRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = seededRng(1);
    const b = seededRng(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
  });

  it("stays within [0, 1)", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("shuffle", () => {
  it("keeps every card exactly once and does not mutate the input", () => {
    const input = [...DECK];
    const out = shuffle(input, seededRng(3));
    expect(input).toEqual(DECK);
    expect(out).toHaveLength(32);
    expect(new Set(out.map((c) => c.id)).size).toBe(32);
    expect([...out].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...DECK].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it("is deterministic for a seeded rng and changes the order", () => {
    const a = shuffle(DECK, seededRng(11));
    const b = shuffle(DECK, seededRng(11));
    expect(a).toEqual(b);
    expect(a.map((c) => c.id)).not.toEqual(DECK.map((c) => c.id));
  });
});

describe("dealOrder", () => {
  it("starts right of the dealer and goes counter-clockwise", () => {
    for (const dealer of SEATS) {
      const order = dealOrder(dealer);
      expect(order).toHaveLength(4);
      expect(order[0]).toBe(nextSeat(dealer));
      expect(order[1]).toBe(nextSeat(order[0]!));
      expect(order[2]).toBe(nextSeat(order[1]!));
      expect(order[3]).toBe(dealer);
    }
  });
});

describe("dealHands", () => {
  it("gives four disjoint hands of 8 covering the deck", () => {
    const hands = dealHands(seededRng(5), 0);
    expect(hands).toHaveLength(4);
    const ids = hands.flatMap((h) => h.map((c) => c.id));
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
    for (const hand of hands) {
      expect(hand).toHaveLength(8);
    }
  });

  it("is reproducible for the same seed and differs for another", () => {
    expect(dealHands(seededRng(99), 2)).toEqual(dealHands(seededRng(99), 2));
    expect(dealHands(seededRng(99), 2)).not.toEqual(dealHands(seededRng(100), 2));
  });

  it("deals 3+2 to each seat in deal order, then 3 more after bidding", () => {
    const dealer: Seat = 1;
    const deck = shuffle(DECK, seededRng(5));
    const hands = dealHands(seededRng(5), dealer);
    const order = dealOrder(dealer);
    order.forEach((seat, i) => {
      const hand = hands[seat]!;
      expect(hand.slice(0, 3)).toEqual(deck.slice(i * 3, i * 3 + 3));
      expect(hand.slice(3, 5)).toEqual(deck.slice(12 + i * 2, 12 + i * 2 + 2));
      expect(hand.slice(5, 8)).toEqual(deck.slice(20 + i * 3, 20 + i * 3 + 3));
    });
  });

  it("indexes hands by seat, with the first cards going right of the dealer", () => {
    const deck = shuffle(DECK, seededRng(8));
    for (const dealer of SEATS) {
      const hands = dealHands(seededRng(8), dealer);
      expect(hands[nextSeat(dealer)]![0]).toEqual(deck[0]);
    }
  });

  it("defaults the dealer to seat 0", () => {
    expect(dealHands(seededRng(4))).toEqual(dealHands(seededRng(4), 0));
  });
});
