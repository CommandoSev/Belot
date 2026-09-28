import { describe, expect, it } from "vitest";
import { DECK } from "../cards";
import { DEFAULT_CONFIG, type EngineConfig } from "../config";
import type { Declaration } from "../declarations";
import {
  applyDealToMatch,
  createMatch,
  redealMatch,
  roundPoints,
  scoreDeal,
  type DealInput,
  type DealScore,
  type MatchState,
} from "../scoring";
import { cardPointsOf } from "../tricks";
import { type Card, type Contract, type Multiplier, type Seat } from "../types";

/** Picks a subset of `pool` whose card points under `contract` sum to exactly `target`. */
function pickCards(pool: readonly Card[], contract: Contract, target: number): Card[] {
  const points = pool.map((card) => cardPointsOf([card], contract));
  // reachable[i][t]: can cards i.. sum to t
  const reachable: boolean[][] = Array.from({ length: pool.length + 1 }, () => Array<boolean>(target + 1).fill(false));
  reachable[pool.length]![0] = true;
  for (let i = pool.length - 1; i >= 0; i--) {
    for (let t = 0; t <= target; t++) {
      reachable[i]![t] = reachable[i + 1]![t] || (t >= points[i]! && reachable[i + 1]![t - points[i]!]!);
    }
  }
  if (!reachable[0]![target]) throw new Error(`Cannot reach ${target} card points under ${contract}`);
  const chosen: Card[] = [];
  let remaining = target;
  for (let i = 0; i < pool.length; i++) {
    if (reachable[i + 1]![remaining]) continue;
    chosen.push(pool[i]!);
    remaining -= points[i]!;
  }
  return chosen;
}

const terca: Declaration = {
  kind: "sequence",
  length: 3,
  cards: [],
  points: 20,
  topRank: "9",
};

interface Scenario {
  contract?: Contract;
  bidder?: Seat;
  multiplier?: Multiplier;
  /** Card points per team; the cards are drawn from a single deck so the two sets never overlap. */
  cards?: [number, number];
  lastTrickWinner?: Seat;
  declarations?: [Declaration[], Declaration[]];
  belots?: [number, number];
  hangingBefore?: number;
  valatBy?: 0 | 1;
}

function input(s: Scenario = {}): DealInput {
  const contract = s.contract ?? "hearts";
  const [a, b] = s.cards ?? [0, 0];
  let wonCards: [Card[], Card[]];
  if (s.valatBy !== undefined) {
    wonCards = s.valatBy === 0 ? [[...DECK], []] : [[], [...DECK]];
  } else {
    const team0 = pickCards(DECK, contract, a);
    const taken = new Set(team0.map((card) => card.id));
    const team1 = pickCards(
      DECK.filter((card) => !taken.has(card.id)),
      contract,
      b,
    );
    wonCards = [team0, team1];
  }
  return {
    contract,
    bidder: s.bidder ?? 0,
    multiplier: s.multiplier ?? 1,
    wonCards,
    lastTrickWinner: s.lastTrickWinner ?? 0,
    declarations: s.declarations ?? [[], []],
    belots: s.belots ?? [0, 0],
    hangingBefore: s.hangingBefore ?? 0,
  };
}

const awarded = (deal: DealScore): [number, number] => [deal.teams[0].awarded, deal.teams[1].awarded];
const raw = (deal: DealScore): [number, number] => [deal.teams[0].raw, deal.teams[1].raw];

