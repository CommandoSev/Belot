import { describe, expect, it, vi } from "vitest";
import type { GameView, Seat } from "@belot/shared";
import {
  JOIN_FAIL_LIMIT,
  ROOM_IDLE_MS,
  SEAT_RELEASE_MS,
  RoomManager,
  type GameHost,
  type Room,
} from "../rooms";

function stubHost(): GameHost {
  return {
    onSeatReleased: vi.fn(),
    onSeatFilled: vi.fn(),
    onIntent: vi.fn(() => null),
    view: vi.fn(() => ({ phase: "bidding" }) as unknown as GameView),
    phase: vi.fn(() => "bidding" as const),
  };
}

function setup() {
  let time = 1_000_000;
  const clock = { now: () => time, advance: (ms: number) => (time += ms) };
  let codes = ["ABCD", "EFGH", "JKLM"];
  const host = stubHost();
  const startHook = vi.fn(() => host);
  const onRoomWaiting = vi.fn();
  const manager = new RoomManager({
    now: clock.now,
    generateCode: () => codes.shift() ?? "WXYZ",
    startHook,
    onRoomWaiting,
  });
  const connect = (token: string) => manager.connect(token, `Player ${token}`);
  const createRoom = (token = "t0"): Room => {
    connect(token);
    expect(manager.create(token)).toEqual({ ok: true });
    return manager.roomOf(token)!;
  };
  const joinRoom = (token: string, code: string, conn = `conn-${token}`) => {
    connect(token);
    return manager.join(token, code, conn);
  };
  /** Fills all four seats with tokens t0..t3 and returns the room. */
  const fullRoom = (): Room => {
    const room = createRoom("t0");
    for (const i of [1, 2, 3]) expect(joinRoom(`t${i}`, room.code)).toEqual({ ok: true });
    for (const i of [0, 1, 2, 3] as Seat[]) expect(manager.sit(`t${i}`, i)).toEqual({ ok: true });
    return room;
  };
  return { manager, clock, host, startHook, onRoomWaiting, connect, createRoom, joinRoom, fullRoom };
}

describe("RoomManager: create and join", () => {
  it("creating a room returns a code and leaves the creator unseated", () => {
    const { manager, createRoom } = setup();
    const room = createRoom("t0");
    expect(room.code).toBe("ABCD");
    expect(room.seats).toEqual([null, null, null, null]);
    expect(room.participants.has("t0")).toBe(true);
    const view = manager.buildRoomView(room, "t0");
    expect(view).toEqual({ code: "ABCD", phase: "waiting", mySeat: null, seats: [null, null, null, null], game: null });
  });

  it("skips a generated code that is already in use", () => {
    const codes = ["QQQQ", "QQQQ", "RRRR"];
    const manager = new RoomManager({ generateCode: () => codes.shift() ?? "ZZZZ" });
    manager.create("a");
    manager.create("b");
    expect(manager.roomOf("a")!.code).toBe("QQQQ");
    expect(manager.roomOf("b")!.code).toBe("RRRR");
  });

  it("joining an unknown code fails, a known code adds the player unseated", () => {
    const { manager, createRoom, joinRoom } = setup();
    const room = createRoom("t0");
    expect(joinRoom("t1", "NOPE")).toEqual({ ok: false, code: "roomNotFound" });
    expect(manager.roomOf("t1")).toBeUndefined();
    expect(joinRoom("t1", " abcd ")).toEqual({ ok: true });
    expect(manager.roomOf("t1")).toBe(room);
    expect(room.participants.has("t1")).toBe(true);
    expect(manager.buildRoomView(room, "t1").mySeat).toBeNull();
  });

  it("joining another room leaves the previous one", () => {
    const { manager, createRoom, joinRoom } = setup();
    const first = createRoom("t0");
    const second = createRoom("t9");
    expect(joinRoom("t0", second.code)).toEqual({ ok: true });
    expect(manager.tokensIn(first)).toEqual([]);
    expect(manager.roomOf("t0")).toBe(second);
  });
});

