// Drives one room's match through the engine: bidding, play, declarations, scoring and the pause
// between deals. Hidden information is redacted by views.ts; this module owns the full state.
import {
  DEFAULT_CONFIG,
  applyBid,
  applyDealToMatch,
  belotAvailable,
  belotSuitFor,
  createBidding,
  createMatch,
  createTrickState,
  dealHands,
  detectDeclarations,
  finalContract,
  isDealOver,
  legalBids,
  legalCards,
  nextSeat,
  playCard,
  redealMatch,
  scoreDeal,
  teamOf,
  turnOf,
  type BidAction,
  type BiddingState,
  type Card,
  type ContractView,
  type DealInput,
  type DealScore,
  type Declaration,
  type EngineConfig,
  type ErrorCode,
  type GameIntent,
  type GameView,
  type MatchState,
  type RoomPhase,
  type Seat,
  type Suit,
  type TrickState,
} from "@belot/shared";
import type { GameHost, Room, SeatState } from "./rooms";
import { buildGameView, pausedFor } from "./views";

export const DEAL_END_DELAY_MS = 7000;

export interface AnnouncedDeclaration {
  seat: Seat;
  declaration: Declaration;
}

export interface AnnouncedBelot {
  seat: Seat;
  suit: Suit;
}

/** Full game state including every hand. Only views.ts turns it into something a client may see. */
export interface GameState {
  /** "waiting" while a released seat is empty; the room reports that phase itself. */
  phase: RoomPhase;
  match: MatchState;
  config: EngineConfig;
  /** Live reference to the room's seats; pause is derived from it. */
  seats: readonly (SeatState | null)[];
  dealNumber: number;
  /** Cards still in each hand. All eight are dealt at once; views hide the last three during bidding. */
  hands: Card[][];
  bidding: BiddingState;
  contract: ContractView | null;
  tricks: TrickState | null;
  /** Declarations each seat may announce with its first-trick card. */
  offered: Declaration[][];
  hasDeclared: boolean[];
  declared: AnnouncedDeclaration[];
  belots: AnnouncedBelot[];
  dealScore: DealScore | null;
  dealEndsAt: number | null;
}

export interface GameControllerDeps {
  rng?: () => number;
  now?: () => number;
  onChange: (room: Room) => void;
  dealEndDelayMs?: number;
  config?: EngineConfig;
}

export class GameController implements GameHost {
  private state: GameState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly rng: () => number;
  private readonly now: () => number;
  private readonly config: EngineConfig;
  private readonly dealEndDelayMs: number;

  constructor(
    private readonly room: Room,
    private readonly deps: GameControllerDeps,
  ) {
    this.rng = deps.rng ?? Math.random;
    this.now = deps.now ?? Date.now;
    this.config = deps.config ?? DEFAULT_CONFIG;
    this.dealEndDelayMs = deps.dealEndDelayMs ?? DEAL_END_DELAY_MS;
    const firstDealer = Math.floor(this.rng() * 4) as Seat;
    this.state = this.dealFor(createMatch(firstDealer));
  }

  /** The unredacted state, for tests. */
  get current(): GameState {
    return this.state;
  }

  phase(): RoomPhase {
    return this.state.phase;
  }

  view(seat: Seat | null): GameView | null {
    if (this.state.phase === "waiting") return null;
    return buildGameView(this.state, seat, this.now());
  }

  onIntent(seat: Seat, intent: GameIntent): ErrorCode | null {
    const { phase } = this.state;
    if (phase === "waiting") return "invalidIntent";
    if (intent.type === "newGame") return this.newGame();
    if (pausedFor(this.state.seats, this.now())) return "gamePaused";
    if (intent.type === "bid") return phase === "bidding" ? this.bid(seat, intent.action) : "illegalMove";
    return phase === "playing" ? this.play(seat, intent) : "illegalMove";
  }

  onSeatReleased(_seat: Seat): void {
    this.clearTimer();
    this.state = { ...this.state, phase: "waiting", dealScore: null, dealEndsAt: null };
  }

  onSeatFilled(_seat: Seat): void {
    this.state =
      this.state.match.winner !== null
        ? { ...this.state, phase: "finished" }
        : this.dealFor(this.state.match);
    this.deps.onChange(this.room);
  }

