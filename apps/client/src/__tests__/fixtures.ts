// Hand-built views for the client tests.
import type { GameView, RoomView, SeatView } from "@belot/shared";

export function seat(name: string, connected = true): SeatView {
  return { name, connected, disconnectedForSec: connected ? null : 5 };
}

export const NAMES = ["Иван", "Мария", "Петър", "Елена"] as const;

export function waitingView(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: "ABCD",
    phase: "waiting",
    mySeat: 1,
    seats: [seat(NAMES[0]), seat(NAMES[1]), null, null],
    game: null,
    ...overrides,
  };
}

export function gameView(overrides: Partial<GameView> = {}): GameView {
  return {
    phase: "playing",
    dealNumber: 1,
    dealer: 0,
    turn: 1,
    paused: null,
    myTeam: 1,
    hand: ["JS", "9S", "AH", "7C", "KD", "QD", "10H", "8S"],
    handCounts: [8, 8, 8, 8],
    bidding: {
      history: [
        { seat: 1, action: { type: "bid", contract: "hearts" } },
        { seat: 2, action: { type: "pass" } },
        { seat: 3, action: { type: "pass" } },
        { seat: 0, action: { type: "pass" } },
      ],
      contract: "hearts",
      bidder: 1,
      multiplier: 1,
    },
    contract: { contract: "hearts", bidder: 1, multiplier: 1 },
    legalBids: [],
    legalCards: ["JS", "9S", "8S"],
    trick: { leader: 1, plays: [] },
    lastTrick: null,
    trickNumber: 1,
    declarationsOffered: [],
    belotCards: [],
    declared: [],
    belots: [],
    scores: [0, 0],
    hanging: 0,
    gamesWon: [0, 0],
    dealSummary: null,
    dealEndsInSec: null,
    winner: null,
    ...overrides,
  };
}

export function playingView(game: Partial<GameView> = {}, room: Partial<RoomView> = {}): RoomView {
  return {
    code: "ABCD",
    phase: "playing",
    mySeat: 1,
    seats: [seat(NAMES[0]), seat(NAMES[1]), seat(NAMES[2]), seat(NAMES[3])],
    game: gameView(game),
    ...room,
  };
}

export function biddingView(game: Partial<GameView> = {}): RoomView {
  return playingView(
    {
      phase: "bidding",
      hand: ["JS", "9S", "AH", "7C", "KD"],
      handCounts: [5, 5, 5, 5],
      bidding: { history: [{ seat: 1, action: { type: "bid", contract: "clubs" } }], contract: "clubs", bidder: 1, multiplier: 1 },
      contract: null,
      legalCards: [],
      legalBids: [
        { type: "pass" },
        { type: "bid", contract: "hearts" },
        { type: "bid", contract: "spades" },
        { type: "bid", contract: "notrumps" },
        { type: "bid", contract: "alltrumps" },
      ],
      trick: null,
      turn: 1,
      ...game,
    },
    { phase: "bidding" },
  );
}
