import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONFIG,
  nextSeat,
  scoreDeal,
  seededRng,
  teamOf,
  turnOf,
  type CardId,
  type Contract,
  type DealInput,
  type GameIntent,
  type GameView,
  type Seat,
} from "@belot/shared";
import { DEAL_END_DELAY_MS, createGameController, type GameController } from "../game";
import type { Room } from "../rooms";

const SEATS: Seat[] = [0, 1, 2, 3];

function makeRoom(): Room {
  return {
    code: "TEST",
    seats: SEATS.map((i) => ({ token: `t${i}`, name: `P${i}`, connected: true, disconnectedAt: null })),
    participants: new Set(),
    connectedTokens: new Set(SEATS.map((i) => `t${i}`)),
    emptySince: null,
    started: true,
    controller: null,
  };
}

function setup(seed = 1, options: { targetScore?: number; delayMs?: number } = {}) {
  const room = makeRoom();
  const onChange = vi.fn();
  const c = createGameController(room, {
    rng: seededRng(seed),
    onChange,
    now: () => Date.now(),
    dealEndDelayMs: options.delayMs,
    config: options.targetScore ? { ...DEFAULT_CONFIG, targetScore: options.targetScore } : undefined,
  });
  room.controller = c;
  return { room, c, onChange };
}

const bid = (contract: Contract): GameIntent => ({ type: "bid", action: { type: "bid", contract } });
const pass: GameIntent = { type: "bid", action: { type: "pass" } };
const play = (card: CardId, extra: { declare?: boolean; belot?: boolean } = {}): GameIntent => ({
  type: "play",
  card,
  ...extra,
});

/** First bidder names the contract, the other three pass. */
function settle(c: GameController, contract: Contract = "clubs"): void {
  expect(c.onIntent(c.current.bidding.turn, bid(contract))).toBeNull();
  for (let i = 0; i < 3; i++) expect(c.onIntent(c.current.bidding.turn, pass)).toBeNull();
  expect(c.phase()).toBe("playing");
}

const turnSeat = (c: GameController): Seat => turnOf(c.current.tricks!.current);

/** Plays the first legal card for whoever is on turn. */
function playFirstLegal(c: GameController, extra: { declare?: boolean; belot?: boolean } = {}): Seat {
  const seat = turnSeat(c);
  const view = c.view(seat)!;
  expect(c.onIntent(seat, play(view.legalCards[0]!, extra))).toBeNull();
  return seat;
}

function playTrick(c: GameController): void {
  for (let i = 0; i < 4; i++) playFirstLegal(c);
}

function playDeal(c: GameController): void {
  while (c.phase() === "playing") playFirstLegal(c);
}

/** Every card id mentioned anywhere in the view. */
function cardIdsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (/^(7|8|9|10|J|Q|K|A)[CDHS]$/.test(value)) out.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) cardIdsIn(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) cardIdsIn(item, out);
  }
  return out;
}

/** Asserts no viewer can see a card that is still hidden in someone else's hand (or their own undealt three). */
function assertNoLeaks(c: GameController): void {
  const { hands, phase, tricks, declared } = c.current;
  // Announced declarations are public once trick one is done, even if their cards are still in hand.
  const revealed = new Set((tricks?.completed.length ?? 0) >= 1 ? declared.flatMap((d) => d.declaration.cards.map((c) => c.id)) : []);
  for (const viewer of [...SEATS, null]) {
    const view = c.view(viewer)!;
    const hidden = new Set<string>();
    hands.forEach((hand, seat) => {
      const secret = seat === viewer && phase === "bidding" ? hand.slice(5) : seat === viewer ? [] : hand;
      for (const card of secret) if (!revealed.has(card.id)) hidden.add(card.id);
    });
    const seen = cardIdsIn(view);
    const leaked = [...seen].filter((id) => hidden.has(id));
    expect(leaked, `viewer ${viewer} in ${phase}`).toEqual([]);
  }
}

