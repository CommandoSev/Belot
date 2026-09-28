import { describe, expect, it } from "vitest";
import { DECK, cardFromId } from "../cards";
import { seededRng, shuffle } from "../deal";
import {
  belotAvailable,
  belotSuitFor,
  compareDeclarations,
  detectDeclarations,
  type Declaration,
} from "../declarations";
import { CONTRACTS, type Card, type CardId, type Suit } from "../types";

const hand = (...ids: CardId[]): Card[] => ids.map(cardFromId);
const ids = (cards: Card[]) => cards.map((c) => c.id).sort();

/** Detects in a suit contract and asserts exactly one declaration came back. */
const single = (...cards: CardId[]): Declaration => {
  const found = detectDeclarations(hand(...cards), "clubs");
  expect(found).toHaveLength(1);
  return found[0]!;
};

describe("detectDeclarations: sequences", () => {
  it("7 8 9 of one suit is a терца worth 20", () => {
    const d = single("7S", "8S", "9S", "AC", "KD", "10H", "JD", "7C");
    expect(d).toMatchObject({ kind: "sequence", length: 3, points: 20, topRank: "9" });
    expect(ids(d.cards)).toEqual(["7S", "8S", "9S"]);
  });

  it("10 J Q K of one suit is a кварта worth 50", () => {
    const d = single("10D", "JD", "QD", "KD", "7S", "9C", "AH", "8H");
    expect(d).toMatchObject({ kind: "sequence", length: 4, points: 50, topRank: "K" });
    expect(ids(d.cards)).toEqual(["10D", "JD", "KD", "QD"]);
  });

  it("five in a row is a квинта worth 100", () => {
    const d = single("9H", "10H", "JH", "QH", "KH", "7S", "8C", "AD");
    expect(d).toMatchObject({ kind: "sequence", length: 5, points: 100, topRank: "K" });
  });

  it("six in a row is still one declaration worth 100 recording all six cards", () => {
    const d = single("8H", "9H", "10H", "JH", "QH", "KH", "7S", "AD");
    expect(d).toMatchObject({ kind: "sequence", length: 5, points: 100, topRank: "K" });
    expect(ids(d.cards)).toEqual(["10H", "8H", "9H", "JH", "KH", "QH"]);
  });

  it("uses the plain 7..A order, not the trump order", () => {
    // 9 J Q are neighbours only in the trump order.
    expect(detectDeclarations(hand("9H", "JH", "QH", "7S", "8C", "AD", "KC", "10S"), "hearts")).toEqual([]);
    // 8 9 10 is a run even though 9 sits near the top of the trump order.
    const [d] = detectDeclarations(hand("8H", "9H", "10H", "7S", "AC", "KD", "QC", "JD"), "hearts");
    expect(d).toMatchObject({ kind: "sequence", length: 3, points: 20, topRank: "10" });
  });

  it("returns two sequences in different suits", () => {
    const found = detectDeclarations(hand("7S", "8S", "9S", "QH", "KH", "AH", "10C", "JD"), "clubs");
    expect(found).toHaveLength(2);
    expect(found.map((d) => d.kind)).toEqual(["sequence", "sequence"]);
    expect(found.map((d) => d.points)).toEqual([20, 20]);
    expect(found.flatMap((d) => ids(d.cards)).sort()).toEqual(["7S", "8S", "9S", "AH", "KH", "QH"]);
  });

  it("does not join runs across suits", () => {
    expect(detectDeclarations(hand("7S", "8S", "9H", "10C", "JD", "QS", "KH", "AC"), "clubs")).toEqual([]);
  });

  it("sorts declarations by points descending", () => {
    const found = detectDeclarations(hand("7S", "8S", "9S", "10H", "JH", "QH", "KH", "AD"), "clubs");
    expect(found.map((d) => d.points)).toEqual([50, 20]);
  });
});

