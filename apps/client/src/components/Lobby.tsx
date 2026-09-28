import { useState, type FormEvent } from "react";
import { MAX_NAME_LENGTH } from "@belot/shared";
import { t } from "../i18n/bg";

interface LobbyProps {
  name: string;
  initialCode: string;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
}

const CODE_LENGTH = 4;

export function Lobby({ name: storedName, initialCode, onCreate, onJoin }: LobbyProps) {
  const [name, setName] = useState(storedName);
  const [code, setCode] = useState(initialCode);
  const [nameError, setNameError] = useState(false);

  const validName = (): string | null => {
    const trimmed = name.trim();
    setNameError(!trimmed);
    return trimmed || null;
  };

  const create = () => {
    const valid = validName();
    if (valid) onCreate(valid);
  };

  const join = (event: FormEvent) => {
    event.preventDefault();
    const valid = validName();
    if (valid && code.length === CODE_LENGTH) onJoin(valid, code);
  };

  return (
    <main className="lobby">
      <div className="lobby-card">
        <h1 className="lobby-title">{t.title}</h1>
        <form className="lobby-form" onSubmit={join}>
          <label className="field">
            <span className="field-label">{t.yourName}</span>
            <input
              className="input"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              placeholder={t.namePlaceholder}
              autoComplete="nickname"
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setNameError(false);
              }}
            />
            {nameError && <span className="field-error">{t.errors.nameRequired}</span>}
          </label>

          <button type="button" className="btn btn-primary btn-large" onClick={create}>
            {t.createRoom}
          </button>

          <div className="divider" aria-hidden="true" />

          <label className="field">
            <span className="field-label">{t.roomCode}</span>
            <input
              className="input input-code"
              value={code}
              maxLength={CODE_LENGTH}
              placeholder={t.codePlaceholder}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            />
          </label>
          <button type="submit" className="btn btn-ghost btn-large" disabled={code.length !== CODE_LENGTH}>
            {t.joinRoom}
          </button>
        </form>
      </div>
    </main>
  );
}
