import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  cardFromId,
  createBidding,
  createMatch,
  createTrickState,
  playCard,
  type Card,
  type CardId,
  type Seat,
} from "@belot/shared";
import type { GameState } from "../game";
import type { SeatState } from "../rooms";
import { buildGameView, pausedFor, sortForDisplay } from "../views";

const SEATS: Seat[] = [0, 1, 2, 3];
const NOW = 1_700_000_000_000;

const cards = (...ids: CardId[]): Card[] => ids.map(cardFromId);

const seats = (): SeatState[] =>
  SEATS.map((i) => ({ token: `t${i}`, name: `P${i}`, connected: true, disconnectedAt: null }));

/** Fixed hands: seat 0 holds a club run and the K-Q of clubs for белот. */
function fixedHands(): Card[][] {
  return [
    cards("JC", "QC", "KC", "7H", "8H", "9D", "10D", "AS"),
    cards("AC", "10C", "7D", "8D", "JD", "QH", "KH", "7S"),
    cards("9C", "8C", "QD", "KD", "AD", "JH", "8S", "9S"),
    cards("7C", "AH", "10H", "9H", "10S", "JS", "QS", "KS"),
  ];
}

function biddingState(dealer: Seat = 3): GameState {
  return {
    phase: "bidding",
    gamesWon: [0, 0],
    match: createMatch(dealer),
    config: DEFAULT_CONFIG,
    seats: seats(),
    dealNumber: 1,
    hands: fixedHands(),
    bidding: createBidding(dealer),
    contract: null,
    tricks: null,
    offered: [[], [], [], []],
    hasDeclared: [false, false, false, false],
    declared: [],
    belots: [],
    dealScore: null,
    dealEndsAt: null,
  };
}

function playingState(): GameState {
  const base = biddingState(3);
  const contract = { contract: "clubs" as const, bidder: 0 as Seat, multiplier: 1 as const };
  return {
    ...base,
    phase: "playing",
    bidding: { ...base.bidding, contract: "clubs", bidder: 0, passesInRow: 3, turn: 0 },
    contract,
    tricks: createTrickState(0),
    offered: [
      [{ kind: "sequence", length: 3, cards: cards("JC", "QC", "KC"), points: 20, topRank: "K" }],
      [],
      [],
      [{ kind: "sequence", length: 3, cards: cards("10S", "JS", "QS"), points: 20, topRank: "Q" }],
    ],
  };
}

/** Plays one full trick from the playing state: 0 leads JC declaring, the rest follow. */
function afterFirstTrick(): GameState {
  const state = playingState();
  let tricks = state.tricks!;
  const hands = state.hands.map((h) => [...h]);
  for (const [seat, id] of [
    [0, "JC"],
    [1, "AC"],
    [2, "9C"],
    [3, "7C"],
  ] as [Seat, CardId][]) {
    tricks = playCard(tricks, seat, cardFromId(id), "clubs", DEFAULT_CONFIG, hands[seat]);
    hands[seat] = hands[seat]!.filter((c) => c.id !== id);
  }
  return {
    ...state,
    tricks,
    hands,
    hasDeclared: [true, false, false, false],
    declared: [{ seat: 0, declaration: state.offered[0]![0]! }],
    belots: [{ seat: 0, suit: "C" }],
  };
}

const allIds = (hands: Card[][]): Set<string> => new Set(hands.flat().map((c) => c.id));

describe("buildGameView: bidding", () => {
  it("shows each seat its first five cards and hides the rest", () => {
    const state = biddingState(3);
    for (const seat of SEATS) {
      const view = buildGameView(state, seat, NOW);
      const own = state.hands[seat]!.slice(0, 5).map((c) => c.id);
      expect(view.hand).toHaveLength(5);
      expect(new Set(view.hand)).toEqual(new Set(own));
      const hidden = state.hands[seat]!.slice(5).map((c) => c.id);
      for (const id of hidden) expect(view.hand).not.toContain(id);
      expect(view.handCounts).toEqual([5, 5, 5, 5]);
      expect(view.phase).toBe("bidding");
      expect(view.dealer).toBe(3);
      expect(view.turn).toBe(0);
      expect(view.trick).toBeNull();
      expect(view.lastTrick).toBeNull();
      expect(view.trickNumber).toBe(0);
      expect(view.contract).toBeNull();
      expect(view.legalCards).toEqual([]);
      expect(view.belotCards).toEqual([]);
      expect(view.dealSummary).toBeNull();
      expect(view.dealEndsInSec).toBeNull();
      expect(view.winner).toBeNull();
    }
  });

  it("offers legal bids only to the seat on turn", () => {
    const state = biddingState(3);
    expect(buildGameView(state, 0, NOW).legalBids.map((b) => b.type)).toEqual([
      "pass",
      "bid",
      "bid",
      "bid",
      "bid",
      "bid",
      "bid",
    ]);
    for (const seat of [1, 2, 3] as Seat[]) expect(buildGameView(state, seat, NOW).legalBids).toEqual([]);
    expect(buildGameView(state, null, NOW).legalBids).toEqual([]);
  });

  it("sorts the hand by suit with the plain order before a contract", () => {
    const state = biddingState(3);
    state.hands[0] = cards("7H", "AC", "10C", "KC", "JC", "9C", "8H", "AH");
    expect(buildGameView(state, 0, NOW).hand).toEqual(["AC", "10C", "KC", "JC", "7H"]);
  });
});

