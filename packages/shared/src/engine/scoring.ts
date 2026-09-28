import { DECK } from "./cards";
import { DEFAULT_CONFIG, type EngineConfig } from "./config";
import { compareDeclarations, type Declaration } from "./declarations";
import { cardPointsOf } from "./tricks";
import { nextSeat, teamOf, type Card, type Contract, type Multiplier, type Seat, type Team } from "./types";

/** Raw points to game points: divide by ten, round up when the units digit reaches the contract's threshold. */
export function roundPoints(raw: number, contract: Contract, config: EngineConfig = DEFAULT_CONFIG): number {
  const threshold =
    contract === "alltrumps"
      ? config.roundingThreshold.alltrumps
      : contract === "notrumps"
        ? config.roundingThreshold.notrumps
        : config.roundingThreshold.suit;
  return Math.floor(raw / 10) + (raw % 10 >= threshold ? 1 : 0);
}

export interface DealInput {
  contract: Contract;
  bidder: Seat;
  multiplier: Multiplier;
  /** Cards won during the deal, indexed by team. */
  wonCards: [Card[], Card[]];
  lastTrickWinner: Seat;
  /** Announced sequences and карета per team, already validated. */
  declarations: [Declaration[], Declaration[]];
  /** Number of белот announcements per team. */
  belots: [number, number];
  /** Points hanging from earlier deals. */
  hangingBefore: number;
}

export interface TeamDealScore {
  cardPoints: number;
  lastTrick: number;
  declarations: number;
  belots: number;
  valat: number;
  raw: number;
  rounded: number;
  /** Game points actually added to the match score (after вътре, контра, висящи). */
  awarded: number;
}

export interface DealScore {
  teams: [TeamDealScore, TeamDealScore];
  /** won = bidders made it, inside = bidders fell вътре, hanging = tie, bidders' points hang. */
  result: "won" | "inside" | "hanging";
  valatBy: Team | null;
  hangingBefore: number;
  hangingAfter: number;
}

const BELOT_POINTS = 20;
const TEAMS: readonly Team[] = [0, 1];

export function scoreDeal(input: DealInput, config: EngineConfig = DEFAULT_CONFIG): DealScore {
  const { contract, multiplier, hangingBefore } = input;
  const round = (raw: number) => roundPoints(raw, contract, config);
  const bidders = teamOf(input.bidder);
  const opponents: Team = bidders === 0 ? 1 : 0;
  const lastTrickTeam = teamOf(input.lastTrickWinner);
  const declarationPoints = compareDeclarations(input.declarations[0], input.declarations[1]).points;
  const valatBy = TEAMS.find((team) => input.wonCards[team].length === DECK.length) ?? null;

  const teams = TEAMS.map((team): TeamDealScore => {
    const cardPoints = cardPointsOf(input.wonCards[team], contract);
    const lastTrickBonus = input.contract === "notrumps" ? config.lastTrickBonus * 2 : config.lastTrickBonus;
    const lastTrick = team === lastTrickTeam ? lastTrickBonus : 0;
    const declarations = declarationPoints[team];
    const belots = input.belots[team] * BELOT_POINTS;
    const valat = team === valatBy ? config.valatBonus : 0;
    const raw = cardPoints + lastTrick + declarations + belots + valat;
    return { cardPoints, lastTrick, declarations, belots, valat, raw, rounded: round(raw), awarded: 0 };
  }) as [TeamDealScore, TeamDealScore];

  const rawBidders = teams[bidders].raw;
  const rawOpponents = teams[opponents].raw;
  const total = round(rawBidders + rawOpponents) * multiplier;
  const result: DealScore["result"] =
    rawBidders > rawOpponents ? "won" : rawBidders < rawOpponents ? "inside" : "hanging";

  let hangingAfter = 0;
  if (result === "hanging") {
    if (multiplier === 1) teams[opponents].awarded = teams[opponents].rounded;
    hangingAfter = hangingBefore + (multiplier === 1 ? teams[bidders].rounded : total);
  } else if (result === "won" && multiplier === 1) {
    teams[bidders].awarded = teams[bidders].rounded + hangingBefore;
    teams[opponents].awarded = teams[opponents].rounded;
  } else {
    // Вътре, or any decided deal under контра/реконтра: the winner takes the whole (multiplied) total.
    const winner = result === "won" ? bidders : opponents;
    teams[winner].awarded = total + hangingBefore;
  }

  return { teams, result, valatBy, hangingBefore, hangingAfter };
}

export interface MatchState {
  scores: [number, number];
  /** Points hanging from tied deals, paid to the winner of the next decided deal. */
  hanging: number;
  dealer: Seat;
  /** Number of the deal in progress, starting at 1. */
  dealNumber: number;
  winner: Team | null;
}

export function createMatch(firstDealer: Seat): MatchState {
  return { scores: [0, 0], hanging: 0, dealer: firstDealer, dealNumber: 1, winner: null };
}

/** A deal decided by валат never ends the match; otherwise the higher side at or above the target wins, a tie continues. */
function decideWinner(scores: [number, number], deal: DealScore, config: EngineConfig): Team | null {
  if (deal.valatBy !== null) return null;
  const reached = TEAMS.filter((team) => scores[team] >= config.targetScore);
  if (reached.length === 0) return null;
  if (reached.length === 1) return reached[0]!;
  if (scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 0 : 1;
}

export function applyDealToMatch(match: MatchState, deal: DealScore, config: EngineConfig = DEFAULT_CONFIG): MatchState {
  const scores: [number, number] = [
    match.scores[0] + deal.teams[0].awarded,
    match.scores[1] + deal.teams[1].awarded,
  ];
  return {
    scores,
    hanging: deal.hangingAfter,
    dealer: nextSeat(match.dealer),
    dealNumber: match.dealNumber + 1,
    winner: decideWinner(scores, deal, config),
  };
}

/** Four passes: the next dealer deals again, nothing else changes. */
export function redealMatch(match: MatchState): MatchState {
  return { ...match, dealer: nextSeat(match.dealer) };
}
