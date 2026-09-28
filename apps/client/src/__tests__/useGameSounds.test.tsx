import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomView } from "@belot/shared";
import { useGameSounds } from "../useGameSounds";
import { playingView } from "./fixtures";

vi.mock("../sound", () => ({ playSound: vi.fn() }));

import { playSound } from "../sound";

const playSoundMock = vi.mocked(playSound);

function renderSounds(initial: RoomView) {
  return renderHook(({ view }: { view: RoomView }) => useGameSounds(view, view.mySeat), { initialProps: { view: initial } });
}

beforeEach(() => playSoundMock.mockClear());

describe("useGameSounds", () => {
  it("chimes when the turn arrives and stays quiet otherwise", () => {
    const { rerender } = renderSounds(playingView({ turn: 2, legalCards: [] }));
    expect(playSoundMock).not.toHaveBeenCalled();

    rerender({ view: playingView({ turn: 3, legalCards: [] }) });
    expect(playSoundMock).not.toHaveBeenCalled();

    rerender({ view: playingView({ turn: 1 }) });
    expect(playSoundMock).toHaveBeenCalledWith("turn");
    expect(playSoundMock).toHaveBeenCalledTimes(1);

    playSoundMock.mockClear();
    rerender({ view: playingView({ turn: 1 }) });
    expect(playSoundMock).not.toHaveBeenCalled();
  });

  it("plays card, trick, belot, deal and win cues on the matching view changes", () => {
    const { rerender } = renderSounds(playingView({ turn: 2, legalCards: [] }));
    rerender({ view: playingView({ turn: 3, legalCards: [], trick: { leader: 2, plays: [{ seat: 2, card: "AC" }] } }) });
    expect(playSoundMock).toHaveBeenLastCalledWith("card");

    rerender({
      view: playingView({
        turn: 3,
        legalCards: [],
        trick: { leader: 3, plays: [] },
        lastTrick: {
          winner: 3,
          plays: [
            { seat: 2, card: "AC" },
            { seat: 3, card: "KC" },
            { seat: 0, card: "7C" },
            { seat: 1, card: "8C" },
          ],
        },
      }),
    });
    expect(playSoundMock).toHaveBeenLastCalledWith("trick");

    rerender({ view: playingView({ turn: 3, legalCards: [], belots: [{ seat: 0, suit: "H" }] }) });
    expect(playSoundMock).toHaveBeenLastCalledWith("belot");

    rerender({ view: playingView({ turn: 3, legalCards: [], dealNumber: 2 }) });
    expect(playSoundMock).toHaveBeenLastCalledWith("deal");

    rerender({ view: playingView({ turn: null, legalCards: [], dealNumber: 2, phase: "finished", winner: 1 }) });
    expect(playSoundMock).toHaveBeenLastCalledWith("win");
  });
});