describe("buildGameView: playing", () => {
  it("shows all eight own cards, the trump order, legal cards for the leader and offers only own declarations", () => {
    const state = playingState();
    const v0 = buildGameView(state, 0, NOW);
    expect(v0.hand).toEqual(["JC", "KC", "QC", "10D", "9D", "8H", "7H", "AS"]);
    expect(v0.handCounts).toEqual([8, 8, 8, 8]);
    expect(v0.legalCards).toHaveLength(8);
    expect(v0.turn).toBe(0);
    expect(v0.trickNumber).toBe(1);
    expect(v0.declarationsOffered).toEqual([{ seat: 0, kind: "sequence", points: 20, cards: ["JC", "QC", "KC"] }]);
    expect(v0.belotCards.sort()).toEqual(["KC", "QC"]);

    const v3 = buildGameView(state, 3, NOW);
    expect(v3.legalCards).toEqual([]);
    expect(v3.declarationsOffered).toEqual([{ seat: 3, kind: "sequence", points: 20, cards: ["10S", "JS", "QS"] }]);
    expect(v3.belotCards).toEqual([]);

    const v1 = buildGameView(state, 1, NOW);
    expect(v1.declarationsOffered).toEqual([]);
    expect(v1.belotCards).toEqual([]);
  });

  it("only ever includes the viewer's own cards", () => {
    for (const state of [biddingState(3), playingState(), afterFirstTrick()]) {
      const everything = allIds(state.hands);
      for (const viewer of [...SEATS, null]) {
        const view = buildGameView(state, viewer, NOW);
        const own = new Set(viewer === null ? [] : state.hands[viewer]!.map((c) => c.id));
        const played = new Set([...(view.trick?.plays ?? []), ...(view.lastTrick?.plays ?? [])].map((p) => p.card));
        const revealed = new Set(view.declared.flatMap((d) => d.cards ?? []));
        const visible = [
          ...view.hand,
          ...view.legalCards,
          ...view.belotCards,
          ...view.declarationsOffered.flatMap((d) => d.cards ?? []),
        ];
        for (const id of visible) expect(own.has(id), `${id} for viewer ${viewer}`).toBe(true);
        for (const id of revealed) {
          expect(own.has(id) || played.has(id) || state.tricks!.completed.length >= 1).toBe(true);
        }
        // Nothing else in the view names a card.
        const text = JSON.stringify({ ...view, hand: [], legalCards: [], belotCards: [], declarationsOffered: [], declared: [], trick: null, lastTrick: null, dealSummary: null });
        for (const id of everything) expect(text.includes(`"${id}"`), `${id} leaked to ${viewer}`).toBe(false);
      }
    }
  });

  it("hides declared cards from the table until trick one is done, then reveals them", () => {
    const during = playingState();
    during.hasDeclared = [true, false, false, false];
    during.declared = [{ seat: 0, declaration: during.offered[0]![0]! }];
    during.tricks = playCard(during.tricks!, 0, cardFromId("JC"), "clubs", DEFAULT_CONFIG, during.hands[0]);
    during.hands[0] = during.hands[0]!.filter((c) => c.id !== "JC");
    expect(buildGameView(during, 0, NOW).declared).toEqual([{ seat: 0, kind: "sequence", points: 20, cards: ["JC", "QC", "KC"] }]);
    expect(buildGameView(during, 0, NOW).declarationsOffered).toEqual([]);
    for (const viewer of [1, 2, 3, null] as (Seat | null)[]) {
      expect(buildGameView(during, viewer, NOW).declared).toEqual([{ seat: 0, kind: "sequence", points: 20 }]);
    }

    const after = afterFirstTrick();
    for (const viewer of [...SEATS, null]) {
      const view = buildGameView(after, viewer, NOW);
      expect(view.declared).toEqual([{ seat: 0, kind: "sequence", points: 20, cards: ["JC", "QC", "KC"] }]);
      expect(view.declarationsOffered).toEqual([]);
      expect(view.belots).toEqual([{ seat: 0, suit: "C" }]);
      expect(view.trickNumber).toBe(2);
      expect(view.lastTrick).toEqual({
        winner: 0,
        plays: [
          { seat: 0, card: "JC" },
          { seat: 1, card: "AC" },
          { seat: 2, card: "9C" },
          { seat: 3, card: "7C" },
        ],
      });
      expect(view.trick).toEqual({ leader: 0, plays: [] });
      expect(view.handCounts).toEqual([7, 7, 7, 7]);
    }
  });

  it("marks the game paused with the seconds since the disconnect and withholds legal cards", () => {
    const state = playingState();
    state.seats[2]!.connected = false;
    state.seats[2]!.disconnectedAt = NOW - 61_400;
    for (const viewer of [...SEATS, null]) {
      const view = buildGameView(state, viewer, NOW);
      expect(view.paused).toEqual({ seat: 2, forSec: 61 });
      expect(view.turn).toBeNull();
      expect(view.legalCards).toEqual([]);
    }
    expect(buildGameView(state, 0, NOW).hand).toHaveLength(8);
    expect(pausedFor(state.seats, NOW)).toEqual({ seat: 2, forSec: 61 });
    expect(pausedFor(seats(), NOW)).toBeNull();
    expect(pausedFor([null, ...seats().slice(1)], NOW)).toEqual({ seat: 0, forSec: 0 });
  });
});

