// In-memory rooms: codes, seats, browser-token identity, reconnection and idle cleanup.
// Free of socket.io so it can be unit-tested with a fake clock.
import type { ErrorCode, GameIntent, GameView, RoomPhase, RoomView, Seat } from "@belot/shared";

export const SEAT_RELEASE_MS = 60_000;
export const ROOM_IDLE_MS = 10 * 60_000;
export const JOIN_FAIL_WINDOW_MS = 60_000;
export const JOIN_FAIL_LIMIT = 10;

/** Room code alphabet without glyphs that are easy to misread (I, O, 0, 1). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;

/** What the game controller must offer the room layer. Implemented by the game unit. */
export interface GameHost {
  /** A seat was freed while a match was running: abandon the deal, keep the score. */
  onSeatReleased(seat: Seat): void;
  /** The freed seat has been taken again: continue the match. */
  onSeatFilled(seat: Seat): void;
  /** Applies a game intent for the given seat; null on success. */
  onIntent(seat: Seat, intent: GameIntent): ErrorCode | null;
  view(seat: Seat | null): GameView | null;
  phase(): RoomPhase;
}

export interface SeatState {
  token: string;
  name: string;
  connected: boolean;
  disconnectedAt: number | null;
}

export interface Room {
  code: string;
  seats: (SeatState | null)[];
  /** Tokens present in the room without a seat. */
  participants: Set<string>;
  /** Tokens with at least one live connection. */
  connectedTokens: Set<string>;
  /** When the last connection left, null while anyone is connected. */
  emptySince: number | null;
  /** True from the fourth sit-down until a seat is released. */
  started: boolean;
  controller: GameHost | null;
}

export type Outcome = { ok: true } | { ok: false; code: ErrorCode };

const OK: Outcome = { ok: true };
const fail = (code: ErrorCode): Outcome => ({ ok: false, code });

export interface RoomManagerOptions {
  now?: () => number;
  generateCode?: () => string;
  /** Called when the fourth seat is taken in a room without a controller. */
  startHook?: (room: Room) => GameHost;
  /** Called when a released seat sends a started room back to waiting. */
  onRoomWaiting?: (room: Room) => void;
}

