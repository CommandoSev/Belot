import { describe, expect, it } from "vitest";
import { cardFromId } from "../cards";
import { DEFAULT_CONFIG, type EngineConfig } from "../config";
import { dealHands, seededRng } from "../deal";
import {
  beats,
  cardPointsOf,
  createTrickState,
  currentWinner,
  isDealOver,
  legalCards,
  playCard,
  trickWinner,
  turnOf,
  type Trick,
  type TrickState,
} from "../tricks";
import { teamOf, type Card, type CardId, type Contract, type Seat } from "../types";

const c = (id: CardId): Card => cardFromId(id);
const cards = (...ids: CardId[]): Card[] => ids.map(c);
const ids = (list: readonly Card[]): CardId[] => list.map((card) => card.id);

/** Builds a partial trick from a leader and the cards played so far, in seat order. */
function trick(leader: Seat, ...played: CardId[]): Trick {
  return {
    leader,
    plays: played.map((id, i) => ({ seat: ((leader + i) % 4) as Seat, card: c(id) })),
  };
}

const exempt: EngineConfig = { ...DEFAULT_CONFIG, partnerExemptOnTrumpLead: true };

describe("beats", () => {
  it("a trump beats any plain card in a suit contract", () => {
    expect(beats(c("7S"), c("AH"), "spades", "H")).toBe(true);
    expect(beats(c("AH"), c("7S"), "spades", "H")).toBe(false);
  });

  it("two trumps compare by trump order", () => {
    expect(beats(c("9S"), c("AS"), "spades", "S")).toBe(true);
    expect(beats(c("AS"), c("9S"), "spades", "S")).toBe(false);
    expect(beats(c("JS"), c("9S"), "spades", "H")).toBe(true);
  });

  it("plain cards compare by plain order only within the led suit", () => {
    expect(beats(c("10H"), c("KH"), "spades", "H")).toBe(true);
    expect(beats(c("JH"), c("QH"), "spades", "H")).toBe(false);
    expect(beats(c("AD"), c("7H"), "spades", "H")).toBe(false);
  });

  it("in alltrumps the highest card of the led suit wins and no suit trumps another", () => {
    expect(beats(c("JH"), c("9H"), "alltrumps", "H")).toBe(true);
    expect(beats(c("AH"), c("9H"), "alltrumps", "H")).toBe(false);
    expect(beats(c("JS"), c("7H"), "alltrumps", "H")).toBe(false);
  });

  it("in notrumps the highest card of the led suit wins by plain order", () => {
    expect(beats(c("AH"), c("JH"), "notrumps", "H")).toBe(true);
    expect(beats(c("9H"), c("JH"), "notrumps", "H")).toBe(false);
    expect(beats(c("AS"), c("7H"), "notrumps", "H")).toBe(false);
  });
});

describe("trickWinner and currentWinner", () => {
  it("highest trump beats any plain card", () => {
    expect(trickWinner(trick(0, "AH", "7S", "KH", "10H"), "spades")).toBe(1);
    expect(trickWinner(trick(0, "AH", "7S", "9S", "10H"), "spades")).toBe(2);
  });

  it("among plain cards the highest of the led suit wins", () => {
    expect(trickWinner(trick(1, "KH", "AD", "10H", "AH"), "spades")).toBe(0);
    expect(trickWinner(trick(1, "KH", "AD", "10H", "7C"), "spades")).toBe(3);
  });

  it("in notrumps the highest of the led suit wins", () => {
    expect(trickWinner(trick(2, "9H", "JH", "AD", "10H"), "notrumps")).toBe(1);
  });

  it("in alltrumps the highest of the led suit wins by trump order", () => {
    expect(trickWinner(trick(3, "AH", "9H", "JS", "KH"), "alltrumps")).toBe(0);
  });

  it("currentWinner tracks the partial trick and is null when empty", () => {
    expect(currentWinner(trick(0), "hearts")).toBeNull();
    expect(currentWinner(trick(0, "KH"), "spades")?.seat).toBe(0);
    expect(currentWinner(trick(0, "KH", "AH"), "spades")?.seat).toBe(1);
    expect(currentWinner(trick(0, "KH", "AH", "7S"), "spades")?.seat).toBe(2);
  });

  it("trickWinner throws on an incomplete trick", () => {
    expect(() => trickWinner(trick(0, "KH"), "spades")).toThrow();
  });
});

describe("turnOf", () => {
  it("advances counter-clockwise from the leader by the number of plays", () => {
    expect(turnOf(trick(3))).toBe(3);
    expect(turnOf(trick(3, "AH"))).toBe(0);
    expect(turnOf(trick(3, "AH", "KH", "7H"))).toBe(2);
  });
});

describe("legalCards - common", () => {
  it("the leader may play anything", () => {
    const hand = cards("7C", "AH", "JS");
    expect(legalCards(hand, trick(2), "spades", 2)).toEqual(hand);
  });

  it("must follow suit if able", () => {
    const hand = cards("7H", "AS", "JD", "KH");
    expect(ids(legalCards(hand, trick(0, "9H"), "clubs", 1))).toEqual(["7H", "KH"]);
  });
});