describe("GameController: bidding", () => {
  it("deals five-card bidding views to four seats with the first bidder right of the dealer", () => {
    const { c } = setup();
    const dealer = c.current.match.dealer;
    for (const seat of SEATS) {
      const view = c.view(seat)!;
      expect(view.phase).toBe("bidding");
      expect(view.hand).toHaveLength(5);
      expect(view.handCounts).toEqual([5, 5, 5, 5]);
      expect(view.dealer).toBe(dealer);
      expect(view.turn).toBe(nextSeat(dealer));
      expect(view.legalBids.length > 0).toBe(seat === nextSeat(dealer));
      expect(view.myTeam).toBe(teamOf(seat));
    }
    expect(c.current.hands.every((h) => h.length === 8)).toBe(true);
  });

  it("rejects a bid out of turn and leaves the state unchanged", () => {
    const { c } = setup();
    const before = c.current;
    const wrongSeat = nextSeat(before.bidding.turn);
    expect(c.onIntent(wrongSeat, bid("hearts"))).toBe("notYourTurn");
    expect(c.current).toBe(before);
    expect(c.onIntent(before.bidding.turn, { type: "bid", action: { type: "contra" } })).toBe("illegalMove");
    expect(c.current).toBe(before);
  });

  it("three passes after a bid start play with eight cards and the leader right of the dealer", () => {
    const { c } = setup();
    const dealer = c.current.match.dealer;
    settle(c, "hearts");
    for (const seat of SEATS) {
      const view = c.view(seat)!;
      expect(view.phase).toBe("playing");
      expect(view.hand).toHaveLength(8);
      expect(view.handCounts).toEqual([8, 8, 8, 8]);
      expect(view.contract).toEqual({ contract: "hearts", bidder: nextSeat(dealer), multiplier: 1 });
      expect(view.turn).toBe(nextSeat(dealer));
      expect(view.trick).toEqual({ leader: nextSeat(dealer), plays: [] });
      expect(view.trickNumber).toBe(1);
      expect(view.legalCards.length > 0).toBe(seat === nextSeat(dealer));
    }
  });

  it("four passes redeal with the dealer advanced", () => {
    const { c } = setup();
    const dealer = c.current.match.dealer;
    const hands = c.current.hands;
    for (let i = 0; i < 4; i++) expect(c.onIntent(c.current.bidding.turn, pass)).toBeNull();
    expect(c.phase()).toBe("bidding");
    expect(c.current.match.dealer).toBe(nextSeat(dealer));
    expect(c.view(0)!.dealer).toBe(nextSeat(dealer));
    expect(c.view(0)!.turn).toBe(nextSeat(nextSeat(dealer)));
    expect(c.current.hands).not.toEqual(hands);
    expect(c.view(0)!.bidding.history).toEqual([]);
  });

  it("supports контра and реконтра", () => {
    const { c } = setup();
    const first = c.current.bidding.turn;
    expect(c.onIntent(first, bid("spades"))).toBeNull();
    expect(c.onIntent(nextSeat(first), { type: "bid", action: { type: "contra" } })).toBeNull();
    expect(c.onIntent(nextSeat(nextSeat(first)), { type: "bid", action: { type: "recontra" } })).toBeNull();
    for (let i = 0; i < 3; i++) expect(c.onIntent(c.current.bidding.turn, pass)).toBeNull();
    expect(c.view(0)!.contract).toEqual({ contract: "spades", bidder: first, multiplier: 4 });
  });
});