export function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly roomByToken = new Map<string, Room>();
  private readonly names = new Map<string, string>();
  /** Failed join timestamps per connection id, for rate limiting. */
  private readonly joinFailures = new Map<string, number[]>();

  private readonly now: () => number;
  private readonly generateCode: () => string;
  private readonly startHook?: (room: Room) => GameHost;
  private readonly onRoomWaiting?: (room: Room) => void;

  constructor(options: RoomManagerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.generateCode = options.generateCode ?? randomCode;
    this.startHook = options.startHook;
    this.onRoomWaiting = options.onRoomWaiting;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(normalizeCode(code));
  }

  roomOf(token: string): Room | undefined {
    return this.roomByToken.get(token);
  }

  seatOf(room: Room, token: string): Seat | null {
    const index = room.seats.findIndex((s) => s?.token === token);
    return index < 0 ? null : (index as Seat);
  }

  /** Every token that belongs to the room, seated or not. */
  tokensIn(room: Room): string[] {
    const seated = room.seats.flatMap((s) => (s ? [s.token] : []));
    return [...seated, ...room.participants];
  }

  /** A connection arrived for the token. Returns the room it was placed back into, if any. */
  connect(token: string, name: string): Room | null {
    this.names.set(token, name);
    const room = this.roomByToken.get(token);
    if (!room) return null;
    this.markConnected(room, token);
    const seat = room.seats.find((s) => s?.token === token);
    if (seat) {
      seat.name = name;
      seat.connected = true;
      seat.disconnectedAt = null;
    }
    return room;
  }

  /** A paused match (seat released, waiting for a replacement) still binds the seated players to their seats. */
  private matchInProgress(room: Room): boolean {
    return room.controller !== null && room.controller.phase() !== "finished";
  }

  /** The token's last connection dropped. Seated players keep their seat; unseated ones leave. */
  disconnect(token: string): Room | null {
    const room = this.roomByToken.get(token);
    if (!room) return null;
    const seat = room.seats.find((s) => s?.token === token);
    if (seat) {
      seat.connected = false;
      seat.disconnectedAt = this.now();
      this.markDisconnected(room, token);
    } else {
      this.removeFromRoom(room, token);
    }
    return room;
  }

  create(token: string): Outcome {
    const left = this.leave(token);
    if (!left.ok) return left;
    let code = normalizeCode(this.generateCode());
    while (this.rooms.has(code)) code = normalizeCode(this.generateCode());
    const room: Room = {
      code,
      seats: [null, null, null, null],
      participants: new Set(),
      connectedTokens: new Set(),
      emptySince: null,
      started: false,
      controller: null,
    };
    this.rooms.set(code, room);
    this.enter(room, token);
    return OK;
  }

  /** `connectionId` scopes the rate limit on failed attempts (a socket id in production). */
  join(token: string, rawCode: string, connectionId: string): Outcome {
    if (this.recentFailures(connectionId).length >= JOIN_FAIL_LIMIT) {
      return fail("tooManyAttempts");
    }
    const room = this.rooms.get(normalizeCode(rawCode));
    if (!room) return this.failJoin(connectionId, "roomNotFound");
    if (this.roomByToken.get(token) === room) {
      this.markConnected(room, token);
      return OK;
    }
    if (room.started && this.seatOf(room, token) === null) {
      return this.failJoin(connectionId, "roomStarted");
    }
    const left = this.leave(token);
    if (!left.ok) return left;
    this.enter(room, token);
    return OK;
  }

  sit(token: string, seat: Seat): Outcome {
    const room = this.roomByToken.get(token);
    if (!room) return fail("invalidIntent");
    if (room.seats[seat]) return fail(room.seats[seat].token === token ? "invalidIntent" : "seatTaken");
    const current = this.seatOf(room, token);
    if (current !== null) {
      if (room.started || this.matchInProgress(room)) return fail("cannotStandDuringGame");
      room.seats[current] = null;
    }
    room.participants.delete(token);
    room.seats[seat] = {
      token,
      name: this.names.get(token) ?? "",
      connected: room.connectedTokens.has(token),
      disconnectedAt: null,
    };
    if (room.seats.every((s) => s !== null)) this.start(room, seat);
    return OK;
  }

  stand(token: string): Outcome {
    const room = this.roomByToken.get(token);
    if (!room) return fail("invalidIntent");
    const seat = this.seatOf(room, token);
    if (seat === null) return fail("notSeated");
    if (room.started || this.matchInProgress(room)) return fail("cannotStandDuringGame");
    room.seats[seat] = null;
    room.participants.add(token);
    return OK;
  }

  /** Frees a seat whose owner has been gone for at least SEAT_RELEASE_MS. Only a connected seated player may do it. */
  releaseSeat(token: string, seat: Seat): Outcome {
    const room = this.roomByToken.get(token);
    if (!room) return fail("invalidIntent");
    const mine = this.seatOf(room, token);
    if (mine === null || !room.connectedTokens.has(token)) return fail("notSeated");
    const target = room.seats[seat];
    if (!target || target.connected || target.disconnectedAt === null) return fail("seatNotReleasable");
    if (this.now() - target.disconnectedAt < SEAT_RELEASE_MS) return fail("seatNotReleasable");

    room.seats[seat] = null;
    this.roomByToken.delete(target.token);
    const wasStarted = room.started;
    room.started = false;
    if (wasStarted) {
      room.controller?.onSeatReleased(seat);
      this.onRoomWaiting?.(room);
    }
    return OK;
  }

  /** Leaves the current room, if any. Seated players cannot leave a running game. */
  leave(token: string): Outcome {
    const room = this.roomByToken.get(token);
    if (!room) return OK;
    if (room.started && this.seatOf(room, token) !== null) return fail("cannotStandDuringGame");
    this.removeFromRoom(room, token);
    return OK;
  }

  /** Drops rooms with no connection for ROOM_IDLE_MS and forgets stale join failures. Returns removed codes. */
  sweep(): string[] {
    const now = this.now();
    const removed: string[] = [];
    for (const room of this.rooms.values()) {
      if (room.emptySince !== null && now - room.emptySince >= ROOM_IDLE_MS) {
        for (const token of this.tokensIn(room)) this.roomByToken.delete(token);
        this.rooms.delete(room.code);
        removed.push(room.code);
      }
    }
    for (const [id, stamps] of this.joinFailures) {
      const recent = stamps.filter((t) => now - t < JOIN_FAIL_WINDOW_MS);
      if (recent.length === 0) this.joinFailures.delete(id);
      else this.joinFailures.set(id, recent);
    }
    return removed;
  }

  buildRoomView(room: Room, token: string): RoomView {
    const now = this.now();
    const mySeat = this.seatOf(room, token);
    return {
      code: room.code,
      phase: this.phaseOf(room),
      mySeat,
      seats: room.seats.map((s) =>
        s
          ? {
              name: s.name,
              connected: s.connected,
              disconnectedForSec:
                s.connected || s.disconnectedAt === null ? null : Math.floor((now - s.disconnectedAt) / 1000),
            }
          : null,
      ),
      game: room.controller?.view(mySeat) ?? null,
    };
  }

  phaseOf(room: Room): RoomPhase {
    return room.started && room.controller ? room.controller.phase() : "waiting";
  }

  private start(room: Room, filledSeat: Seat): void {
    room.started = true;
    if (room.controller) {
      room.controller.onSeatFilled(filledSeat);
    } else if (this.startHook) {
      room.controller = this.startHook(room);
    }
  }

  private enter(room: Room, token: string): void {
    room.participants.add(token);
    this.roomByToken.set(token, room);
    this.markConnected(room, token);
  }

  private removeFromRoom(room: Room, token: string): void {
    const seat = this.seatOf(room, token);
    if (seat !== null) room.seats[seat] = null;
    room.participants.delete(token);
    this.roomByToken.delete(token);
    this.markDisconnected(room, token);
  }

  private markConnected(room: Room, token: string): void {
    room.connectedTokens.add(token);
    room.emptySince = null;
  }

  private markDisconnected(room: Room, token: string): void {
    room.connectedTokens.delete(token);
    if (room.connectedTokens.size === 0) room.emptySince = this.now();
  }

  private recentFailures(connectionId: string): number[] {
    const now = this.now();
    const recent = (this.joinFailures.get(connectionId) ?? []).filter((t) => now - t < JOIN_FAIL_WINDOW_MS);
    this.joinFailures.set(connectionId, recent);
    return recent;
  }

  private failJoin(connectionId: string, code: ErrorCode): Outcome {
    this.recentFailures(connectionId).push(this.now());
    return fail(code);
  }
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
