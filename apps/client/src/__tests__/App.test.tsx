import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { Connection } from "../socket";
import { biddingView, playingView, waitingView } from "./fixtures";

vi.mock("../socket", () => ({ useConnection: vi.fn() }));

import { useConnection } from "../socket";

const useConnectionMock = vi.mocked(useConnection);

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    status: "connected",
    view: null,
    lastError: null,
    name: "Иван",
    send: vi.fn(),
    setName: vi.fn(),
    ...overrides,
  };
}

function renderApp(conn: Connection) {
  useConnectionMock.mockReturnValue(conn);
  return render(<App />);
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("connecting and lobby", () => {
  it("shows the connecting state before the socket connects", () => {
    renderApp(connection({ status: "connecting" }));
    expect(screen.getByText("Свързване...")).toBeInTheDocument();
    expect(screen.queryByText("Нова стая")).not.toBeInTheDocument();
  });

  it("hints that the server is waking up after ten seconds", () => {
    vi.useFakeTimers();
    renderApp(connection({ status: "connecting" }));
    expect(screen.queryByText(/събужда/)).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText(/събужда/)).toBeInTheDocument();
  });

  it("shows the lobby with Bulgarian labels once connected with no room", () => {
    renderApp(connection());
    expect(screen.getByText("Вашето име")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Нова стая" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Влез в стая" })).toBeInTheDocument();
    expect(screen.getByText("Код на стаята")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[A-Za-z]{3,}/);
  });

  it("shows the lobby when no name is known yet, even before connecting", () => {
    renderApp(connection({ status: "connecting", name: "" }));
    expect(screen.getByText("Вашето име")).toBeInTheDocument();
  });

  it("pre-fills the join code from /r/ABCD", () => {
    window.history.replaceState(null, "", "/r/abcd");
    renderApp(connection());
    expect(screen.getByPlaceholderText("ABCD")).toHaveValue("ABCD");
  });

  it("pre-fills the join code from ?room=", () => {
    window.history.replaceState(null, "", "/?room=WXYZ");
    renderApp(connection());
    expect(screen.getByPlaceholderText("ABCD")).toHaveValue("WXYZ");
  });

  it("creates a room with the entered name", () => {
    const conn = connection({ name: "" });
    renderApp(conn);
    fireEvent.change(screen.getByPlaceholderText("Например Иван"), { target: { value: "  Мария " } });
    fireEvent.click(screen.getByRole("button", { name: "Нова стая" }));
    expect(conn.setName).toHaveBeenCalledWith("Мария");
    expect(conn.send).toHaveBeenCalledWith({ type: "createRoom" });
  });

  it("requires a name before creating", () => {
    const conn = connection({ name: "" });
    renderApp(conn);
    fireEvent.click(screen.getByRole("button", { name: "Нова стая" }));
    expect(screen.getByText("Въведете име")).toBeInTheDocument();
    expect(conn.send).not.toHaveBeenCalled();
  });

  it("joins with an upper-cased four-letter code", () => {
    const conn = connection();
    renderApp(conn);
    const codeInput = screen.getByPlaceholderText("ABCD");
    fireEvent.change(codeInput, { target: { value: "qr1s-t" } });
    expect(codeInput).toHaveValue("QRST");
    fireEvent.click(screen.getByRole("button", { name: "Влез в стая" }));
    expect(conn.send).toHaveBeenCalledWith({ type: "joinRoom", code: "QRST" });
  });

  it("writes the room code into the URL once a view arrives and clears it when left", () => {
    const conn = connection({ view: waitingView() });
    const { rerender } = renderApp(conn);
    expect(window.location.pathname).toBe("/r/ABCD");
    useConnectionMock.mockReturnValue(connection({ view: null }));
    rerender(<App />);
    expect(window.location.pathname).toBe("/");
    expect(screen.getByText("Вашето име")).toBeInTheDocument();
  });
});