describe("GameController: playing", () => {
  it("rejects an illegal card, accepts a legal one and resolves the trick on the fourth card", () => {
    const { c } = setup();
    settle(c, "clubs");
    const leader = turnSeat(c);
    const other = nextSeat(leader);
    expect(c.onIntent(other, play(c.current.hands[other]![0]!.id))).toBe("notYourTurn");
    expect(c.onIntent(leader, play(c.current.hands[other]![0]!.id))).toBe("illegalMove");

    for (let i = 0; i < 3; i++) playFirstLegal(c);
    expect(c.view(0)!.trick!.plays).toHaveLength(3);
    // A card outside the legal set (when the set is restricted) is refused.
    const fourth = turnSeat(c);
    const legal = new Set(c.view(fourth)!.legalCards);
    const illegal = c.current.hands[fourth]!.find((card) => !legal.has(card.id));
    if (illegal) expect(c.onIntent(fourth, play(illegal.id))).toBe("illegalMove");

    playFirstLegal(c);
    const view = c.view(0)!;
    expect(view.trick!.plays).toEqual([]);
    expect(view.lastTrick!.plays).toHaveLength(4);
    expect(view.trick!.leader).toBe(view.lastTrick!.winner);
    expect(view.turn).toBe(view.lastTrick!.winner);
    expect(view.trickNumber).toBe(2);
    expect(view.handCounts).toEqual([7, 7, 7, 7]);
  });

  it("records a first-trick declaration, reveals it after trick one and rejects a second-trick declaration", () => {
    // Seed 54: dealer 1, seat 2 bids clubs holding J-Q-K of clubs.
    const { c } = setup(54);
    settle(c, "clubs");
    const declarer = turnSeat(c);
    const offered = c.view(declarer)!.declarationsOffered;
    expect(offered).toEqual([{ seat: declarer, kind: "sequence", points: 20, cards: ["JC", "QC", "KC"] }]);
    for (const other of SEATS.filter((s) => s !== declarer)) {
      expect(c.view(other)!.declarationsOffered.every((d) => d.seat === other)).toBe(true);
    }

    expect(c.onIntent(declarer, play("JC", { declare: true }))).toBeNull();
    expect(c.view(declarer)!.declarationsOffered).toEqual([]);
    expect(c.view(declarer)!.declared).toEqual([{ seat: declarer, kind: "sequence", points: 20, cards: ["JC", "QC", "KC"] }]);
    // Others know a declaration was made but not which cards until the trick is done.
    expect(c.view(nextSeat(declarer))!.declared).toEqual([{ seat: declarer, kind: "sequence", points: 20 }]);

    // A seat with nothing to announce cannot declare; the others simply play.
    let refused = 0;
    for (let i = 0; i < 3; i++) {
      const seat = turnSeat(c);
      if (c.view(seat)!.declarationsOffered.length === 0) {
        expect(c.onIntent(seat, play(c.view(seat)!.legalCards[0]!, { declare: true }))).toBe("illegalMove");
        refused++;
      }
      playFirstLegal(c);
    }
    expect(refused).toBeGreaterThan(0);

    expect(c.current.tricks!.completed).toHaveLength(1);
    for (const seat of [...SEATS, null]) {
      expect(c.view(seat)!.declared).toEqual([{ seat: declarer, kind: "sequence", points: 20, cards: ["JC", "QC", "KC"] }]);
      expect(c.view(seat)!.declarationsOffered).toEqual([]);
    }
    const onTurn = turnSeat(c);
    expect(c.onIntent(onTurn, play(c.view(onTurn)!.legalCards[0]!, { declare: true }))).toBe("illegalMove");
    expect(c.current.tricks!.current.plays).toHaveLength(0);
  });

  it("accepts белот on a qualifying card and rejects it on any other", () => {
    const { c } = setup(54);
    settle(c, "clubs");
    const holder = turnSeat(c);
    expect(c.view(holder)!.belotCards.sort()).toEqual(["KC", "QC"]);
    expect(c.onIntent(holder, play("JC", { belot: true }))).toBe("illegalMove");
    expect(c.onIntent(holder, play("KC", { belot: true }))).toBeNull();
    expect(c.view(nextSeat(holder))!.belots).toEqual([{ seat: holder, suit: "C" }]);
    expect(c.view(holder)!.belotCards).toEqual([]);
    playDeal(c);
    const summary = c.view(0)!.dealSummary!;
    expect(summary.teams[teamOf(holder)]!.belots).toBe(20);
    expect(summary.teams[teamOf(nextSeat(holder))]!.belots).toBe(0);
  });
});