describe("detectDeclarations: карета", () => {
  it("four jacks are worth 200", () => {
    const d = single("JC", "JD", "JH", "JS", "7C", "8D", "9H", "AS");
    expect(d).toMatchObject({ kind: "carre", rank: "J", points: 200 });
    expect(ids(d.cards)).toEqual(["JC", "JD", "JH", "JS"]);
  });

  it("four nines are worth 150", () => {
    expect(single("9C", "9D", "9H", "9S", "7C", "8D", "JH", "AS")).toMatchObject({
      kind: "carre",
      rank: "9",
      points: 150,
    });
  });

  it("four aces are worth 100, as are 10s, Qs and Ks", () => {
    for (const rank of ["A", "10", "Q", "K"] as const) {
      const d = single(`${rank}C`, `${rank}D`, `${rank}H`, `${rank}S`, "7C", "8D", "9H", "7S");
      expect(d).toMatchObject({ kind: "carre", rank, points: 100 });
    }
  });

  it("four eights and four sevens are worth nothing", () => {
    expect(detectDeclarations(hand("8C", "8D", "8H", "8S", "7C", "AD", "KH", "QS"), "clubs")).toEqual([]);
    expect(detectDeclarations(hand("7C", "7D", "7H", "7S", "8C", "AD", "KH", "QS"), "clubs")).toEqual([]);
  });

  it("returns two карета in one hand", () => {
    const found = detectDeclarations(hand("JC", "JD", "JH", "JS", "9C", "9D", "9H", "9S"), "clubs");
    expect(found.map((d) => d.points)).toEqual([200, 150]);
  });
});

describe("detectDeclarations: каре and sequence overlap", () => {
  it("keeps four jacks over a 10 J Q терца that would use one of them", () => {
    expect(single("JC", "JD", "JH", "JS", "10S", "QS", "7C", "8D")).toMatchObject({
      kind: "carre",
      rank: "J",
      points: 200,
    });
  });

  it("keeps the каре and whatever run survives without the shared card", () => {
    // Four jacks (200) + Q K A терца (20) beats the 10 J Q K A квинта (100).
    const found = detectDeclarations(hand("JC", "JD", "JH", "JS", "10S", "QS", "KS", "AS"), "clubs");
    expect(found.map((d) => [d.kind, d.points])).toEqual([
      ["carre", 200],
      ["sequence", 20],
    ]);
    expect(found[1]).toMatchObject({ kind: "sequence", length: 3, topRank: "A" });
    expect(ids(found[1]!.cards)).toEqual(["AS", "KS", "QS"]);
  });

  it("prefers the каре when both assignments are worth the same", () => {
    // Four tens (100) leave 8 9 and J Q, versus the 8 9 10 J Q квинта (100).
    expect(single("10C", "10D", "10S", "10H", "8H", "9H", "JH", "QH")).toMatchObject({
      kind: "carre",
      rank: "10",
      points: 100,
    });
  });

  it("lets a worthless каре of eights serve a sequence instead", () => {
    const d = single("8C", "8D", "8H", "8S", "7S", "9S", "10S", "AD");
    expect(d).toMatchObject({ kind: "sequence", length: 4, points: 50, topRank: "10" });
    expect(ids(d.cards)).toEqual(["10S", "7S", "8S", "9S"]);
  });

  it("never uses a card in both a каре and a sequence", () => {
    const found = detectDeclarations(hand("9C", "9D", "9H", "9S", "7S", "8S", "10S", "JS"), "clubs");
    const used = found.flatMap((d) => d.cards.map((c) => c.id));
    expect(new Set(used).size).toBe(used.length);
    expect(found.map((d) => [d.kind, d.points])).toEqual([["carre", 150]]);
  });
});