describe("roundPoints", () => {
  it("rounds a suit contract up from a units digit of 6", () => {
    expect(roundPoints(86, "hearts", DEFAULT_CONFIG)).toBe(9);
    expect(roundPoints(76, "hearts", DEFAULT_CONFIG)).toBe(8);
    expect(roundPoints(85, "hearts", DEFAULT_CONFIG)).toBe(8);
    expect(roundPoints(85, "clubs", DEFAULT_CONFIG)).toBe(8);
    expect(roundPoints(85, "diamonds", DEFAULT_CONFIG)).toBe(8);
    expect(roundPoints(85, "spades", DEFAULT_CONFIG)).toBe(8);
  });

  it("rounds всички козове up from 4 and без коз up from 5", () => {
    expect(roundPoints(124, "alltrumps", DEFAULT_CONFIG)).toBe(13);
    expect(roundPoints(123, "alltrumps", DEFAULT_CONFIG)).toBe(12);
    expect(roundPoints(135, "notrumps", DEFAULT_CONFIG)).toBe(14);
    expect(roundPoints(134, "notrumps", DEFAULT_CONFIG)).toBe(13);
  });

  it("honours a custom threshold", () => {
    const config: EngineConfig = { ...DEFAULT_CONFIG, roundingThreshold: { suit: 5, notrumps: 5, alltrumps: 5 } };
    expect(roundPoints(85, "hearts", config)).toBe(9);
    expect(roundPoints(84, "hearts", config)).toBe(8);
  });

  it("rounds zero to zero", () => {
    expect(roundPoints(0, "hearts", DEFAULT_CONFIG)).toBe(0);
  });
});

describe("scoreDeal breakdown", () => {
  it("sums card points, last trick, declarations, белот and валат into raw", () => {
    const deal = scoreDeal(
      input({
        contract: "spades",
        cards: [60, 92],
        lastTrickWinner: 2,
        declarations: [[terca], []],
        belots: [1, 0],
      }),
    );
    expect(deal.teams[0]).toMatchObject({ cardPoints: 60, lastTrick: 10, declarations: 20, belots: 20, valat: 0, raw: 110 });
    expect(deal.teams[1]).toMatchObject({ cardPoints: 92, lastTrick: 0, declarations: 0, belots: 0, valat: 0, raw: 92 });
  });

  it("credits the last trick to the team of the seat that won it", () => {
    const deal = scoreDeal(input({ cards: [76, 76], lastTrickWinner: 3 }));
    expect(deal.teams[0].lastTrick).toBe(0);
    expect(deal.teams[1].lastTrick).toBe(10);
  });

  it("uses the configured last-trick bonus", () => {
    const deal = scoreDeal(input({ cards: [76, 76] }), { ...DEFAULT_CONFIG, lastTrickBonus: 5 });
    expect(deal.teams[0].lastTrick).toBe(5);
  });

  it("scores белот at 20 per announcement", () => {
    const deal = scoreDeal(input({ cards: [76, 76], belots: [2, 1] }));
    expect(deal.teams[0].belots).toBe(40);
    expect(deal.teams[1].belots).toBe(20);
  });

  it("settles declarations through the comparison so only the stronger side scores", () => {
    const kvarta: Declaration = { kind: "sequence", length: 4, cards: [], points: 50, topRank: "10" };
    const deal = scoreDeal(input({ cards: [76, 76], declarations: [[terca], [kvarta]] }));
    expect(deal.teams[0].declarations).toBe(0);
    expect(deal.teams[1].declarations).toBe(50);
  });

  it("doubles card points in без коз", () => {
    const deal = scoreDeal(input({ contract: "notrumps", cards: [130, 110] }));
    expect(deal.teams[0].cardPoints).toBe(130);
    expect(deal.teams[1].cardPoints).toBe(110);
  });
});

