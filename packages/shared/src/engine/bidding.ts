import {
  CONTRACTS,
  contractRank,
  nextSeat,
  teamOf,
  type BidAction,
  type Contract,
  type Multiplier,
  type Seat,
  type Team,
} from "./types";

export interface BiddingState {
  dealer: Seat;
  turn: Seat;
  contract: Contract | null;
  bidder: Seat | null;
  multiplier: Multiplier;
  contraBy: Team | null;
  passesInRow: number;
  history: { seat: Seat; action: BidAction }[];
}

export type BidResult = "continue" | "done" | "redeal";

export function createBidding(dealer: Seat): BiddingState {
  return {
    dealer,
    turn: nextSeat(dealer),
    contract: null,
    bidder: null,
    multiplier: 1,
    contraBy: null,
    passesInRow: 0,
    history: [],
  };
}

/** Bidding ends after three passes following a bid, or four passes with no bid. */
export function biddingFinished(state: BiddingState): boolean {
  return state.contract === null ? state.passesInRow >= 4 : state.passesInRow >= 3;
}

/** The agreed contract once bidding is done; null while bidding runs or after a redeal. */
export function finalContract(
  state: BiddingState,
): { contract: Contract; bidder: Seat; multiplier: Multiplier } | null {
  if (state.contract === null || state.bidder === null || !biddingFinished(state)) return null;
  return { contract: state.contract, bidder: state.bidder, multiplier: state.multiplier };
}

export function legalBids(state: BiddingState, seat: Seat): BidAction[] {
  if (seat !== state.turn || biddingFinished(state)) return [];
  const bids: BidAction[] = [{ type: "pass" }];
  const current = state.contract === null ? -1 : contractRank(state.contract);
  for (const contract of CONTRACTS) {
    if (contractRank(contract) > current) bids.push({ type: "bid", contract });
  }
  if (state.contract !== null && state.bidder !== null) {
    const ownSide = teamOf(seat) === teamOf(state.bidder);
    if (state.multiplier === 1 && !ownSide) bids.push({ type: "contra" });
    if (state.multiplier === 2 && ownSide) bids.push({ type: "recontra" });
  }
  return bids;
}

function sameAction(a: BidAction, b: BidAction): boolean {
  return a.type === b.type && (a.type !== "bid" || b.type !== "bid" || a.contract === b.contract);
}

export function applyBid(
  state: BiddingState,
  seat: Seat,
  action: BidAction,
): { state: BiddingState; result: BidResult } {
  if (!legalBids(state, seat).some((legal) => sameAction(legal, action))) {
    throw new Error(`Illegal bid ${JSON.stringify(action)} by seat ${seat}`);
  }
  const base: BiddingState = {
    ...state,
    turn: nextSeat(seat),
    history: [...state.history, { seat, action }],
  };
  switch (action.type) {
    case "pass": {
      const next = { ...base, passesInRow: state.passesInRow + 1 };
      if (biddingFinished(next)) return { state: next, result: next.contract === null ? "redeal" : "done" };
      return { state: next, result: "continue" };
    }
    case "bid":
      return {
        state: { ...base, contract: action.contract, bidder: seat, multiplier: 1, contraBy: null, passesInRow: 0 },
        result: "continue",
      };
    case "contra":
      return { state: { ...base, multiplier: 2, contraBy: teamOf(seat), passesInRow: 0 }, result: "continue" };
    case "recontra":
      return { state: { ...base, multiplier: 4, passesInRow: 0 }, result: "continue" };
  }
}