describe("detectDeclarations: contracts", () => {
  const rich = hand("JC", "JD", "JH", "JS", "7S", "8S", "9S", "10S");

  it("returns nothing in без коз", () => {
    expect(detectDeclarations(rich, "notrumps")).toEqual([]);
  });

  it("detects in every suit contract and in всички козове", () => {
    for (const contract of CONTRACTS) {
      if (contract === "notrumps") continue;
      expect(detectDeclarations(rich, contract).map((d) => d.points)).toEqual([200, 50]);
    }
  });

  it("does not mutate the hand", () => {
    const h = hand("JC", "JD", "JH", "JS", "10S", "QS", "KS", "AS");
    const before = h.map((c) => c.id);
    detectDeclarations(h, "clubs");
    expect(h.map((c) => c.id)).toEqual(before);
  });
});

describe("belotSuitFor", () => {
  it("is the trump suit for K and Q in a suit contract", () => {
    expect(belotSuitFor(cardFromId("KH"), "hearts")).toBe("H");
    expect(belotSuitFor(cardFromId("QH"), "hearts")).toBe("H");
    expect(belotSuitFor(cardFromId("KS"), "hearts")).toBeNull();
  });

  it("is any suit in всички козове and never in без коз", () => {
    expect(belotSuitFor(cardFromId("KS"), "alltrumps")).toBe("S");
    expect(belotSuitFor(cardFromId("QC"), "alltrumps")).toBe("C");
    expect(belotSuitFor(cardFromId("KH"), "notrumps")).toBeNull();
  });

  it("is null for ranks other than K and Q", () => {
    expect(belotSuitFor(cardFromId("AH"), "hearts")).toBeNull();
    expect(belotSuitFor(cardFromId("JH"), "alltrumps")).toBeNull();
  });
});

describe("belotAvailable", () => {
  it("is offered when playing K of trump while holding Q of trump", () => {
    expect(belotAvailable(hand("KH", "QH", "7S", "8C"), cardFromId("KH"), "hearts")).toBe(true);
  });

  it("is offered when playing Q of trump while holding K of trump", () => {
    expect(belotAvailable(hand("KH", "QH", "7S", "8C"), cardFromId("QH"), "hearts")).toBe(true);
  });

  it("is not offered when the partner card was already played", () => {
    expect(belotAvailable(hand("KH", "7S", "8C"), cardFromId("KH"), "hearts")).toBe(false);
    expect(belotAvailable(hand("QH", "7S", "8C"), cardFromId("QH"), "hearts")).toBe(false);
  });

  it("is not offered for K and Q of a non-trump suit in a suit contract", () => {
    expect(belotAvailable(hand("KS", "QS", "7H", "8C"), cardFromId("KS"), "hearts")).toBe(false);
  });

  it("is offered in any suit in всички козове", () => {
    expect(belotAvailable(hand("KS", "QS", "7H", "8C"), cardFromId("KS"), "alltrumps")).toBe(true);
    expect(belotAvailable(hand("KC", "QC", "7H", "8S"), cardFromId("QC"), "alltrumps")).toBe(true);
  });

  it("is never offered in без коз", () => {
    expect(belotAvailable(hand("KH", "QH", "7S", "8C"), cardFromId("KH"), "notrumps")).toBe(false);
  });

  it("is not offered for other ranks", () => {
    expect(belotAvailable(hand("KH", "QH", "AH"), cardFromId("AH"), "hearts")).toBe(false);
  });

  it("works whether or not the played card is still listed in the hand", () => {
    expect(belotAvailable(hand("QH", "7S"), cardFromId("KH"), "hearts")).toBe(true);
  });
});

