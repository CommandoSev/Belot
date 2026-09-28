// Wire protocol between client and server: intents, views, error codes and Bulgarian labels.
import type { BidAction, CardId, Contract, Multiplier, Seat, Suit, Team } from "./engine/types";

export const PROTOCOL_VERSION = 1;

/** Sent in the Socket.IO handshake `auth` field. The token identifies the browser across reconnects. */
export interface ClientAuth {
  token: string;
  name: string;
}

export const MAX_NAME_LENGTH = 20;

export type ClientIntent =
  | { type: "createRoom" }
  | { type: "joinRoom"; code: string }
  | { type: "sit"; seat: Seat }
  | { type: "stand" }
  | { type: "releaseSeat"; seat: Seat }
  | { type: "bid"; action: BidAction }
  | { type: "play"; card: CardId; declare?: boolean; belot?: boolean }
  | { type: "newGame" }
  | { type: "leaveRoom" };

export type LobbyIntentType = "createRoom" | "joinRoom" | "sit" | "stand" | "releaseSeat" | "leaveRoom";
export type GameIntentType = "bid" | "play" | "newGame";
export type LobbyIntent = Extract<ClientIntent, { type: LobbyIntentType }>;
export type GameIntent = Extract<ClientIntent, { type: GameIntentType }>;

export const GAME_INTENT_TYPES: readonly GameIntentType[] = ["bid", "play", "newGame"];

export function isGameIntent(intent: ClientIntent): intent is GameIntent {
  return (GAME_INTENT_TYPES as readonly string[]).includes(intent.type);
}

export type RoomPhase = "waiting" | "bidding" | "playing" | "dealEnd" | "finished";

export interface SeatView {
  name: string;
  connected: boolean;
  /** Seconds since the seat lost its connection, null while connected. */
  disconnectedForSec: number | null;
}

export interface TrickPlayView {
  seat: Seat;
  card: CardId;
}

export interface TrickView {
  leader: Seat;
  plays: TrickPlayView[];
}

export interface CompletedTrickView {
  winner: Seat;
  plays: TrickPlayView[];
}

export interface BidRecordView {
  seat: Seat;
  action: BidAction;
}

export interface ContractView {
  contract: Contract;
  bidder: Seat;
  multiplier: Multiplier;
}

/** A declaration offered to the viewer or revealed to the table after trick one. */
export interface DeclarationView {
  seat: Seat;
  kind: "sequence" | "carre";
  points: number;
  /** Present once revealed (after trick one) or when offered to the owner. */
  cards?: CardId[];
}

export interface BelotView {
  seat: Seat;
  suit: Suit;
}

export interface TeamDealSummaryView {
  cardPoints: number;
  lastTrick: number;
  declarations: number;
  belots: number;
  valat: number;
  raw: number;
  rounded: number;
  /** Game points actually added to the match score for this deal (after вътре, контра, висящи). */
  awarded: number;
}

export interface DealSummaryView {
  contract: ContractView;
  teams: [TeamDealSummaryView, TeamDealSummaryView];
  /** won = bidders made it, inside = bidders fell вътре, hanging = tie, bidders' points hang. */
  result: "won" | "inside" | "hanging";
  valatBy: Team | null;
  hangingBefore: number;
  hangingAfter: number;
}

/** Per-seat redacted view of a running or finished game. Never contains another seat's cards. */
export interface GameView {
  phase: Exclude<RoomPhase, "waiting">;
  dealNumber: number;
  dealer: Seat;
  /** Seat whose action is awaited, null during dealEnd, finished or while paused. */
  turn: Seat | null;
  paused: { seat: Seat; forSec: number } | null;
  myTeam: Team | null;
  /** Own cards sorted for display; empty for an unseated viewer. */
  hand: CardId[];
  handCounts: [number, number, number, number];
  bidding: {
    history: BidRecordView[];
    contract: Contract | null;
    bidder: Seat | null;
    multiplier: Multiplier;
  };
  /** Final contract once bidding is done. */
  contract: ContractView | null;
  /** Legal bids for the viewer when it is their turn in bidding, otherwise empty. */
  legalBids: BidAction[];
  /** Legal cards for the viewer when it is their turn in playing, otherwise empty. */
  legalCards: CardId[];
  trick: TrickView | null;
  lastTrick: CompletedTrickView | null;
  /** 1..8 during playing. */
  trickNumber: number;
  /** Declarations the viewer may announce with their first-trick card (cards included). */
  declarationsOffered: DeclarationView[];
  /** Cards in the viewer's hand that would announce белот if played now. */
  belotCards: CardId[];
  /** Announced declarations; cards are revealed after trick one. */
  declared: DeclarationView[];
  belots: BelotView[];
  scores: [number, number];
  hanging: number;
  /** Matches won by each team since the room started; survives Нова игра. */
  gamesWon: [number, number];
  dealSummary: DealSummaryView | null;
  /** Seconds until the next deal starts, during dealEnd. */
  dealEndsInSec: number | null;
  winner: Team | null;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  mySeat: Seat | null;
  seats: (SeatView | null)[];
  game: GameView | null;
}

export type ErrorCode =
  | "roomNotFound"
  | "roomStarted"
  | "seatTaken"
  | "notSeated"
  | "cannotStandDuringGame"
  | "seatNotReleasable"
  | "tooManyAttempts"
  | "notYourTurn"
  | "illegalMove"
  | "invalidIntent"
  | "gamePaused"
  | "nameRequired";

export interface ServerError {
  code: ErrorCode;
  message: string;
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  roomNotFound: "Няма такава стая",
  roomStarted: "Играта вече започна",
  seatTaken: "Мястото е заето",
  notSeated: "Не сте седнали",
  cannotStandDuringGame: "Не можете да станете по време на игра",
  seatNotReleasable: "Мястото още не може да се освободи",
  tooManyAttempts: "Твърде много опити, изчакайте малко",
  notYourTurn: "Не сте на ход",
  illegalMove: "Невалиден ход",
  invalidIntent: "Невалидна заявка",
  gamePaused: "Играта е на пауза",
  nameRequired: "Въведете име",
};

/** Ack payload for an `intent` emit. */
export type IntentAck = { ok: true } | { ok: false; error: ServerError };

export interface ServerToClientEvents {
  state: (view: RoomView) => void;
  error: (error: ServerError) => void;
  left: () => void;
}

export interface ClientToServerEvents {
  intent: (intent: ClientIntent, ack?: (result: IntentAck) => void) => void;
}

export const LABELS = {
  contracts: {
    clubs: "Спатия",
    diamonds: "Каро",
    hearts: "Купа",
    spades: "Пика",
    notrumps: "Без коз",
    alltrumps: "Всичко коз",
  } satisfies Record<Contract, string>,
  bids: {
    pass: "Пас",
    contra: "Контра",
    recontra: "Реконтра",
  },
  suits: {
    C: "♣",
    D: "♦",
    H: "♥",
    S: "♠",
  } satisfies Record<Suit, string>,
  sit: "Седни",
  stand: "Стани",
  newGame: "Нова игра",
  releaseSeat: "Освободи мястото",
  we: "Ние",
  they: "Те",
  belot: "Белот",
  declare: "Анонс",
  waiting: "Чакаме играчи",
  yourTurn: "Вие сте на ход",
} as const;