  private bid(seat: Seat, action: BidAction): ErrorCode | null {
    const { bidding } = this.state;
    if (bidding.turn !== seat) return "notYourTurn";
    const legal = legalBids(bidding, seat).some(
      (b) => b.type === action.type && (b.type !== "bid" || action.type !== "bid" || b.contract === action.contract),
    );
    if (!legal) return "illegalMove";

    const { state: next, result } = applyBid(bidding, seat, action);
    if (result === "redeal") {
      this.state = this.dealFor(redealMatch(this.state.match));
      return null;
    }
    if (result === "continue") {
      this.state = { ...this.state, bidding: next };
      return null;
    }
    const contract = finalContract(next)!;
    this.state = {
      ...this.state,
      phase: "playing",
      bidding: next,
      contract,
      tricks: createTrickState(nextSeat(next.dealer)),
      offered: this.state.hands.map((hand) => detectDeclarations(hand, contract.contract)),
    };
    return null;
  }

  private play(seat: Seat, intent: Extract<GameIntent, { type: "play" }>): ErrorCode | null {
    const { tricks, contract, hands } = this.state;
    if (!tricks || !contract) return "illegalMove";
    if (turnOf(tricks.current) !== seat) return "notYourTurn";
    const hand = hands[seat]!;
    const card = hand.find((c) => c.id === intent.card);
    if (!card) return "illegalMove";
    if (!legalCards(hand, tricks.current, contract.contract, seat, this.config).some((c) => c.id === card.id)) {
      return "illegalMove";
    }
    const firstTrick = tricks.completed.length === 0;
    if (intent.declare && (!firstTrick || this.state.hasDeclared[seat] || this.state.offered[seat]!.length === 0)) {
      return "illegalMove";
    }
    if (intent.belot && !belotAvailable(hand, card, contract.contract)) return "illegalMove";

    const nextTricks = playCard(tricks, seat, card, contract.contract, this.config, hand);
    const nextHands = hands.map((h, i) => (i === seat ? h.filter((c) => c.id !== card.id) : h));
    const declared = intent.declare
      ? [...this.state.declared, ...this.state.offered[seat]!.map((declaration) => ({ seat, declaration }))]
      : this.state.declared;
    const belots = intent.belot
      ? [...this.state.belots, { seat, suit: belotSuitFor(card, contract.contract)! }]
      : this.state.belots;
    const hasDeclared = intent.declare ? this.state.hasDeclared.map((d, i) => d || i === seat) : this.state.hasDeclared;
    this.state = { ...this.state, tricks: nextTricks, hands: nextHands, declared, belots, hasDeclared };

    if (isDealOver(nextTricks)) this.endDeal(nextTricks, contract);
    return null;
  }

  private endDeal(tricks: TrickState, contract: ContractView): void {
    const { declared, belots, match } = this.state;
    const byTeam = <T extends { seat: Seat }>(items: T[], team: 0 | 1) => items.filter((i) => teamOf(i.seat) === team);
    const input: DealInput = {
      contract: contract.contract,
      bidder: contract.bidder,
      multiplier: contract.multiplier,
      wonCards: tricks.wonCards,
      lastTrickWinner: tricks.lastTrickWinner!,
      declarations: [byTeam(declared, 0).map((d) => d.declaration), byTeam(declared, 1).map((d) => d.declaration)],
      belots: [byTeam(belots, 0).length, byTeam(belots, 1).length],
      hangingBefore: match.hanging,
    };
    const dealScore = scoreDeal(input, this.config);
    this.state = {
      ...this.state,
      phase: "dealEnd",
      match: applyDealToMatch(match, dealScore, this.config),
      dealScore,
      dealEndsAt: this.now() + this.dealEndDelayMs,
    };
    this.clearTimer();
    this.timer = setTimeout(() => this.afterDealEnd(), this.dealEndDelayMs);
    this.timer.unref?.();
  }

  private afterDealEnd(): void {
    this.timer = null;
    if (this.state.phase !== "dealEnd") return;
    const { match } = this.state;
    this.state =
      match.winner !== null ? { ...this.state, phase: "finished", dealEndsAt: null } : this.dealFor(match);
    this.deps.onChange(this.room);
  }

  private newGame(): ErrorCode | null {
    if (this.state.phase !== "finished") return "illegalMove";
    this.clearTimer();
    this.state = this.dealFor(createMatch(nextSeat(this.state.bidding.dealer)));
    return null;
  }

  /** A fresh deal for the match's current dealer. */
  private dealFor(match: MatchState): GameState {
    return {
      phase: "bidding",
      match,
      config: this.config,
      seats: this.room.seats,
      dealNumber: match.dealNumber,
      hands: dealHands(this.rng, match.dealer),
      bidding: createBidding(match.dealer),
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

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export function createGameController(room: Room, deps: GameControllerDeps): GameController {
  return new GameController(room, deps);
}
