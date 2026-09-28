import { useEffect, useRef, useState } from "react";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { Lobby } from "./components/Lobby";
import { Table } from "./components/Table";
import { Toast } from "./components/Toast";
import { t } from "./i18n/bg";
import { useConnection } from "./socket";

const WAKING_HINT_MS = 10_000;

/** Accepts /r/ABCD and ?room=ABCD. */
export function readRoomCodeFromUrl(): string {
  const path = window.location.pathname.match(/^\/r\/([A-Za-z]{4})\/?$/);
  const raw = path?.[1] ?? new URLSearchParams(window.location.search).get("room") ?? "";
  return raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

function Connecting() {
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaking(true), WAKING_HINT_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="connecting" role="status">
      <div className="spinner" aria-hidden="true" />
      <p className="connecting-text">{t.connecting}</p>
      {waking && <p className="connecting-hint">{t.serverWaking}</p>}
    </main>
  );
}

export function App() {
  const conn = useConnection();
  const [urlCode] = useState(readRoomCodeFromUrl);
  const hadView = useRef(false);

  useEffect(() => {
    if (conn.view) {
      hadView.current = true;
      const target = `/r/${conn.view.code}`;
      if (window.location.pathname !== target) window.history.replaceState(null, "", target);
    } else if (hadView.current) {
      hadView.current = false;
      window.history.replaceState(null, "", "/");
    }
  }, [conn.view]);

  const create = (name: string) => {
    conn.setName(name);
    conn.send({ type: "createRoom" });
  };
  const join = (name: string, code: string) => {
    conn.setName(name);
    conn.send({ type: "joinRoom", code });
  };

  let screen;
  if (conn.view) {
    screen = <Table view={conn.view} send={conn.send} />;
  } else if (conn.name && conn.status === "connecting") {
    screen = <Connecting />;
  } else {
    screen = <Lobby name={conn.name} initialCode={urlCode} onCreate={create} onJoin={join} />;
  }

  return (
    <>
      {conn.status === "disconnected" && conn.view && <ConnectionBanner />}
      {screen}
      <Toast error={conn.lastError} />
    </>
  );
}
