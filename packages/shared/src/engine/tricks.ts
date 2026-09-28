import { cardOrder, cardPoints, strengthFor } from "./cards";
import { DEFAULT_CONFIG, type EngineConfig } from "./config";
import { nextSeat, teamOf, trumpSuitOf, type Card, type Contract, type Seat, type Suit } from "./types";

export interface TrickPlay {
  seat: Seat;
  card: Card;
}

export interface Trick {
  leader: Seat;
  plays: TrickPlay[];
}

export interface CompletedTrick {
  winner: Seat;
  plays: TrickPlay[];
}

export interface TrickState {
  current: Trick;
  completed: CompletedTrick[];
  /** Cards won so far, indexed by team. */
  wonCards: [Card[], Card[]];
  /** Set once the eighth trick is resolved. */
  lastTrickWinner: Seat | null;
}

export const TRICKS_PER_DEAL = 8;

export function createTrickState(leader: Seat): TrickState {
  return { current: { leader, plays: [] }, completed: [], wonCards: [[], []], lastTrickWinner: null };
}

export function turnOf(trick: Trick): Seat {
  let seat = trick.leader;
  for (let i = 0; i < trick.plays.length; i++) seat = nextSeat(seat);
  return seat;
}

export function isDealOver(state: TrickState): boolean {
  return state.completed.length >= TRICKS_PER_DEAL;
}

export function cardPointsOf(cards: readonly Card[], contract: Contract): number {
  return cards.reduce((sum, card) => sum + cardPoints(card.rank, strengthFor(contract, card.suit), contract), 0);
}

/**
 * Tier 2 is a real trump in a suit contract, tier 1 a card of the led suit, tier 0 anything else.
 * In alltrumps and notrumps no suit outranks another, so only the led suit can win.
 */
function tierOf(card: Card, contract: Contract, ledSuit: Suit): number {
  if (trumpSuitOf(contract) === card.suit) return 2;
  return card.suit === ledSuit ? 1 : 0;
}

export function beats(candidate: Card, current: Card, contract: Contract, ledSuit: Suit): boolean {
  const candidateTier = tierOf(candidate, contract, ledSuit);
  const currentTier = tierOf(current, contract, ledSuit);
  if (candidateTier !== currentTier) return candidateTier > currentTier;
  if (candidateTier === 0) return false;
  const strength = strengthFor(contract, candidate.suit);
  return cardOrder(candidate.rank, strength) > cardOrder(current.rank, strength);
}

export function currentWinner(trick: Trick, contract: Contract): TrickPlay | null {
  const [first, ...rest] = trick.plays;
  if (!first) return null;
  let best = first;
  for (const play of rest) {
    if (beats(play.card, best.card, contract, first.card.suit)) best = play;
  }
  return best;
}

export function trickWinner(trick: Trick, contract: Contract): Seat {
  if (trick.plays.length !== 4) throw new Error(`Trick is not complete: ${trick.plays.length} plays`);
  return currentWinner(trick, contract)!.seat;
}

export function legalCards(
  hand: Card[],
  trick: Trick,
  contract: Contract,
  seat: Seat,
  config: EngineConfig = DEFAULT_CONFIG,
): Card[] {
  const winning = currentWinner(trick, contract);
  if (!winning) return hand;
  const ledSuit = trick.plays[0]!.card.suit;
  const followers = hand.filter((card) => card.suit === ledSuit);
  const beating = (cards: Card[]): Card[] => cards.filter((card) => beats(card, winning.card, contract, ledSuit));
  const partnerWins = teamOf(winning.seat) === teamOf(seat);

  if (contract === "notrumps") return followers.length > 0 ? followers : hand;

  if (contract === "alltrumps") {
    if (followers.length === 0) return hand;
    const higher = beating(followers);
    return higher.length > 0 ? higher : followers;
  }

  const trumpSuit = trumpSuitOf(contract);
  if (followers.length > 0) {
    if (ledSuit !== trumpSuit) return followers;
    if (config.partnerExemptOnTrumpLead && partnerWins) return followers;
    const higher = beating(followers);
    return higher.length > 0 ? higher : followers;
  }

  if (partnerWins) return hand;
  const trumps = hand.filter((card) => card.suit === trumpSuit);
  if (trumps.length === 0) return hand;
  if (winning.card.suit !== trumpSuit) return trumps;
  // An opponent has trumped: overtrump when able, otherwise there is no obligation to undertrump.
  const higher = beating(trumps);
  return higher.length > 0 ? higher : hand;
}

/**
 * Appends a play and resolves the trick on the fourth card. When `hand` is given the card must
 * be one of its legal cards; without it only the turn is checked.
 */
export function playCard(
  state: TrickState,
  seat: Seat,
  card: Card,
  contract: Contract,
  config: EngineConfig = DEFAULT_CONFIG,
  hand?: Card[],
): TrickState {
  if (isDealOver(state)) throw new Error("The deal is over");
  const turn = turnOf(state.current);
  if (seat !== turn) throw new Error(`Not seat ${seat}'s turn (turn is ${turn})`);
  if (hand && !legalCards(hand, state.current, contract, seat, config).some((legal) => legal.id === card.id)) {
    throw new Error(`Card ${card.id} is not legal for seat ${seat}`);
  }

  const current: Trick = { leader: state.current.leader, plays: [...state.current.plays, { seat, card }] };
  if (current.plays.length < 4) return { ...state, current };

  const winner = trickWinner(current, contract);
  const team = teamOf(winner);
  const wonCards: [Card[], Card[]] = [state.wonCards[0], state.wonCards[1]];
  wonCards[team] = [...wonCards[team], ...current.plays.map((play) => play.card)];
  const completed = [...state.completed, { winner, plays: current.plays }];
  return {
    current: { leader: winner, plays: [] },
    completed,
    wonCards,
    lastTrickWinner: completed.length === TRICKS_PER_DEAL ? winner : null,
  };
}