describe("GameController: deal end and match", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("scores the deal like the engine, pauses, then deals for the next dealer", () => {
    const { c, onChange } = setup();
    const dealer = c.current.match.dealer;
    settle(c, "diamonds");
    playDeal(c);
    expect(c.phase()).toBe("dealEnd");

    const { tricks, contract, dealScore, match } = c.current;
    const input: DealInput = {
      contract: contract!.contract,
      bidder: contract!.bidder,
      multiplier: contract!.multiplier,
      wonCards: tricks!.wonCards,
      lastTrickWinner: tricks!.lastTrickWinner!,
      declarations: [[], []],
      belots: [0, 0],
      hangingBefore: 0,
    };
    const expected = scoreDeal(input);
    expect(dealScore).toEqual(expected);
    expect(match.scores).toEqual([expected.teams[0].awarded, expected.teams[1].awarded]);

    for (const seat of [...SEATS, null]) {
      const view = c.view(seat)!;
      expect(view.phase).toBe("dealEnd");
      expect(view.dealSummary).toEqual({ contract, ...expected });
      expect(view.dealEndsInSec).toBe(DEAL_END_DELAY_MS / 1000);
      expect(view.scores).toEqual(match.scores);
      expect(view.turn).toBeNull();
      expect(view.handCounts).toEqual([0, 0, 0, 0]);
      expect(view.dealer).toBe(dealer);
      expect(view.lastTrick!.plays).toHaveLength(4);
    }

    vi.advanceTimersByTime(DEAL_END_DELAY_MS - 1000);
    expect(c.view(0)!.dealEndsInSec).toBe(1);
    expect(c.phase()).toBe("dealEnd");
    vi.advanceTimersByTime(1000);
    expect(c.phase()).toBe("bidding");
    expect(onChange).toHaveBeenCalledTimes(1);
    const view = c.view(0)!;
    expect(view.dealer).toBe(nextSeat(dealer));
    expect(view.dealNumber).toBe(2);
    expect(view.scores).toEqual(match.scores);
    expect(view.dealSummary).toBeNull();
    expect(view.dealEndsInSec).toBeNull();
    expect(view.hand).toHaveLength(5);
  });

  it("ends the match when a side reaches the target on a plain deal", () => {
    const { c } = setup(1, { targetScore: 5 });
    settle(c, "clubs");
    playDeal(c);
    const { dealScore, match } = c.current;
    expect(dealScore!.valatBy).toBeNull();
    expect(match.winner).not.toBeNull();
    expect(c.phase()).toBe("dealEnd");
    vi.advanceTimersByTime(DEAL_END_DELAY_MS);
    expect(c.phase()).toBe("finished");
    const view = c.view(0)!;
    expect(view.phase).toBe("finished");
    expect(view.winner).toBe(match.winner);
    expect(view.dealSummary).not.toBeNull();
    expect(Math.max(...view.scores)).toBeGreaterThanOrEqual(5);
  });

  it("does not end the match on a валат deal even past the target", () => {
    // Seed 15 with clubs from the first bidder: team 0 takes all eight tricks.
    const { c } = setup(15, { targetScore: 5 });
    settle(c, "clubs");
    playDeal(c);
    const { dealScore, match } = c.current;
    expect(dealScore!.valatBy).toBe(0);
    expect(match.scores[0]).toBeGreaterThanOrEqual(5);
    expect(match.winner).toBeNull();
    vi.advanceTimersByTime(DEAL_END_DELAY_MS);
    expect(c.phase()).toBe("bidding");
    expect(c.view(0)!.winner).toBeNull();
    expect(c.view(0)!.scores).toEqual(match.scores);
  });

  it("carries hanging points to the next decided deal", () => {
    // Seed 62 with clubs from the first bidder ends in a tie.
    const { c } = setup(62);
    settle(c, "clubs");
    playDeal(c);
    expect(c.current.dealScore!.result).toBe("hanging");
    expect(c.view(0)!.hanging).toBe(c.current.dealScore!.hangingAfter);
    expect(c.view(0)!.hanging).toBeGreaterThan(0);
    vi.advanceTimersByTime(DEAL_END_DELAY_MS);
    expect(c.view(0)!.hanging).toBeGreaterThan(0);
  });

  it("allows newGame only once finished and resets the match with the dealer advanced", () => {
    const { c } = setup(1, { targetScore: 5 });
    expect(c.onIntent(0, { type: "newGame" })).toBe("illegalMove");
    settle(c, "clubs");
    expect(c.onIntent(0, { type: "newGame" })).toBe("illegalMove");
    playDeal(c);
    expect(c.onIntent(0, { type: "newGame" })).toBe("illegalMove");
    vi.advanceTimersByTime(DEAL_END_DELAY_MS);
    expect(c.phase()).toBe("finished");
    const lastDealer = c.view(0)!.dealer;

    expect(c.onIntent(2, { type: "newGame" })).toBeNull();
    expect(c.phase()).toBe("bidding");
    const view = c.view(0)!;
    expect(view.scores).toEqual([0, 0]);
    expect(view.hanging).toBe(0);
    expect(view.winner).toBeNull();
    expect(view.dealNumber).toBe(1);
    expect(view.dealer).toBe(nextSeat(lastDealer));
    expect(view.hand).toHaveLength(5);
  });
});