describe("legalCards - suit contract, void in led suit", () => {
  it("opponent winning, holding a trump: only trumps are legal", () => {
    const hand = cards("7S", "AD", "KS", "9C");
    expect(ids(legalCards(hand, trick(0, "AH"), "spades", 1))).toEqual(["7S", "KS"]);
  });

  it("AE6: partner winning, holding trumps: every card is legal", () => {
    const hand = cards("7S", "AD", "KS", "9C");
    expect(legalCards(hand, trick(0, "AH", "7D"), "spades", 2)).toEqual(hand);
  });

  it("partner led and still wins after an opponent followed low: every card is legal", () => {
    const hand = cards("7S", "AD");
    expect(legalCards(hand, trick(1, "AH", "KH"), "spades", 3)).toEqual(hand);
  });

  it("opponent already trumped, holding a higher trump: only higher trumps are legal", () => {
    const hand = cards("JS", "7S", "AD", "AC");
    expect(ids(legalCards(hand, trick(0, "AH", "KS"), "spades", 2))).toEqual(["JS"]);
  });

  it("opponent already trumped, holding only lower trumps: any card is legal", () => {
    const hand = cards("8S", "7S", "AD", "AC");
    expect(legalCards(hand, trick(0, "AH", "KS"), "spades", 2)).toEqual(hand);
  });

  it("partner trumped and an opponent overtrumped: must overtrump if able", () => {
    const hand = cards("JS", "AD");
    expect(ids(legalCards(hand, trick(0, "AH", "KS", "9S"), "spades", 3))).toEqual(["JS"]);
  });

  it("no trump at all: any card is legal", () => {
    const hand = cards("AD", "AC", "7D");
    expect(legalCards(hand, trick(0, "AH"), "spades", 1)).toEqual(hand);
  });
});

describe("legalCards - suit contract, trump led", () => {
  it("must play a higher trump than the current best if able", () => {
    const hand = cards("JS", "7S", "AH");
    expect(ids(legalCards(hand, trick(0, "9S"), "spades", 1))).toEqual(["JS"]);
  });

  it("holding only lower trumps: any trump is legal, never a plain card", () => {
    const hand = cards("8S", "7S", "AH");
    expect(ids(legalCards(hand, trick(0, "9S"), "spades", 1))).toEqual(["8S", "7S"]);
  });

  it("must overtrump even when the partner led and is winning", () => {
    const hand = cards("JS", "7S", "AH");
    expect(ids(legalCards(hand, trick(0, "9S", "7S"), "spades", 2))).toEqual(["JS"]);
  });

  it("must beat the current best, not just the lead", () => {
    const hand = cards("JS", "AS", "QS");
    expect(ids(legalCards(hand, trick(0, "8S", "9S"), "spades", 2))).toEqual(["JS"]);
  });

  it("with partnerExemptOnTrumpLead any trump is legal while the partner wins", () => {
    const hand = cards("JS", "7S", "AH");
    expect(ids(legalCards(hand, trick(0, "9S", "8S"), "spades", 2, exempt))).toEqual(["JS", "7S"]);
  });

  it("with partnerExemptOnTrumpLead the obligation still applies against an opponent", () => {
    const hand = cards("JS", "7S", "AH");
    expect(ids(legalCards(hand, trick(0, "9S"), "spades", 1, exempt))).toEqual(["JS"]);
    expect(ids(legalCards(hand, trick(0, "8S", "9S"), "spades", 2, exempt))).toEqual(["JS"]);
  });
});

describe("legalCards - alltrumps", () => {
  it("AE7: partner leads 9H and wins; holding J and 7 of hearts only the J is legal", () => {
    const hand = cards("JH", "7H");
    expect(ids(legalCards(hand, trick(0, "9H", "8H"), "alltrumps", 2))).toEqual(["JH"]);
  });

  it("must beat the current best even when an opponent holds it", () => {
    const hand = cards("JH", "7H", "AS");
    expect(ids(legalCards(hand, trick(0, "9H"), "alltrumps", 1))).toEqual(["JH"]);
  });

  it("no beating card held: any card of the led suit is legal", () => {
    const hand = cards("AH", "7H", "JS");
    expect(ids(legalCards(hand, trick(0, "9H"), "alltrumps", 1))).toEqual(["AH", "7H"]);
  });

  it("void in the led suit: any card is legal, even when an opponent wins", () => {
    const hand = cards("JS", "7C", "AD");
    expect(legalCards(hand, trick(0, "9H"), "alltrumps", 1)).toEqual(hand);
  });
});

describe("legalCards - notrumps", () => {
  it("led suit held: any card of that suit is legal", () => {
    const hand = cards("7H", "AH", "JS");
    expect(ids(legalCards(hand, trick(0, "10H"), "notrumps", 1))).toEqual(["7H", "AH"]);
  });

  it("void: any card is legal", () => {
    const hand = cards("7C", "AD", "JS");
    expect(legalCards(hand, trick(0, "10H"), "notrumps", 1)).toEqual(hand);
  });
});