describe("compareDeclarations", () => {
  const terca = (suit: Suit, top: "9" | "10" | "A" = "9") =>
    top === "9"
      ? single(`7${suit}`, `8${suit}`, `9${suit}`)
      : top === "10"
        ? single(`8${suit}`, `9${suit}`, `10${suit}`)
        : single(`Q${suit}`, `K${suit}`, `A${suit}`);
  const kvarta = (suit: Suit) => single(`7${suit}`, `8${suit}`, `9${suit}`, `10${suit}`);
  const carre = (rank: "J" | "9" | "A" | "K") => single(`${rank}C`, `${rank}D`, `${rank}H`, `${rank}S`);

  it("side A with a кварта scores all its sequences, side B with a терца scores none", () => {
    const result = compareDeclarations([kvarta("S"), terca("H")], [terca("C", "A")]);
    expect(result).toEqual({ sequencesTo: 0, carresTo: null, points: [70, 0] });
  });

  it("side B wins when it holds the longer sequence", () => {
    const result = compareDeclarations([terca("H", "A")], [kvarta("C")]);
    expect(result).toEqual({ sequencesTo: 1, carresTo: null, points: [0, 50] });
  });

  it("equal length: the higher top card wins", () => {
    expect(compareDeclarations([terca("H", "9")], [terca("C", "10")])).toEqual({
      sequencesTo: 1,
      carresTo: null,
      points: [0, 20],
    });
    expect(compareDeclarations([terca("H", "A"), terca("D")], [terca("C", "10")])).toEqual({
      sequencesTo: 0,
      carresTo: null,
      points: [40, 0],
    });
  });

  it("identical length and top card: neither side scores sequences", () => {
    const result = compareDeclarations([terca("H", "9"), terca("D", "9")], [terca("C", "9")]);
    expect(result).toEqual({ sequencesTo: null, carresTo: null, points: [0, 0] });
  });

  it("compares the best sequence, not the count or the sum", () => {
    const result = compareDeclarations([terca("H"), terca("D"), terca("S")], [kvarta("C")]);
    expect(result).toEqual({ sequencesTo: 1, carresTo: null, points: [0, 50] });
  });

  it("карета compare independently from sequences", () => {
    const result = compareDeclarations([kvarta("S"), carre("A")], [terca("C"), carre("J")]);
    expect(result).toEqual({ sequencesTo: 0, carresTo: 1, points: [50, 200] });
  });

  it("higher каре points win and the winner scores all its карета", () => {
    const result = compareDeclarations([carre("9"), carre("K")], [carre("A")]);
    expect(result).toEqual({ sequencesTo: null, carresTo: 0, points: [250, 0] });
  });

  it("equal каре points: the higher rank wins; an exact tie scores nothing", () => {
    expect(compareDeclarations([carre("K")], [carre("A")])).toEqual({
      sequencesTo: null,
      carresTo: 1,
      points: [0, 100],
    });
    const same = carre("A");
    expect(compareDeclarations([same], [same])).toEqual({ sequencesTo: null, carresTo: null, points: [0, 0] });
  });

  it("a side with declarations against a side with none scores them all", () => {
    const result = compareDeclarations([], [terca("C"), carre("J")]);
    expect(result).toEqual({ sequencesTo: 1, carresTo: 1, points: [0, 220] });
  });

  it("returns nulls and zeros when nobody declared", () => {
    expect(compareDeclarations([], [])).toEqual({ sequencesTo: null, carresTo: null, points: [0, 0] });
  });
});

describe("detectDeclarations over random 8-card subsets", () => {
  it("never throws and keeps its invariants for 2000 seeded hands in every contract", () => {
    const rng = seededRng(2026);
    for (let i = 0; i < 2000; i++) {
      const cards = shuffle(DECK, rng).slice(0, 8);
      for (const contract of CONTRACTS) {
        const found = detectDeclarations(cards, contract);
        const used = found.flatMap((d) => d.cards.map((c) => c.id));
        expect(new Set(used).size).toBe(used.length);
        for (const id of used) expect(cards.some((c) => c.id === id)).toBe(true);
        for (let k = 1; k < found.length; k++) {
          expect(found[k - 1]!.points).toBeGreaterThanOrEqual(found[k]!.points);
        }
        if (contract === "notrumps") expect(found).toEqual([]);
        for (const card of cards) expect(typeof belotAvailable(cards, card, contract)).toBe("boolean");
      }
    }
  });
});
