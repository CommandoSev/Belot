import http from "node:http";
import path from "node:path";
import express from "express";
import { Server, type Socket } from "socket.io";
import {
  ERROR_MESSAGES,
  MAX_NAME_LENGTH,
  PROTOCOL_VERSION,
  isGameIntent,
  type ClientAuth,
  type ClientIntent,
  type ClientToServerEvents,
  type ErrorCode,
  type IntentAck,
  type Seat,
  type ServerToClientEvents,
} from "@belot/shared";
import { createGameController } from "./game";
import { RoomManager, type Room } from "./rooms";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const app = express();
const httpServer = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

const clientDist = path.resolve(__dirname, "../../client/dist");

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, protocol: PROTOCOL_VERSION });
});

app.use(express.static(clientDist));
app.use((_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

const rooms = new RoomManager({
  startHook: (room) => createGameController(room, { onChange: emitRoom }),
});

/** Every live socket per browser token; a second tab shares the seat. */
const socketsByToken = new Map<string, Set<GameSocket>>();

function serverError(code: ErrorCode) {
  return { code, message: ERROR_MESSAGES[code] };
}

/** Sends each member their own view; hidden information never leaves the per-token path. */
function emitRoom(room: Room | undefined | null): void {
  if (!room) return;
  for (const token of rooms.tokensIn(room)) {
    const sockets = socketsByToken.get(token);
    if (!sockets) continue;
    const view = rooms.buildRoomView(room, token);
    for (const socket of sockets) socket.emit("state", view);
  }
}

function emitLeft(token: string): void {
  for (const socket of socketsByToken.get(token) ?? []) socket.emit("left");
}

function readAuth(raw: unknown): ClientAuth | null {
  if (!raw || typeof raw !== "object") return null;
  const { token, name } = raw as Record<string, unknown>;
  if (typeof token !== "string" || token.length === 0 || token.length > 64) return null;
  if (typeof name !== "string") return null;
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (trimmed.length === 0) return null;
  return { token, name: trimmed };
}

const isSeat = (value: unknown): value is Seat =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3;

/** Validates an untrusted wire payload; the engine validates legality later. */
function parseIntent(raw: unknown): ClientIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const intent = raw as Record<string, unknown>;
  switch (intent.type) {
    case "createRoom":
    case "stand":
    case "newGame":
    case "leaveRoom":
      return { type: intent.type };
    case "joinRoom":
      return typeof intent.code === "string" ? { type: "joinRoom", code: intent.code } : null;
    case "sit":
      return isSeat(intent.seat) ? { type: "sit", seat: intent.seat } : null;
    case "releaseSeat":
      return isSeat(intent.seat) ? { type: "releaseSeat", seat: intent.seat } : null;
    case "bid": {
      const action = intent.action as Record<string, unknown> | undefined;
      if (!action || typeof action !== "object") return null;
      if (action.type === "pass" || action.type === "contra" || action.type === "recontra") {
        return { type: "bid", action: { type: action.type } };
      }
      if (action.type === "bid" && typeof action.contract === "string") {
        return { type: "bid", action: { type: "bid", contract: action.contract as never } };
      }
      return null;
    }
    case "play":
      if (typeof intent.card !== "string") return null;
      return {
        type: "play",
        card: intent.card as never,
        declare: intent.declare === true,
        belot: intent.belot === true,
      };
    default:
      return null;
  }
}

function handleIntent(socket: GameSocket, token: string, intent: ClientIntent): ErrorCode | null {
  const before = rooms.roomOf(token);
  if (isGameIntent(intent)) {
    if (!before?.controller || !before.started) return "invalidIntent";
    const seat = rooms.seatOf(before, token);
    if (seat === null) return "notSeated";
    const error = before.controller.onIntent(seat, intent);
    if (!error) emitRoom(before);
    return error;
  }

  let outcome;
  switch (intent.type) {
    case "createRoom":
      outcome = rooms.create(token);
      break;
    case "joinRoom":
      outcome = rooms.join(token, intent.code, socket.id);
      break;
    case "sit":
      outcome = rooms.sit(token, intent.seat);
      break;
    case "stand":
      outcome = rooms.stand(token);
      break;
    case "releaseSeat":
      outcome = rooms.releaseSeat(token, intent.seat);
      break;
    case "leaveRoom":
      outcome = rooms.leave(token);
      break;
  }
  if (!outcome.ok) return outcome.code;

  const after = rooms.roomOf(token);
  if (before && before !== after) emitRoom(before);
  if (after) emitRoom(after);
  else emitLeft(token);
  return null;
}

io.use((socket, next) => {
  const auth = readAuth(socket.handshake.auth);
  if (!auth) {
    const err = new Error(ERROR_MESSAGES.nameRequired) as Error & { data?: unknown };
    err.data = serverError("nameRequired");
    return next(err);
  }
  socket.data = auth;
  next();
});

io.on("connection", (socket: GameSocket) => {
  const { token, name } = socket.data as ClientAuth;
  let peers = socketsByToken.get(token);
  if (!peers) {
    peers = new Set();
    socketsByToken.set(token, peers);
  }
  peers.add(socket);

  emitRoom(rooms.connect(token, name));

  socket.on("intent", (raw, ack?: (result: IntentAck) => void) => {
    const intent = parseIntent(raw);
    const code = intent ? handleIntent(socket, token, intent) : "invalidIntent";
    if (code) {
      const error = serverError(code);
      socket.emit("error", error);
      ack?.({ ok: false, error });
    } else {
      ack?.({ ok: true });
    }
  });

  socket.on("disconnect", () => {
    rooms.forgetConnection(socket.id);
    peers.delete(socket);
    if (peers.size > 0) return;
    socketsByToken.delete(token);
    emitRoom(rooms.disconnect(token));
  });
});

setInterval(() => rooms.sweep(), 60_000).unref();

const port = Number(process.env.PORT ?? 3000);
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`belot server listening on ${port}`);
});
