// Socket.IO connection, browser identity and the single state subscription the UI renders from.
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientIntent,
  ClientToServerEvents,
  IntentAck,
  RoomView,
  ServerError,
  ServerToClientEvents,
} from "@belot/shared";

const TOKEN_KEY = "belot.token";
const NAME_KEY = "belot.name";
/** After a reconnect the server re-sends the room view at once; silence means the room is gone. */
const ORPHAN_VIEW_MS = 4000;

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface LastError extends ServerError {
  at: number;
}

export interface Connection {
  status: ConnectionStatus;
  view: RoomView | null;
  lastError: LastError | null;
  /** Nickname known for this browser; empty until the player enters one. */
  name: string;
  send: (intent: ClientIntent, ack?: (result: IntentAck) => void) => void;
  setName: (name: string) => void;
}

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the session still works, identity is just not persisted.
  }
}

/** The identity token is minted once per browser and never shown; it is what unlocks a seat's hand. */
export function getToken(): string {
  let token = readStorage(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    writeStorage(TOKEN_KEY, token);
  }
  return token;
}

export function getStoredName(): string {
  return readStorage(NAME_KEY);
}

export function useConnection(): Connection {
  const [name, setNameState] = useState(getStoredName);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [view, setView] = useState<RoomView | null>(null);
  const [lastError, setLastError] = useState<LastError | null>(null);
  const socketRef = useRef<GameSocket | null>(null);
  const viewRef = useRef<RoomView | null>(null);
  /** Intents sent before the socket exists (name just entered) are flushed on creation. */
  const pending = useRef<Array<[ClientIntent, ((result: IntentAck) => void) | undefined]>>([]);

  useEffect(() => {
    if (!name) return;
    const socket: GameSocket = io({ auth: { token: getToken(), name } });
    socketRef.current = socket;
    let orphanTimer: ReturnType<typeof setTimeout> | undefined;

    socket.on("connect", () => {
      setStatus("connected");
      if (viewRef.current) {
        orphanTimer = setTimeout(() => {
          viewRef.current = null;
          setView(null);
        }, ORPHAN_VIEW_MS);
      }
    });
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.on("connect_error", () => setStatus((s) => (s === "connected" ? "disconnected" : s)));
    socket.on("state", (next) => {
      clearTimeout(orphanTimer);
      viewRef.current = next;
      setView(next);
    });
    socket.on("error", (error) => setLastError({ ...error, at: Date.now() }));
    socket.on("left", () => {
      viewRef.current = null;
      setView(null);
    });

    for (const [intent, ack] of pending.current.splice(0)) socket.emit("intent", intent, ack);

    return () => {
      clearTimeout(orphanTimer);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [name]);

  const send = useCallback<Connection["send"]>((intent, ack) => {
    const socket = socketRef.current;
    if (socket) socket.emit("intent", intent, ack);
    else pending.current.push([intent, ack]);
  }, []);

  const setName = useCallback((next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return;
    writeStorage(NAME_KEY, trimmed);
    setNameState(trimmed);
  }, []);

  return { status, view, lastError, name, send, setName };
}