describe("scoreDeal comparison", () => {
  it("AE1: купа, bidders 86 raw vs 76 -> 9 and 8", () => {
    const deal = scoreDeal(input({ contract: "hearts", bidder: 0, cards: [76, 76], lastTrickWinner: 0 }));
    expect(raw(deal)).toEqual([86, 76]);
    expect(deal.result).toBe("won");
    expect(deal.teams[0].rounded).toBe(9);
    expect(deal.teams[1].rounded).toBe(8);
    expect(awarded(deal)).toEqual([9, 8]);
    expect(deal.valatBy).toBeNull();
    expect(deal.hangingAfter).toBe(0);
  });

  it("bidders win 100 to 62 -> 10 and 6", () => {
    const deal = scoreDeal(input({ contract: "hearts", bidder: 1, cards: [62, 90], lastTrickWinner: 3 }));
    expect(raw(deal)).toEqual([62, 100]);
    expect(deal.result).toBe("won");
    expect(awarded(deal)).toEqual([6, 10]);
  });

  it("AE2: пика, bidders 70 vs 92 fall inside -> opponents 16, bidders 0", () => {
    const deal = scoreDeal(input({ contract: "spades", bidder: 0, cards: [70, 82], lastTrickWinner: 1 }));
    expect(raw(deal)).toEqual([70, 92]);
    expect(deal.result).toBe("inside");
    expect(awarded(deal)).toEqual([0, 16]);
    expect(deal.teams[0].rounded).toBe(7);
    expect(deal.teams[1].rounded).toBe(9);
  });

  it("AE3: каро, 81 vs 81 -> opponents 8, 8 hang", () => {
    const deal = scoreDeal(input({ contract: "diamonds", bidder: 2, cards: [71, 81], lastTrickWinner: 0 }));
    expect(raw(deal)).toEqual([81, 81]);
    expect(deal.result).toBe("hanging");
    expect(awarded(deal)).toEqual([0, 8]);
    expect(deal.hangingAfter).toBe(8);
  });

  it("the next deal's winner receives the hanging points", () => {
    const deal = scoreDeal(input({ contract: "hearts", bidder: 0, cards: [90, 62], hangingBefore: 8 }));
    expect(deal.result).toBe("won");
    expect(deal.hangingBefore).toBe(8);
    expect(awarded(deal)).toEqual([18, 6]);
    expect(deal.hangingAfter).toBe(0);
  });

  it("hanging points go to the opponents when the bidders fall inside", () => {
    const deal = scoreDeal(input({ contract: "hearts", bidder: 0, cards: [70, 82], lastTrickWinner: 1, hangingBefore: 8 }));
    expect(deal.result).toBe("inside");
    expect(awarded(deal)).toEqual([0, 24]);
    expect(deal.hangingAfter).toBe(0);
  });

  it("AE4: контра on спатия, bidders 100 vs 62 -> 32 and 0", () => {
    const deal = scoreDeal(input({ contract: "clubs", bidder: 0, multiplier: 2, cards: [90, 62] }));
    expect(raw(deal)).toEqual([100, 62]);
    expect(deal.result).toBe("won");
    expect(awarded(deal)).toEqual([32, 0]);
  });

  it("реконтра quadruples the rounded total", () => {
    const deal = scoreDeal(input({ contract: "clubs", bidder: 0, multiplier: 4, cards: [90, 62] }));
    expect(awarded(deal)).toEqual([64, 0]);
  });

  it("контра lost by the bidders pays the opponents the doubled total", () => {
    const deal = scoreDeal(input({ contract: "clubs", bidder: 0, multiplier: 2, cards: [62, 90], lastTrickWinner: 1 }));
    expect(raw(deal)).toEqual([62, 100]);
    expect(deal.result).toBe("inside");
    expect(awarded(deal)).toEqual([0, 32]);
  });

  it("контра with a tie hangs the doubled total and awards nothing", () => {
    const deal = scoreDeal(input({ contract: "diamonds", bidder: 0, multiplier: 2, cards: [71, 81] }));
    expect(raw(deal)).toEqual([81, 81]);
    expect(deal.result).toBe("hanging");
    expect(awarded(deal)).toEqual([0, 0]);
    expect(deal.hangingAfter).toBe(32);
  });

  it("контра win also collects earlier hanging points", () => {
    const deal = scoreDeal(input({ contract: "clubs", bidder: 0, multiplier: 2, cards: [90, 62], hangingBefore: 7 }));
    expect(awarded(deal)).toEqual([39, 0]);
    expect(deal.hangingAfter).toBe(0);
  });

  it("declarations count toward the comparison: 80 in cards plus терца beats 82", () => {
    const deal = scoreDeal(
      input({ contract: "hearts", bidder: 0, cards: [70, 82], lastTrickWinner: 0, declarations: [[terca], []] }),
    );
    expect(raw(deal)).toEqual([100, 82]);
    expect(deal.result).toBe("won");
    expect(awarded(deal)).toEqual([10, 8]);
  });

  it("another tie accumulates on top of earlier hanging points", () => {
    const deal = scoreDeal(input({ contract: "diamonds", bidder: 0, cards: [71, 81], hangingBefore: 8 }));
    expect(deal.result).toBe("hanging");
    expect(awarded(deal)).toEqual([0, 8]);
    expect(deal.hangingAfter).toBe(16);
  });
});