describe("waiting table", () => {
  it("shows four seats with Седни buttons on empty seats and the player at the bottom", () => {
    renderApp(connection({ view: waitingView() }));
    expect(screen.getByTestId("room-code")).toHaveTextContent("ABCD");
    expect(screen.getAllByRole("button", { name: "Седни" })).toHaveLength(2);
    const bottom = screen.getByTestId("seat-bottom");
    expect(bottom).toHaveTextContent("Мария");
    expect(bottom).toHaveTextContent("Вие");
    expect(bottom).toHaveTextContent("Юг");
    expect(screen.getByTestId("seat-top")).toHaveTextContent("Свободно");
    expect(screen.getByTestId("seat-left")).toHaveTextContent("Иван");
    expect(screen.getByText("Чакаме играчи")).toBeInTheDocument();
    expect(screen.getByText("2 свободни места")).toBeInTheDocument();
  });

  it("sends sit for the chosen seat and stand for the own seat", () => {
    const conn = connection({ view: waitingView() });
    renderApp(conn);
    fireEvent.click(within(screen.getByTestId("seat-top")).getByRole("button", { name: "Седни" }));
    expect(conn.send).toHaveBeenCalledWith({ type: "sit", seat: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Стани" }));
    expect(conn.send).toHaveBeenCalledWith({ type: "stand" });
  });

  it("puts seat 0 at the bottom for an unseated viewer", () => {
    const conn = connection({ view: waitingView({ mySeat: null, seats: [null, null, null, null] }) });
    renderApp(conn);
    expect(screen.getAllByRole("button", { name: "Седни" })).toHaveLength(4);
    fireEvent.click(within(screen.getByTestId("seat-bottom")).getByRole("button", { name: "Седни" }));
    expect(conn.send).toHaveBeenCalledWith({ type: "sit", seat: 0 });
  });

  it("copies the share link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderApp(connection({ view: waitingView() }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Сподели линка" }));
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/r/ABCD`);
    expect(screen.getByRole("button", { name: "Копирано" })).toBeInTheDocument();
  });
});

describe("bidding", () => {
  it("enables only the legal bids on the player's turn", () => {
    const conn = connection({ view: biddingView() });
    renderApp(conn);
    const enabled = ["Пас", "Купа ♥", "Пика ♠", "Без коз", "Всичко коз"];
    const disabled = ["Спатия ♣", "Каро ♦", "Контра", "Реконтра"];
    for (const name of enabled) expect(screen.getByRole("button", { name })).toBeEnabled();
    for (const name of disabled) expect(screen.getByRole("button", { name })).toBeDisabled();
    expect(screen.getAllByText("Вие сте на ход").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Купа ♥" }));
    expect(conn.send).toHaveBeenCalledWith({ type: "bid", action: { type: "bid", contract: "hearts" } });
    fireEvent.click(screen.getByRole("button", { name: "Пас" }));
    expect(conn.send).toHaveBeenCalledWith({ type: "bid", action: { type: "pass" } });
  });

  it("disables every bid when it is not the player's turn and shows the history", () => {
    renderApp(connection({ view: biddingView({ turn: 2, legalBids: [] }) }));
    for (const button of within(screen.getByTestId("bidding-panel")).getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText(/Мария:/)).toHaveTextContent("Мария: Спатия ♣");
    expect(screen.getByText(/На ход е Петър/)).toBeInTheDocument();
  });
});

describe("playing", () => {
  it("lets only legal cards be selected and plays on the second tap", () => {
    const conn = connection({ view: playingView() });
    renderApp(conn);
    expect(screen.getByRole("button", { name: "A♥" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "7♣" })).toBeDisabled();
    const jack = screen.getByRole("button", { name: "J♠" });
    expect(jack).toBeEnabled();

    fireEvent.click(jack);
    expect(jack).toHaveAttribute("aria-pressed", "true");
    expect(conn.send).not.toHaveBeenCalled();

    fireEvent.click(jack);
    expect(conn.send).toHaveBeenCalledWith({ type: "play", card: "JS", declare: false, belot: false });
  });

  it("moves the selection when another legal card is tapped", () => {
    const conn = connection({ view: playingView() });
    renderApp(conn);
    fireEvent.click(screen.getByRole("button", { name: "J♠" }));
    fireEvent.click(screen.getByRole("button", { name: "9♠" }));
    expect(screen.getByRole("button", { name: "J♠" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "9♠" })).toHaveAttribute("aria-pressed", "true");
    expect(conn.send).not.toHaveBeenCalled();
  });

  it("shows the Белот toggle only for a qualifying card and sends its value", () => {
    const conn = connection({
      view: playingView({ legalCards: ["KD", "QD", "JS"], belotCards: ["KD", "QD"] }),
    });
    renderApp(conn);
    fireEvent.click(screen.getByRole("button", { name: "J♠" }));
    expect(screen.queryByLabelText("Белот")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "K♦" }));
    const toggle = screen.getByLabelText("Белот");
    expect(toggle).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "K♦" }));
    expect(conn.send).toHaveBeenLastCalledWith({ type: "play", card: "KD", declare: false, belot: true });

    fireEvent.click(screen.getByRole("button", { name: "Q♦" }));
    fireEvent.click(screen.getByLabelText("Белот"));
    fireEvent.click(screen.getByRole("button", { name: "Q♦" }));
    expect(conn.send).toHaveBeenLastCalledWith({ type: "play", card: "QD", declare: false, belot: false });
  });

  it("offers the Анонс toggle on trick one when declarations are offered", () => {
    const conn = connection({
      view: playingView({
        declarationsOffered: [{ seat: 1, kind: "sequence", points: 20, cards: ["7C", "8C", "9C"] }],
      }),
    });
    renderApp(conn);
    fireEvent.click(screen.getByRole("button", { name: "J♠" }));
    expect(screen.getByLabelText(/Анонс/)).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "J♠" }));
    expect(conn.send).toHaveBeenCalledWith({ type: "play", card: "JS", declare: true, belot: false });
  });

  it("hides the Анонс toggle after trick one", () => {
    renderApp(
      connection({
        view: playingView({
          trickNumber: 2,
          declarationsOffered: [{ seat: 1, kind: "sequence", points: 20, cards: ["7C", "8C", "9C"] }],
        }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "J♠" }));
    expect(screen.queryByLabelText(/Анонс/)).not.toBeInTheDocument();
  });

  it("shows the current trick, the score and the contract", () => {
    renderApp(
      connection({
        view: playingView({
          turn: 2,
          legalCards: [],
          trick: { leader: 0, plays: [{ seat: 0, card: "AC" }, { seat: 1, card: "KC" }] },
          scores: [12, 30],
          hanging: 8,
          contract: { contract: "hearts", bidder: 1, multiplier: 2 },
        }),
      }),
    );
    const trick = screen.getByTestId("trick-area");
    expect(trick.querySelector('[data-card="AC"]')).toBeInTheDocument();
    expect(trick.querySelector('[data-card="KC"]')).toBeInTheDocument();
    const score = screen.getByTestId("score-panel");
    expect(score).toHaveTextContent("Ние");
    expect(score).toHaveTextContent("30");
    expect(score).toHaveTextContent("Те");
    expect(score).toHaveTextContent("12");
    expect(score).toHaveTextContent("Висящи: 8");
    expect(score).toHaveTextContent("Купа ♥");
    expect(score).toHaveTextContent("Контра");
    expect(score).toHaveTextContent("Обявил: Мария");
    expect(screen.getByText(/На ход е Петър/)).toBeInTheDocument();
  });

  it("lists revealed declarations and belots after trick one", () => {
    renderApp(
      connection({
        view: playingView({
          trickNumber: 2,
          declared: [{ seat: 0, kind: "sequence", points: 50, cards: ["10S", "JS", "QS", "KS"] }],
          belots: [{ seat: 2, suit: "H" }],
        }),
      }),
    );
    expect(screen.getByText(/Иван: Кварта 50/)).toBeInTheDocument();
    expect(screen.getByText(/Петър: Белот ♥/)).toBeInTheDocument();
  });
});

describe("deal end and match end", () => {
  it("shows the deal summary with both teams and a countdown", () => {
    renderApp(
      connection({
        view: playingView(
          {
            phase: "dealEnd",
            turn: null,
            legalCards: [],
            dealEndsInSec: 7,
            dealSummary: {
              contract: { contract: "spades", bidder: 1, multiplier: 1 },
              teams: [
                { cardPoints: 62, lastTrick: 0, declarations: 0, belots: 0, valat: 0, raw: 62, rounded: 6, awarded: 6 },
                { cardPoints: 90, lastTrick: 10, declarations: 20, belots: 0, valat: 0, raw: 120, rounded: 12, awarded: 12 },
              ],
              result: "won",
              valatBy: null,
              hangingBefore: 0,
              hangingAfter: 0,
            },
          },
          { phase: "dealEnd" },
        ),
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Край на раздаването" });
    expect(dialog).toHaveTextContent("Пика ♠");
    expect(dialog).toHaveTextContent("Обявяващите печелят");
    for (const label of ["Карти", "Последна ръка", "Анонси", "Белот", "Валат", "Общо", "Закръглено", "Получени"]) {
      expect(dialog).toHaveTextContent(label);
    }
    expect(dialog).toHaveTextContent("Следващо раздаване след 7 секунди");
  });

  it("shows the winner on a finished view and Нова игра sends newGame", () => {
    const conn = connection({
      view: playingView({ phase: "finished", turn: null, legalCards: [], scores: [120, 155], winner: 1 }, { phase: "finished" }),
    });
    renderApp(conn);
    const dialog = screen.getByRole("dialog", { name: "Край на играта" });
    expect(dialog).toHaveTextContent("Печели: Ние");
    expect(dialog).toHaveTextContent("155");
    fireEvent.click(screen.getByRole("button", { name: "Нова игра" }));
    expect(conn.send).toHaveBeenCalledWith({ type: "newGame" });
  });
});

describe("pause, disconnect and errors", () => {
  it("names the missing player and offers release after 60 seconds", () => {
    vi.useFakeTimers();
    const conn = connection({
      view: playingView(
        { paused: { seat: 3, forSec: 5 }, turn: null, legalCards: [] },
        { seats: [{ name: "Иван", connected: true, disconnectedForSec: null }, { name: "Мария", connected: true, disconnectedForSec: null }, { name: "Петър", connected: true, disconnectedForSec: null }, { name: "Елена", connected: false, disconnectedForSec: 5 }] },
      ),
    });
    renderApp(conn);
    expect(screen.getByText("Чакаме Елена (Север) да се върне")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Освободи мястото" })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(55_000));
    const release = screen.getByRole("button", { name: "Освободи мястото" });
    fireEvent.click(release);
    expect(conn.send).toHaveBeenCalledWith({ type: "releaseSeat", seat: 3 });
  });

  it("offers release at once when the server already reports 60 seconds", () => {
    renderApp(connection({ view: playingView({ paused: { seat: 0, forSec: 61 }, turn: null, legalCards: [] }) }));
    expect(screen.getByRole("button", { name: "Освободи мястото" })).toBeInTheDocument();
  });

  it("shows the banner on disconnect while the last view stays on screen", () => {
    renderApp(connection({ status: "disconnected", view: playingView() }));
    expect(screen.getByRole("alert")).toHaveTextContent("Връзката е прекъсната, свързване отново...");
    expect(screen.getByTestId("room-code")).toHaveTextContent("ABCD");
    expect(screen.getByRole("button", { name: "J♠" })).toBeInTheDocument();
  });

  it("renders a server error as a toast that hides after four seconds", () => {
    vi.useFakeTimers();
    renderApp(connection({ lastError: { code: "seatTaken", message: "Мястото е заето", at: 1 } }));
    expect(screen.getByRole("alert")).toHaveTextContent("Мястото е заето");
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("hand order", () => {
  it("sorts trumps first and by contract strength", () => {
    const view = playingView({ hand: ["7H", "JH", "AS", "10S", "9H", "KC"], legalCards: [] });
    renderApp(connection({ view }));
    const labels = within(screen.getByRole("group")).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["J♥", "9♥", "7♥", "A♠", "10♠", "K♣"]);
  });

  it("keeps the last trick visible briefly when a new trick starts", () => {
    vi.useFakeTimers();
    const view = playingView({
      trick: { leader: 2, plays: [] },
      lastTrick: { winner: 2, plays: [{ seat: 0, card: "AC" }, { seat: 1, card: "KC" }, { seat: 2, card: "7H" }, { seat: 3, card: "9C" }] },
    });
    renderApp(connection({ view }));
    expect(screen.getByTestId("trick-area").querySelectorAll("[data-card]")).toHaveLength(4);
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByTestId("trick-area").querySelectorAll("[data-card]")).toHaveLength(0);
  });
});