describe("RoomManager: seats", () => {
  it("rejects sitting in an occupied seat and keeps the first occupant", () => {
    const { manager, createRoom, joinRoom } = setup();
    const room = createRoom("t0");
    joinRoom("t1", room.code);
    expect(manager.sit("t0", 2)).toEqual({ ok: true });
    expect(manager.sit("t1", 2)).toEqual({ ok: false, code: "seatTaken" });
    expect(room.seats[2]?.token).toBe("t0");
    expect(room.seats[2]?.name).toBe("Player t0");
    expect(manager.seatOf(room, "t1")).toBeNull();
  });

  it("moving to another empty seat before the game frees the old one", () => {
    const { manager, createRoom } = setup();
    const room = createRoom("t0");
    manager.sit("t0", 0);
    expect(manager.sit("t0", 3)).toEqual({ ok: true });
    expect(room.seats[0]).toBeNull();
    expect(room.seats[3]?.token).toBe("t0");
  });

  it("standing before the game empties the seat; standing during a game is rejected", () => {
    const { manager, createRoom, fullRoom } = setup();
    const room = createRoom("t0");
    expect(manager.stand("t0")).toEqual({ ok: false, code: "notSeated" });
    manager.sit("t0", 1);
    expect(manager.stand("t0")).toEqual({ ok: true });
    expect(room.seats[1]).toBeNull();
    expect(room.participants.has("t0")).toBe(true);

    const live = fullRoom();
    expect(manager.stand("t2")).toEqual({ ok: false, code: "cannotStandDuringGame" });
    expect(live.seats[2]?.token).toBe("t2");
    expect(manager.leave("t2")).toEqual({ ok: false, code: "cannotStandDuringGame" });
  });

  it("the fourth sit-down starts the room and invokes the start hook", () => {
    const { manager, host, startHook, createRoom, joinRoom } = setup();
    const room = createRoom("t0");
    for (const i of [1, 2, 3]) joinRoom(`t${i}`, room.code);
    for (const i of [0, 1, 2] as Seat[]) manager.sit(`t${i}`, i);
    expect(room.started).toBe(false);
    expect(startHook).not.toHaveBeenCalled();

    manager.sit("t3", 3);
    expect(room.started).toBe(true);
    expect(startHook).toHaveBeenCalledWith(room);
    expect(room.controller).toBe(host);
    expect(room.participants.size).toBe(0);
    const view = manager.buildRoomView(room, "t3");
    expect(view.phase).toBe("bidding");
    expect(view.mySeat).toBe(3);
    expect(view.game).toEqual({ phase: "bidding" });
    expect(host.view).toHaveBeenCalledWith(3);
  });

  it("rejects a new token joining a started room but admits a seat owner", () => {
    const { manager, fullRoom, joinRoom } = setup();
    const room = fullRoom();
    expect(joinRoom("t5", room.code)).toEqual({ ok: false, code: "roomStarted" });
    expect(manager.roomOf("t5")).toBeUndefined();
    expect(joinRoom("t1", room.code)).toEqual({ ok: true });
    expect(manager.seatOf(room, "t1")).toBe(1);
  });
});

describe("RoomManager: connection and identity", () => {
  it("disconnect keeps the seat and name, the same token restores it, another token cannot take it", () => {
    const { manager, clock, connect, fullRoom, joinRoom } = setup();
    const room = fullRoom();
    manager.disconnect("t1");
    expect(room.seats[1]).toMatchObject({ token: "t1", name: "Player t1", connected: false, disconnectedAt: clock.now() });
    clock.advance(5_000);
    expect(manager.buildRoomView(room, "t0").seats[1]).toEqual({
      name: "Player t1",
      connected: false,
      disconnectedForSec: 5,
    });

    // A stranger cannot join the started room, and even a member cannot take the owned seat.
    expect(joinRoom("t7", room.code)).toEqual({ ok: false, code: "roomStarted" });
    expect(manager.sit("t0", 1)).toEqual({ ok: false, code: "seatTaken" });

    expect(connect("t1")).toBe(room);
    expect(room.seats[1]).toMatchObject({ token: "t1", connected: true, disconnectedAt: null });
    expect(manager.buildRoomView(room, "t1").seats[1]?.disconnectedForSec).toBeNull();
  });

  it("a new connection with a token that owns a seat lands back in the room without a join intent", () => {
    const { manager, fullRoom } = setup();
    const room = fullRoom();
    manager.disconnect("t2");
    expect(manager.connect("t2", "Renamed")).toBe(room);
    expect(manager.roomOf("t2")).toBe(room);
    const view = manager.buildRoomView(room, "t2");
    expect(view.mySeat).toBe(2);
    expect(view.seats[2]).toEqual({ name: "Player t2", connected: true, disconnectedForSec: null });
    expect(manager.connect("unknown", "Nobody")).toBeNull();
  });

  it("an unseated participant that disconnects leaves the room", () => {
    const { manager, createRoom, joinRoom } = setup();
    const room = createRoom("t0");
    joinRoom("t1", room.code);
    manager.disconnect("t1");
    expect(manager.roomOf("t1")).toBeUndefined();
    expect(room.participants.has("t1")).toBe(false);
  });

  it("leaveRoom removes the token and empties its seat while waiting", () => {
    const { manager, createRoom } = setup();
    const room = createRoom("t0");
    manager.sit("t0", 0);
    expect(manager.leave("t0")).toEqual({ ok: true });
    expect(room.seats[0]).toBeNull();
    expect(manager.roomOf("t0")).toBeUndefined();
    expect(manager.leave("t0")).toEqual({ ok: true });
  });
});

