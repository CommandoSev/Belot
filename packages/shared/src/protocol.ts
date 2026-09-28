// Wire protocol between client and server: intents, views, error codes and Bulgarian labels.
import type { BidAction, CardId, Contract, Seat, Suit } from "./engine/types";

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

// Placeholder: the game unit extends this with hands, tricks, bidding and scores.
export interface GameView {
  phase: RoomPhase;
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