describe("GameController: pause and seat changes", () => {
  it("pauses on disconnect, rejects intents, and resumes with the same state on reconnect", () => {
    const { c, room } = setup();
    settle(c, "clubs");
    const leader = turnSeat(c);
    const before = c.current;
    const dropped = nextSeat(leader);
    room.seats[dropped]!.connected = false;
    room.seats[dropped]!.disconnectedAt = Date.now() - 12_500;

    for (const seat of [...SEATS, null]) {
      const view = c.view(seat)!;
      expect(view.paused).toEqual({ seat: dropped, forSec: 12 });
      expect(view.turn).toBeNull();
      expect(view.legalCards).toEqual([]);
    }
    expect(c.onIntent(leader, play(before.hands[leader]![0]!.id))).toBe("gamePaused");
    expect(c.current).toBe(before);

    room.seats[dropped]!.connected = true;
    room.seats[dropped]!.disconnectedAt = null;
    expect(c.view(leader)!.paused).toBeNull();
    expect(c.view(leader)!.turn).toBe(leader);
    expect(c.view(leader)!.legalCards).toHaveLength(8);
    playFirstLegal(c);
    expect(c.view(0)!.trick!.plays).toHaveLength(1);
  });

  it("rejects bids while paused during bidding", () => {
    const { c, room } = setup();
    room.seats[3]!.connected = false;
    room.seats[3]!.disconnectedAt = Date.now();
    expect(c.onIntent(c.current.bidding.turn, pass)).toBe("gamePaused");
    expect(c.view(0)!.legalBids).toEqual([]);
  });

  it("abandons the deal on release but keeps the score, then deals with the same dealer when refilled", () => {
    vi.useFakeTimers();
    try {
      const { c, room, onChange } = setup();
      settle(c, "clubs");
      playDeal(c);
      vi.advanceTimersByTime(DEAL_END_DELAY_MS);
      const scores = c.current.match.scores;
      const dealer = c.current.match.dealer;
      settle(c, "hearts");
      playTrick(c);

      room.seats[1] = null;
      room.started = false;
      c.onSeatReleased(1);
      expect(c.phase()).toBe("waiting");
      expect(c.view(0)).toBeNull();
      expect(c.view(null)).toBeNull();
      expect(c.onIntent(0, pass)).toBe("invalidIntent");

      room.seats[1] = { token: "t9", name: "P9", connected: true, disconnectedAt: null };
      room.started = true;
      onChange.mockClear();
      c.onSeatFilled(1);
      expect(onChange).toHaveBeenCalledWith(room);
      expect(c.phase()).toBe("bidding");
      const view = c.view(0)!;
      expect(view.dealer).toBe(dealer);
      expect(view.scores).toEqual(scores);
      expect(view.contract).toBeNull();
      expect(view.trick).toBeNull();
      expect(view.hand).toHaveLength(5);
      expect(view.paused).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the deal-end timer when a seat is released during dealEnd", () => {
    vi.useFakeTimers();
    try {
      const { c, room, onChange } = setup();
      settle(c, "clubs");
      playDeal(c);
      room.seats[2] = null;
      c.onSeatReleased(2);
      vi.advanceTimersByTime(DEAL_END_DELAY_MS * 2);
      expect(c.phase()).toBe("waiting");
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GameController: hidden information", () => {
  it("never shows another seat's cards or the undealt three in any phase", () => {
    vi.useFakeTimers();
    try {
      const { c } = setup(54);
      assertNoLeaks(c);
      settle(c, "clubs");
      assertNoLeaks(c);
      const declarer = turnSeat(c);
      expect(c.onIntent(declarer, play("KC", { declare: true, belot: true }))).toBeNull();
      assertNoLeaks(c);
      for (let i = 0; i < 3; i++) {
        playFirstLegal(c);
        assertNoLeaks(c);
      }
      while (c.phase() === "playing") {
        playFirstLegal(c);
        assertNoLeaks(c);
      }
      expect(c.phase()).toBe("dealEnd");
      assertNoLeaks(c);
      vi.advanceTimersByTime(DEAL_END_DELAY_MS);
      assertNoLeaks(c);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives an unseated viewer no hand, no legal actions and no team", () => {
    const { c } = setup();
    const check = (view: GameView) => {
      expect(view.hand).toEqual([]);
      expect(view.legalBids).toEqual([]);
      expect(view.legalCards).toEqual([]);
      expect(view.declarationsOffered).toEqual([]);
      expect(view.belotCards).toEqual([]);
      expect(view.myTeam).toBeNull();
    };
    check(c.view(null)!);
    settle(c, "alltrumps");
    check(c.view(null)!);
    expect(c.view(null)!.handCounts).toEqual([8, 8, 8, 8]);
  });

  it("keeps hand counts in step with cards played", () => {
    const { c } = setup();
    settle(c, "spades");
    const played: number[] = [0, 0, 0, 0];
    for (let i = 0; i < 6; i++) {
      const seat = playFirstLegal(c);
      played[seat]!++;
      for (const viewer of [...SEATS, null]) {
        expect(c.view(viewer)!.handCounts).toEqual(SEATS.map((s) => 8 - played[s]!));
      }
    }
  });
});