describe("scoreDeal валат", () => {
  it("AE5: bidders taking all eight tricks in всички козове add 90 and the last trick", () => {
    const deal = scoreDeal(input({ contract: "alltrumps", bidder: 0, valatBy: 0, lastTrickWinner: 2 }));
    expect(deal.valatBy).toBe(0);
    expect(deal.teams[0]).toMatchObject({ cardPoints: 248, lastTrick: 10, valat: 90, raw: 348, rounded: 35, awarded: 35 });
    expect(deal.teams[1]).toMatchObject({ cardPoints: 0, lastTrick: 0, valat: 0, raw: 0, rounded: 0, awarded: 0 });
    expect(deal.result).toBe("won");
  });

  it("валат by the opponents puts the bidders inside", () => {
    const deal = scoreDeal(input({ contract: "hearts", bidder: 0, valatBy: 1, lastTrickWinner: 1 }));
    expect(deal.valatBy).toBe(1);
    expect(deal.teams[1]).toMatchObject({ cardPoints: 152, lastTrick: 10, valat: 90, raw: 252 });
    expect(deal.result).toBe("inside");
    expect(awarded(deal)).toEqual([0, 25]);
  });

  it("uses the configured валат bonus", () => {
    const deal = scoreDeal(input({ contract: "hearts", valatBy: 0 }), { ...DEFAULT_CONFIG, valatBonus: 100 });
    expect(deal.teams[0].valat).toBe(100);
  });

  it("no валат when the other side won at least one card", () => {
    const base = input({ contract: "hearts" });
    const [seven, ...rest] = DECK;
    const deal = scoreDeal({ ...base, wonCards: [rest, [seven!]] });
    expect(deal.teams[0].cardPoints).toBe(152);
    expect(deal.valatBy).toBeNull();
    expect(deal.teams[0].valat).toBe(0);
  });
});