describe("buildGameView: deal end", () => {
  it("shows the summary, the countdown and empty hands", () => {
    const state: GameState = {
      ...afterFirstTrick(),
      phase: "dealEnd",
      hands: [[], [], [], []],
      match: { scores: [16, 3], hanging: 0, dealer: 0, dealNumber: 2, winner: null },
      dealEndsAt: NOW + 4_200,
      dealScore: {
        teams: [
          { cardPoints: 120, lastTrick: 10, declarations: 20, belots: 20, valat: 0, raw: 170, rounded: 17, awarded: 17 },
          { cardPoints: 32, lastTrick: 0, declarations: 0, belots: 0, valat: 0, raw: 32, rounded: 3, awarded: 3 },
        ],
        result: "won",
        valatBy: null,
        hangingBefore: 0,
        hangingAfter: 0,
      },
    };
    for (const viewer of [...SEATS, null]) {
      const view = buildGameView(state, viewer, NOW);
      expect(view.phase).toBe("dealEnd");
      expect(view.dealSummary).toEqual({ contract: state.contract, ...state.dealScore });
      expect(view.dealEndsInSec).toBe(5);
      expect(view.hand).toEqual([]);
      expect(view.handCounts).toEqual([0, 0, 0, 0]);
      expect(view.scores).toEqual([16, 3]);
      expect(view.turn).toBeNull();
      expect(view.legalCards).toEqual([]);
      expect(view.belotCards).toEqual([]);
      expect(view.declarationsOffered).toEqual([]);
    }
    expect(buildGameView(state, 0, NOW + 10_000).dealEndsInSec).toBe(0);
  });

  it("names the winner once finished", () => {
    const state: GameState = {
      ...biddingState(1),
      phase: "finished",
      hands: [[], [], [], []],
      match: { scores: [155, 90], hanging: 0, dealer: 2, dealNumber: 9, winner: 0 },
    };
    const view = buildGameView(state, 3, NOW);
    expect(view.winner).toBe(0);
    expect(view.turn).toBeNull();
    expect(view.dealEndsInSec).toBeNull();
    expect(view.legalBids).toEqual([]);
  });
});

describe("sortForDisplay", () => {
  it("uses the trump order in the trump suit and the plain order elsewhere", () => {
    const hand = cards("7C", "JC", "9C", "AC", "AH", "9H", "JH", "10H");
    expect(sortForDisplay(hand, "clubs").map((c) => c.id)).toEqual(["JC", "9C", "AC", "7C", "AH", "10H", "JH", "9H"]);
    expect(sortForDisplay(hand, "alltrumps").map((c) => c.id)).toEqual(["JC", "9C", "AC", "7C", "JH", "9H", "AH", "10H"]);
    expect(sortForDisplay(hand, null).map((c) => c.id)).toEqual(["AC", "JC", "9C", "7C", "AH", "10H", "JH", "9H"]);
  });
});