describe("cardPointsOf", () => {
  it("uses trump values in the trump suit and plain values elsewhere", () => {
    expect(cardPointsOf(cards("JS", "9S", "AH", "JH"), "spades")).toBe(20 + 14 + 11 + 2);
  });

  it("uses trump values everywhere in alltrumps and doubled plain values in notrumps", () => {
    expect(cardPointsOf(cards("JS", "JH"), "alltrumps")).toBe(40);
    expect(cardPointsOf(cards("AS", "JH"), "notrumps")).toBe(26);
  });
});

describe("playCard", () => {
  const play = (state: TrickState, seat: Seat, id: CardId, contract: Contract = "spades"): TrickState =>
    playCard(state, seat, c(id), contract);

  /** Plays out a full deal, always choosing the first legal card, and returns the final state. */
  function scriptedDeal(contract: Contract, seed: number, dealer: Seat): TrickState {
    const hands = dealHands(seededRng(seed), dealer);
    let state = createTrickState(((dealer + 1) % 4) as Seat);
    for (let n = 0; n < 32; n++) {
      const seat = turnOf(state.current);
      const hand = hands[seat]!;
      const card = legalCards(hand, state.current, contract, seat)[0]!;
      state = playCard(state, seat, card, contract, DEFAULT_CONFIG, hand);
      hands[seat] = hand.filter((h) => h.id !== card.id);
    }
    expect(hands.every((h) => h.length === 0)).toBe(true);
    return state;
  }

  it("starts with an empty trick led by the given seat", () => {
    const state = createTrickState(1);
    expect(state.current).toEqual({ leader: 1, plays: [] });
    expect(state.completed).toEqual([]);
    expect(state.wonCards).toEqual([[], []]);
    expect(state.lastTrickWinner).toBeNull();
    expect(isDealOver(state)).toBe(false);
  });

  it("throws when it is not the seat's turn", () => {
    expect(() => play(createTrickState(1), 0, "AH")).toThrow(/turn/);
  });

  it("throws when the card is not legal for the given hand", () => {
    const state = play(createTrickState(0), 0, "AH");
    expect(() => playCard(state, 1, c("JS"), "spades", DEFAULT_CONFIG, cards("7H", "JS"))).toThrow(/legal/);
  });

  it("throws when the card is not in the given hand", () => {
    const state = createTrickState(0);
    expect(() => playCard(state, 0, c("AH"), "spades", DEFAULT_CONFIG, cards("7H", "JS"))).toThrow(/legal/);
  });

  it("appends plays and does not mutate the previous state", () => {
    const start = createTrickState(0);
    const next = play(start, 0, "AH");
    expect(start.current.plays).toEqual([]);
    expect(next.current.plays).toEqual([{ seat: 0, card: c("AH") }]);
    expect(turnOf(next.current)).toBe(1);
  });

  it("fourth card resolves the trick, the winner leads next and the won cards go to the winner's side", () => {
    let state = createTrickState(0);
    state = play(state, 0, "AH");
    state = play(state, 1, "7S");
    state = play(state, 2, "KH");
    state = play(state, 3, "10H");
    expect(state.completed).toHaveLength(1);
    expect(state.completed[0]!.winner).toBe(1);
    expect(ids(state.completed[0]!.plays.map((p) => p.card))).toEqual(["AH", "7S", "KH", "10H"]);
    expect(ids(state.wonCards[1])).toEqual(["AH", "7S", "KH", "10H"]);
    expect(state.wonCards[0]).toEqual([]);
    expect(state.current).toEqual({ leader: 1, plays: [] });
    expect(state.lastTrickWinner).toBeNull();
    expect(isDealOver(state)).toBe(false);
  });

  it("a scripted 32-card deal assigns every card to exactly one side and sets lastTrickWinner", () => {
    const state = scriptedDeal("hearts", 11, 0);
    expect(isDealOver(state)).toBe(true);
    expect(state.completed).toHaveLength(8);
    expect(state.lastTrickWinner).toBe(state.completed[7]!.winner);
    expect(state.current).toEqual({ leader: state.lastTrickWinner, plays: [] });
    const all = [...state.wonCards[0], ...state.wonCards[1]];
    expect(all).toHaveLength(32);
    expect(new Set(all.map((card) => card.id)).size).toBe(32);
    for (const done of state.completed) {
      const side = state.wonCards[teamOf(done.winner)];
      for (const p of done.plays) expect(side).toContain(p.card);
    }
    expect(cardPointsOf(all, "hearts")).toBe(152);
  });

  it("scripted deals total 248 points in alltrumps and 240 in notrumps", () => {
    const alltrumps = scriptedDeal("alltrumps", 3, 1);
    const notrumps = scriptedDeal("notrumps", 5, 2);
    expect(cardPointsOf([...alltrumps.wonCards[0], ...alltrumps.wonCards[1]], "alltrumps")).toBe(248);
    expect(cardPointsOf([...notrumps.wonCards[0], ...notrumps.wonCards[1]], "notrumps")).toBe(240);
  });

  it("refuses further plays once the deal is over", () => {
    const state = scriptedDeal("notrumps", 5, 2);
    expect(() => play(state, state.current.leader, "AH", "notrumps")).toThrow(/over/);
  });
});