describe("match", () => {
  const won = (cards: [number, number], extra: Scenario = {}): DealScore =>
    scoreDeal(input({ contract: "hearts", bidder: 0, cards, lastTrickWinner: 0, ...extra }));

  it("createMatch starts at zero with the given dealer", () => {
    expect(createMatch(2)).toEqual<MatchState>({ scores: [0, 0], hanging: 0, dealer: 2, dealNumber: 1, winner: null });
  });

  it("applyDealToMatch adds awarded points, moves the dealer and counts the deal", () => {
    const match = applyDealToMatch(createMatch(3), won([90, 62]), DEFAULT_CONFIG);
    expect(match).toEqual<MatchState>({ scores: [10, 6], hanging: 0, dealer: 0, dealNumber: 2, winner: null });
  });

  it("redealMatch advances the dealer only", () => {
    const match: MatchState = { scores: [40, 30], hanging: 5, dealer: 1, dealNumber: 4, winner: null };
    expect(redealMatch(match)).toEqual<MatchState>({ ...match, dealer: 2 });
  });

  it("stores the hanging amount and clears it once awarded", () => {
    let match = createMatch(0);
    const tie = scoreDeal(input({ contract: "diamonds", bidder: 0, cards: [71, 81], hangingBefore: match.hanging }));
    match = applyDealToMatch(match, tie, DEFAULT_CONFIG);
    expect(match.scores).toEqual([0, 8]);
    expect(match.hanging).toBe(8);

    const next = won([90, 62], { hangingBefore: match.hanging });
    match = applyDealToMatch(match, next, DEFAULT_CONFIG);
    expect(match.scores).toEqual([18, 14]);
    expect(match.hanging).toBe(0);
  });

  it("two consecutive ties accumulate and the next decided deal awards it all", () => {
    let match = createMatch(0);
    const tie = (hangingBefore: number) =>
      scoreDeal(input({ contract: "diamonds", bidder: 0, cards: [71, 81], hangingBefore }));
    match = applyDealToMatch(match, tie(match.hanging), DEFAULT_CONFIG);
    match = applyDealToMatch(match, tie(match.hanging), DEFAULT_CONFIG);
    expect(match.scores).toEqual([0, 16]);
    expect(match.hanging).toBe(16);

    const inside = scoreDeal(
      input({ contract: "hearts", bidder: 0, cards: [70, 82], lastTrickWinner: 1, hangingBefore: match.hanging }),
    );
    match = applyDealToMatch(match, inside, DEFAULT_CONFIG);
    expect(match.scores).toEqual([0, 48]);
    expect(match.hanging).toBe(0);
  });

  it("the first side to reach the target wins", () => {
    const start: MatchState = { scores: [145, 100], hanging: 0, dealer: 0, dealNumber: 9, winner: null };
    const match = applyDealToMatch(start, won([90, 62]), DEFAULT_CONFIG);
    expect(match.scores).toEqual([155, 106]);
    expect(match.winner).toBe(0);
  });

  it("reaching exactly the target wins", () => {
    const start: MatchState = { scores: [141, 100], hanging: 0, dealer: 0, dealNumber: 9, winner: null };
    const match = applyDealToMatch(start, won([90, 62]), DEFAULT_CONFIG);
    expect(match.scores[0]).toBe(151);
    expect(match.winner).toBe(0);
  });

  it("the opponents can win the match on a deal the bidders lose", () => {
    const start: MatchState = { scores: [100, 140], hanging: 0, dealer: 0, dealNumber: 9, winner: null };
    const inside = scoreDeal(input({ contract: "hearts", bidder: 0, cards: [70, 82], lastTrickWinner: 1 }));
    const match = applyDealToMatch(start, inside, DEFAULT_CONFIG);
    expect(match.scores).toEqual([100, 156]);
    expect(match.winner).toBe(1);
  });

  it("uses the configured target score", () => {
    const start: MatchState = { scores: [95, 0], hanging: 0, dealer: 0, dealNumber: 9, winner: null };
    const match = applyDealToMatch(start, won([90, 62]), { ...DEFAULT_CONFIG, targetScore: 101 });
    expect(match.winner).toBe(0);
  });

  it("AE5: a валат deal cannot finish the match even above the target", () => {
    const start: MatchState = { scores: [145, 100], hanging: 0, dealer: 0, dealNumber: 9, winner: null };
    const valat = scoreDeal(input({ contract: "alltrumps", bidder: 0, valatBy: 0, lastTrickWinner: 0 }));
    const match = applyDealToMatch(start, valat, DEFAULT_CONFIG);
    expect(match.scores).toEqual([180, 100]);
    expect(match.winner).toBeNull();
    expect(match.dealNumber).toBe(10);

    const after = applyDealToMatch(match, won([90, 62]), DEFAULT_CONFIG);
    expect(after.scores).toEqual([190, 106]);
    expect(after.winner).toBe(0);
  });

  it("a валат deal cannot finish the match for the other side either", () => {
    const start: MatchState = { scores: [100, 145], hanging: 0, dealer: 0, dealNumber: 9, winner: null };
    const valat = scoreDeal(input({ contract: "hearts", bidder: 0, valatBy: 1, lastTrickWinner: 1 }));
    const match = applyDealToMatch(start, valat, DEFAULT_CONFIG);
    expect(match.scores[1]).toBeGreaterThanOrEqual(151);
    expect(match.winner).toBeNull();
  });

  it("both sides crossing the target in one deal: the higher total wins", () => {
    const start: MatchState = { scores: [145, 150], hanging: 0, dealer: 0, dealNumber: 9, winner: null };
    const match = applyDealToMatch(start, won([90, 62]), DEFAULT_CONFIG);
    expect(match.scores).toEqual([155, 156]);
    expect(match.winner).toBe(1);
  });

  it("both sides crossing the target with equal totals continues", () => {
    const start: MatchState = { scores: [145, 149], hanging: 0, dealer: 0, dealNumber: 9, winner: null };
    const match = applyDealToMatch(start, won([90, 62]), DEFAULT_CONFIG);
    expect(match.scores).toEqual([155, 155]);
    expect(match.winner).toBeNull();
  });

  it("does not mutate the previous match state", () => {
    const start = createMatch(0);
    applyDealToMatch(start, won([90, 62]), DEFAULT_CONFIG);
    expect(start).toEqual(createMatch(0));
  });
});
