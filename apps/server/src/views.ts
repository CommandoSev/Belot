// Per-seat redaction of the game state. Everything a client sees comes through here, so this is the
// only place that decides which cards leave the server.
import {
  SUITS,
  belotAvailable,
  cardOrder,
  legalBids,
  legalCards,
  strengthFor,
  teamOf,
  turnOf,
  type Card,
  type CardId,
  type Contract,
  type DeclarationView,
  type DealSummaryView,
  type GameView,
  type Seat,
  type TrickPlayView,
} from "@belot/shared";
import type { GameState } from "./game";
import type { SeatState } from "./rooms";

export const BIDDING_HAND_SIZE = 5;

/** The first missing or disconnected seat, with how long it has been gone. */
export function pausedFor(
  seats: readonly (SeatState | null)[],
  now: number,
): { seat: Seat; forSec: number } | null {
  for (let i = 0; i < 4; i++) {
    const seat = seats[i];
    if (!seat) return { seat: i as Seat, forSec: 0 };
    if (!seat.connected) {
      return { seat: i as Seat, forSec: Math.max(0, Math.floor((now - (seat.disconnectedAt ?? now)) / 1000)) };
    }
  }
  return null;
}

/** Suits together, strongest card first within a suit; plain order before a contract is known. */
export function sortForDisplay(cards: readonly Card[], contract: Contract | null): Card[] {
  const strength = (card: Card) => (contract ? strengthFor(contract, card.suit) : "plain");
  return [...cards].sort(
    (a, b) =>
      SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) ||
      cardOrder(b.rank, strength(b)) - cardOrder(a.rank, strength(a)),
  );
}

const ids = (cards: readonly Card[]): CardId[] => cards.map((c) => c.id);
const playViews = (plays: readonly { seat: Seat; card: Card }[]): TrickPlayView[] =>
  plays.map((p) => ({ seat: p.seat, card: p.card.id }));

export function buildGameView(state: GameState, seat: Seat | null, now: number): GameView {
  if (state.phase === "waiting") throw new Error("No game view while waiting for a seat");
  const { phase, match, bidding, contract, tricks } = state;
  const paused = pausedFor(state.seats, now);
  const bidPhase = phase === "bidding";
  const playPhase = phase === "playing";
  const firstTrickDone = (tricks?.completed.length ?? 0) >= 1;

  const fullHand = seat === null ? [] : state.hands[seat]!;
  const visibleHand = bidPhase ? fullHand.slice(0, BIDDING_HAND_SIZE) : fullHand;
  const handCounts = state.hands.map((h) => (bidPhase ? Math.min(h.length, BIDDING_HAND_SIZE) : h.length)) as [
    number,
    number,
    number,
    number,
  ];

  let turn: Seat | null = null;
  if (!paused) {
    if (bidPhase) turn = bidding.turn;
    else if (playPhase && tricks) turn = turnOf(tricks.current);
  }
  const myTurn = seat !== null && turn === seat;

  const declarationsOffered: DeclarationView[] =
    seat !== null && playPhase && !firstTrickDone && !state.hasDeclared[seat]
      ? state.offered[seat]!.map((d) => ({ seat, kind: d.kind, points: d.points, cards: ids(d.cards) }))
      : [];

  const declared: DeclarationView[] = state.declared.map(({ seat: owner, declaration }) => {
    const view: DeclarationView = { seat: owner, kind: declaration.kind, points: declaration.points };
    if (owner === seat || firstTrickDone) view.cards = ids(declaration.cards);
    return view;
  });

  const belotCards =
    seat !== null && playPhase && contract
      ? ids(fullHand.filter((card) => belotAvailable(fullHand, card, contract.contract)))
      : [];

  const dealSummary: DealSummaryView | null =
    state.dealScore && contract && (phase === "dealEnd" || phase === "finished")
      ? { contract, ...state.dealScore }
      : null;

  return {
    phase,
    dealNumber: state.dealNumber,
    dealer: bidding.dealer,
    turn,
    paused,
    myTeam: seat === null ? null : teamOf(seat),
    hand: ids(sortForDisplay(visibleHand, contract?.contract ?? null)),
    handCounts,
    bidding: {
      history: bidding.history.map((h) => ({ seat: h.seat, action: h.action })),
      contract: bidding.contract,
      bidder: bidding.bidder,
      multiplier: bidding.multiplier,
    },
    contract,
    legalBids: myTurn && bidPhase ? legalBids(bidding, seat) : [],
    legalCards:
      myTurn && playPhase && tricks && contract
        ? ids(legalCards(fullHand, tricks.current, contract.contract, seat, state.config))
        : [],
    trick: tricks ? { leader: tricks.current.leader, plays: playViews(tricks.current.plays) } : null,
    lastTrick: tricks?.completed.length
      ? { winner: tricks.completed.at(-1)!.winner, plays: playViews(tricks.completed.at(-1)!.plays) }
      : null,
    trickNumber: tricks ? Math.min(tricks.completed.length + 1, 8) : 0,
    declarationsOffered,
    belotCards,
    declared,
    belots: state.belots.map((b) => ({ seat: b.seat, suit: b.suit })),
    scores: [match.scores[0], match.scores[1]],
    hanging: match.hanging,
    gamesWon: [state.gamesWon[0], state.gamesWon[1]],
    dealSummary,
    dealEndsInSec:
      phase === "dealEnd" && state.dealEndsAt !== null ? Math.max(0, Math.ceil((state.dealEndsAt - now) / 1000)) : null,
    winner: match.winner,
  };
}
