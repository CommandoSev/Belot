import { describe, expect, it } from "vitest";
import {
  DECK,
  cardFromId,
  cardOrder,
  cardPoints,
  makeCard,
  strengthFor,
  type CardStrength,
} from "../cards";
import { CONTRACTS, RANKS, SUITS, type Contract, type Rank, type Suit } from "../types";

describe("deck", () => {
  it("has 32 unique cards, 8 per suit and 4 per rank", () => {
    expect(DECK).toHaveLength(32);
    expect(new Set(DECK.map((c) => c.id)).size).toBe(32);
    for (const suit of SUITS) {
      expect(DECK.filter((c) => c.suit === suit)).toHaveLength(8);
    }
    for (const rank of RANKS) {
      expect(DECK.filter((c) => c.rank === rank)).toHaveLength(4);
    }
  });

  it("makeCard builds the rank+suit id", () => {
    expect(makeCard("J", "S")).toEqual({ id: "JS", rank: "J", suit: "S" });
    expect(makeCard("10", "H")).toEqual({ id: "10H", rank: "10", suit: "H" });
  });

  it("cardFromId round-trips every card in the deck", () => {
    for (const card of DECK) {
      expect(cardFromId(card.id)).toEqual(card);
    }
  });

  it("cardFromId rejects malformed ids", () => {
    expect(() => cardFromId("1S" as never)).toThrow();
    expect(() => cardFromId("JX" as never)).toThrow();
    expect(() => cardFromId("" as never)).toThrow();
  });
});

describe("strengthFor", () => {
  it("marks only the trump suit as trump in a suit contract", () => {
    const cases: [Contract, Suit][] = [
      ["clubs", "C"],
      ["diamonds", "D"],
      ["hearts", "H"],
      ["spades", "S"],
    ];
    for (const [contract, trump] of cases) {
      for (const suit of SUITS) {
        expect(strengthFor(contract, suit)).toBe(suit === trump ? "trump" : "plain");
      }
    }
  });

  it("treats every suit as trump in alltrumps and plain in notrumps", () => {
    for (const suit of SUITS) {
      expect(strengthFor("alltrumps", suit)).toBe("trump");
      expect(strengthFor("notrumps", suit)).toBe("plain");
    }
  });
});

describe("cardOrder", () => {
  it("orders trump ranks 7 8 Q K 10 A 9 J", () => {
    const expected: Rank[] = ["7", "8", "Q", "K", "10", "A", "9", "J"];
    expected.forEach((rank, index) => expect(cardOrder(rank, "trump")).toBe(index));
  });

  it("orders plain ranks 7 8 9 J Q K 10 A", () => {
    const expected: Rank[] = ["7", "8", "9", "J", "Q", "K", "10", "A"];
    expected.forEach((rank, index) => expect(cardOrder(rank, "plain")).toBe(index));
  });

  it("gives every rank a distinct index within a strength", () => {
    for (const strength of ["trump", "plain"] as const) {
      const indices = RANKS.map((rank) => cardOrder(rank, strength));
      expect(new Set(indices).size).toBe(8);
      expect(Math.min(...indices)).toBe(0);
      expect(Math.max(...indices)).toBe(7);
    }
  });
});

describe("cardPoints", () => {
  const trumpTable: Record<Rank, number> = { J: 20, "9": 14, A: 11, "10": 10, K: 4, Q: 3, "8": 0, "7": 0 };
  const plainTable: Record<Rank, number> = { A: 11, "10": 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 };

  it("matches the trump table for every rank in a suit contract", () => {
    for (const rank of RANKS) {
      expect(cardPoints(rank, "trump", "hearts")).toBe(trumpTable[rank]);
    }
  });

  it("matches the plain table for every rank in a suit contract", () => {
    for (const rank of RANKS) {
      expect(cardPoints(rank, "plain", "hearts")).toBe(plainTable[rank]);
    }
  });

  it("uses trump values in every suit for alltrumps", () => {
    for (const suit of SUITS) {
      const strength = strengthFor("alltrumps", suit);
      for (const rank of RANKS) {
        expect(cardPoints(rank, strength, "alltrumps")).toBe(trumpTable[rank]);
      }
    }
  });

  it("doubles plain values in notrumps", () => {
    for (const suit of SUITS) {
      const strength = strengthFor("notrumps", suit);
      for (const rank of RANKS) {
        expect(cardPoints(rank, strength, "notrumps")).toBe(plainTable[rank] * 2);
      }
    }
  });

  it("does not double in any other contract", () => {
    const others = CONTRACTS.filter((c) => c !== "notrumps");
    for (const contract of others) {
      for (const strength of ["trump", "plain"] as CardStrength[]) {
        const table = strength === "trump" ? trumpTable : plainTable;
        for (const rank of RANKS) {
          expect(cardPoints(rank, strength, contract)).toBe(table[rank]);
        }
      }
    }
  });

  it("sums to the known deck totals per contract kind", () => {
    const total = (contract: Contract) =>
      DECK.reduce((sum, c) => sum + cardPoints(c.rank, strengthFor(contract, c.suit), contract), 0);
    expect(total("spades")).toBe(152); // 62 trump + 3 * 30 plain
    expect(total("alltrumps")).toBe(248); // 4 * 62
    expect(total("notrumps")).toBe(240); // 4 * 30 * 2
  });
});
