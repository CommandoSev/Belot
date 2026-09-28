import { RANKS, SUITS, trumpSuitOf, type Card, type Contract, type Rank, type Suit, type Team } from "./types";

export type SequenceDeclaration = {
  kind: "sequence";
  length: 3 | 4 | 5;
  cards: Card[];
  points: 20 | 50 | 100;
  topRank: Rank;
};

export type CarreDeclaration = {
  kind: "carre";
  rank: Rank;
  cards: Card[];
  points: 100 | 150 | 200;
};

export type Declaration = SequenceDeclaration | CarreDeclaration;

export interface BelotDeclaration {
  suit: Suit;
  points: 20;
}

const CARRE_POINTS: Partial<Record<Rank, 100 | 150 | 200>> = {
  J: 200,
  "9": 150,
  "10": 100,
  Q: 100,
  K: 100,
  A: 100,
};

const rankIndex = (rank: Rank): number => RANKS.indexOf(rank);

/** Maximal runs of 3+ consecutive ranks in the plain 7..A order, per suit. Five or more is one квинта. */
function findSequences(cards: readonly Card[]): SequenceDeclaration[] {
  const out: SequenceDeclaration[] = [];
  for (const suit of SUITS) {
    const inSuit = cards.filter((c) => c.suit === suit).sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank));
    let run: Card[] = [];
    const flush = () => {
      if (run.length >= 3) {
        const length = Math.min(run.length, 5) as 3 | 4 | 5;
        const points = length === 3 ? 20 : length === 4 ? 50 : 100;
        out.push({ kind: "sequence", length, cards: run, points, topRank: run[run.length - 1]!.rank });
      }
      run = [];
    };
    for (const card of inSuit) {
      const prev = run[run.length - 1];
      if (prev && rankIndex(card.rank) === rankIndex(prev.rank) + 1) run.push(card);
      else {
        flush();
        run = [card];
      }
    }
    flush();
  }
  return out;
}

function findCarres(cards: readonly Card[]): CarreDeclaration[] {
  const out: CarreDeclaration[] = [];
  for (const rank of RANKS) {
    const points = CARRE_POINTS[rank];
    if (!points) continue;
    const ofRank = cards.filter((c) => c.rank === rank);
    if (ofRank.length === 4) out.push({ kind: "carre", rank, cards: ofRank, points });
  }
  return out;
}

const total = (declarations: readonly Declaration[]): number => declarations.reduce((sum, d) => sum + d.points, 0);

/**
 * Sequences and карета in a hand. A card serves at most one declaration; when a каре card could also
 * extend a sequence, the assignment with the higher total wins and a tie keeps the каре.
 */
export function detectDeclarations(hand: Card[], contract: Contract): Declaration[] {
  if (contract === "notrumps") return [];
  const carres = findCarres(hand);
  let best: Declaration[] = [];
  let bestTotal = -1;
  let bestCarrePoints = -1;
  // Every subset of the карета (at most two fit in eight cards), sequences from the leftover cards.
  for (let mask = 0; mask < 1 << carres.length; mask++) {
    const kept = carres.filter((_, i) => mask & (1 << i));
    const taken = new Set(kept.flatMap((c) => c.cards.map((card) => card.id)));
    const candidate: Declaration[] = [...kept, ...findSequences(hand.filter((c) => !taken.has(c.id)))];
    const candidateTotal = total(candidate);
    const carrePoints = total(kept);
    if (candidateTotal > bestTotal || (candidateTotal === bestTotal && carrePoints > bestCarrePoints)) {
      best = candidate;
      bestTotal = candidateTotal;
      bestCarrePoints = carrePoints;
    }
  }
  return best.sort((a, b) => b.points - a.points);
}

/** The suit a K or Q would announce белот in under this contract, or null when it cannot. */
export function belotSuitFor(played: Card, contract: Contract): Suit | null {
  if (played.rank !== "K" && played.rank !== "Q") return null;
  if (contract === "notrumps") return null;
  if (contract === "alltrumps") return played.suit;
  return trumpSuitOf(contract) === played.suit ? played.suit : null;
}

/** True when playing `played` may announce белот: it is a trump K or Q and its partner card is still in hand. */
export function belotAvailable(hand: Card[], played: Card, contract: Contract): boolean {
  const suit = belotSuitFor(played, contract);
  if (!suit) return false;
  const partnerRank: Rank = played.rank === "K" ? "Q" : "K";
  return hand.some((c) => c.id !== played.id && c.suit === suit && c.rank === partnerRank);
}

export interface DeclarationComparison {
  sequencesTo: Team | null;
  carresTo: Team | null;
  points: [number, number];
}

/** Longer wins, then the higher top card. */
function compareSequence(a: SequenceDeclaration, b: SequenceDeclaration): number {
  return a.length - b.length || rankIndex(a.topRank) - rankIndex(b.topRank);
}

/** More points win, then the higher rank in 7..A order. */
function compareCarre(a: CarreDeclaration, b: CarreDeclaration): number {
  return a.points - b.points || rankIndex(a.rank) - rankIndex(b.rank);
}

function strongest<T>(items: readonly T[], compare: (a: T, b: T) => number): T | null {
  let best: T | null = null;
  for (const item of items) if (best === null || compare(item, best) > 0) best = item;
  return best;
}

/** Which team's best of a kind wins: null when both are empty or exactly tied. */
function winner<T>(a: readonly T[], b: readonly T[], compare: (a: T, b: T) => number): Team | null {
  const bestA = strongest(a, compare);
  const bestB = strongest(b, compare);
  if (bestA === null && bestB === null) return null;
  if (bestA === null) return 1;
  if (bestB === null) return 0;
  const cmp = compare(bestA, bestB);
  return cmp > 0 ? 0 : cmp < 0 ? 1 : null;
}

/**
 * Settles both teams' announced sequences and карета. Each kind is judged separately: the team with the
 * strongest single declaration of that kind scores all of its declarations of that kind, the other none.
 * Белот is not part of this comparison.
 */
export function compareDeclarations(a: Declaration[], b: Declaration[]): DeclarationComparison {
  const sequences = (ds: Declaration[]) => ds.filter((d): d is SequenceDeclaration => d.kind === "sequence");
  const carres = (ds: Declaration[]) => ds.filter((d): d is CarreDeclaration => d.kind === "carre");
  const teams = [a, b] as const;

  const sequencesTo = winner(sequences(a), sequences(b), compareSequence);
  const carresTo = winner(carres(a), carres(b), compareCarre);

  const points: [number, number] = [0, 0];
  if (sequencesTo !== null) points[sequencesTo] += total(sequences(teams[sequencesTo]));
  if (carresTo !== null) points[carresTo] += total(carres(teams[carresTo]));
  return { sequencesTo, carresTo, points };
}