describe("RoomManager: releaseSeat", () => {
  it("is rejected under 60 seconds and succeeds after; the freed seat can be taken by a new token", () => {
    const { manager, clock, host, onRoomWaiting, fullRoom, joinRoom } = setup();
    const room = fullRoom();
    manager.disconnect("t3");

    clock.advance(SEAT_RELEASE_MS - 1);
    expect(manager.releaseSeat("t0", 3)).toEqual({ ok: false, code: "seatNotReleasable" });
    expect(room.seats[3]?.token).toBe("t3");
    expect(host.onSeatReleased).not.toHaveBeenCalled();

    clock.advance(1);
    expect(manager.releaseSeat("t0", 3)).toEqual({ ok: true });
    expect(room.seats[3]).toBeNull();
    expect(room.started).toBe(false);
    expect(host.onSeatReleased).toHaveBeenCalledWith(3);
    expect(onRoomWaiting).toHaveBeenCalledWith(room);
    expect(manager.buildRoomView(room, "t0").phase).toBe("waiting");
    expect(manager.roomOf("t3")).toBeUndefined();

    expect(joinRoom("t9", room.code)).toEqual({ ok: true });
    expect(manager.sit("t9", 3)).toEqual({ ok: true });
    expect(room.started).toBe(true);
    expect(host.onSeatFilled).toHaveBeenCalledWith(3);
    expect(room.controller).toBe(host);
    expect(manager.buildRoomView(room, "t9").mySeat).toBe(3);
  });

  it("rejects release of a connected seat, from an unseated or disconnected caller", () => {
    const { manager, clock, fullRoom } = setup();
    const room = fullRoom();
    expect(manager.releaseSeat("t0", 1)).toEqual({ ok: false, code: "seatNotReleasable" });

    manager.disconnect("t1");
    manager.disconnect("t2");
    clock.advance(SEAT_RELEASE_MS);
    expect(manager.releaseSeat("t2", 1)).toEqual({ ok: false, code: "notSeated" });
    expect(manager.releaseSeat("nobody", 1)).toEqual({ ok: false, code: "invalidIntent" });
    expect(room.seats[1]?.token).toBe("t1");
    expect(manager.releaseSeat("t0", 1)).toEqual({ ok: true });
  });
});

describe("RoomManager: rate limiting and idle cleanup", () => {
  it("rejects the eleventh failed join within a minute from one connection regardless of the code", () => {
    const { manager, clock, createRoom, connect } = setup();
    const room = createRoom("t0");
    connect("t1");
    for (let i = 0; i < JOIN_FAIL_LIMIT; i++) {
      expect(manager.join("t1", `BAD${i}`, "conn-1")).toEqual({ ok: false, code: "roomNotFound" });
    }
    expect(manager.join("t1", room.code, "conn-1")).toEqual({ ok: false, code: "tooManyAttempts" });
    // Another connection is unaffected.
    expect(manager.join("t1", room.code, "conn-2")).toEqual({ ok: true });
    manager.leave("t1");

    clock.advance(60_000);
    expect(manager.join("t1", room.code, "conn-1")).toEqual({ ok: true });
  });

  it("removes a room with no connected players after ten minutes", () => {
    const { manager, clock, createRoom, joinRoom } = setup();
    const room = createRoom("t0");
    joinRoom("t1", room.code);
    manager.sit("t0", 0);
    manager.sit("t1", 1);
    manager.disconnect("t0");
    clock.advance(ROOM_IDLE_MS);
    expect(manager.sweep()).toEqual([]);

    manager.disconnect("t1");
    clock.advance(ROOM_IDLE_MS - 1);
    expect(manager.sweep()).toEqual([]);
    expect(manager.get(room.code)).toBe(room);

    clock.advance(1);
    expect(manager.sweep()).toEqual([room.code]);
    expect(manager.get(room.code)).toBeUndefined();
    expect(manager.roomOf("t0")).toBeUndefined();
    expect(manager.roomOf("t1")).toBeUndefined();
  });

  it("a reconnect resets the idle window", () => {
    const { manager, clock, connect, createRoom } = setup();
    const room = createRoom("t0");
    manager.sit("t0", 0);
    manager.disconnect("t0");
    clock.advance(ROOM_IDLE_MS - 1);
    connect("t0");
    expect(room.emptySince).toBeNull();
    clock.advance(ROOM_IDLE_MS);
    expect(manager.sweep()).toEqual([]);
  });
});
