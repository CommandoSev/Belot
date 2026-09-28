import { describe, expect, it } from "vitest";
import {
  applyBid,
  biddingFinished,
  createBidding,
  finalContract,
  legalBids,
  type BiddingState,
} from "../bidding";
import { CONTRACTS, nextSeat, partnerOf, type BidAction, type Contract, type Seat } from "../types";

const pass: BidAction = { type: "pass" };
const contra: BidAction = { type: "contra" };
const recontra: BidAction = { type: "recontra" };
const bid = (contract: Contract): BidAction => ({ type: "bid", contract });

/** Applies the actions in turn order, asserting every intermediate result is "continue". */
function play(state: BiddingState, actions: BidAction[]): BiddingState {
  let current = state;
  for (const action of actions) {
    const step = applyBid(current, current.turn, action);
    expect(step.result).toBe("continue");
    current = step.state;
  }
  return current;
}

describe("createBidding", () => {
  it("starts with the seat right of the dealer and no contract", () => {
    for (const dealer of [0, 1, 2, 3] as Seat[]) {
      const state = createBidding(dealer);
      expect(state.dealer).toBe(dealer);
      expect(state.turn).toBe(nextSeat(dealer));
      expect(state.contract).toBeNull();
      expect(state.bidder).toBeNull();
      expect(state.multiplier).toBe(1);
      expect(state.contraBy).toBeNull();
      expect(state.passesInRow).toBe(0);
      expect(state.history).toEqual([]);
    }
  });

  it("serialises to JSON without loss", () => {
    const state = play(createBidding(3), [bid("clubs"), contra, recontra, pass]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("turn order", () => {
  it("proceeds counter-clockwise via nextSeat", () => {
    let state = createBidding(0);
    for (let i = 0; i < 3; i++) {
      const seat = state.turn;
      state = applyBid(state, seat, pass).state;
      expect(state.turn).toBe(nextSeat(seat));
    }
  });

  it("offers no bids to a seat out of turn", () => {
    const state = createBidding(0);
    expect(state.turn).toBe(1);
    expect(legalBids(state, 0)).toEqual([]);
    expect(legalBids(state, 2)).toEqual([]);
    expect(legalBids(state, 3)).toEqual([]);
    expect(legalBids(state, 1).length).toBeGreaterThan(0);
  });

  it("throws when a seat acts out of turn", () => {
    const state = createBidding(0);
    expect(() => applyBid(state, 2, pass)).toThrow();
  });
});

describe("legalBids", () => {
  it("allows pass and every contract when nothing has been bid", () => {
    const state = createBidding(0);
    const legal = legalBids(state, 1);
    expect(legal).toContainEqual(pass);
    for (const contract of CONTRACTS) {
      expect(legal).toContainEqual(bid(contract));
    }
    expect(legal).not.toContainEqual(contra);
    expect(legal).not.toContainEqual(recontra);
  });

  it("allows only strictly higher contracts", () => {
    const state = play(createBidding(0), [bid("hearts")]);
    const legal = legalBids(state, state.turn);
    expect(legal).toContainEqual(pass);
    expect(legal).not.toContainEqual(bid("clubs"));
    expect(legal).not.toContainEqual(bid("diamonds"));
    expect(legal).not.toContainEqual(bid("hearts"));
    expect(legal).toContainEqual(bid("spades"));
    expect(legal).toContainEqual(bid("notrumps"));
    expect(legal).toContainEqual(bid("alltrumps"));
  });

  it("lets a partner raise their own side's bid", () => {
    const state = play(createBidding(0), [bid("clubs"), pass]);
    const partner = partnerOf(1);
    expect(state.turn).toBe(partner);
    expect(legalBids(state, partner)).toContainEqual(bid("diamonds"));
    const raised = applyBid(state, partner, bid("diamonds"));
    expect(raised.result).toBe("continue");
    expect(raised.state.contract).toBe("diamonds");
    expect(raised.state.bidder).toBe(partner);
  });

  it("offers nothing above alltrumps except pass and contra", () => {
    const state = play(createBidding(0), [bid("alltrumps")]);
    const legal = legalBids(state, state.turn);
    expect(legal).toEqual(expect.arrayContaining([pass, contra]));
    expect(legal.filter((b) => b.type === "bid")).toEqual([]);
  });

  it("returns nothing once bidding is finished", () => {
    const done = play(createBidding(0), [bid("clubs"), pass, pass]);
    const final = applyBid(done, done.turn, pass);
    expect(final.result).toBe("done");
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(legalBids(final.state, seat)).toEqual([]);
    }
  });
});

describe("contra and recontra", () => {
  it("contra is not legal without a contract", () => {
    const state = createBidding(0);
    expect(legalBids(state, 1)).not.toContainEqual(contra);
    expect(() => applyBid(state, 1, contra)).toThrow();
  });

  it("contra is legal only for the side not holding the bid", () => {
    // dealer 0: seat 1 bids, seat 2 (opponent) may contra
    const afterBid = play(createBidding(0), [bid("clubs")]);
    expect(afterBid.turn).toBe(2);
    expect(legalBids(afterBid, 2)).toContainEqual(contra);
    expect(legalBids(afterBid, 2)).not.toContainEqual(recontra);

    // seat 2 passes; seat 3 (partner of the bidder) may not contra
    const partnerTurn = play(afterBid, [pass]);
    expect(partnerTurn.turn).toBe(3);
    expect(legalBids(partnerTurn, 3)).not.toContainEqual(contra);
    expect(() => applyBid(partnerTurn, 3, contra)).toThrow();
  });

  it("contra sets multiplier 2, records the team and resets passes", () => {
    const state = play(createBidding(0), [bid("clubs"), pass, pass, contra]);
    expect(state.multiplier).toBe(2);
    expect(state.contraBy).toBe(0);
    expect(state.passesInRow).toBe(0);
    expect(state.contract).toBe("clubs");
    expect(state.bidder).toBe(1);
  });

  it("contra is not legal again after contra", () => {
    const state = play(createBidding(0), [bid("clubs"), contra, pass]);
    // seat 0 is on the contra side: neither contra nor recontra
    expect(state.turn).toBe(0);
    expect(legalBids(state, 0)).not.toContainEqual(contra);
    expect(legalBids(state, 0)).not.toContainEqual(recontra);
  });

  it("recontra is legal only for the bidding side and only after contra", () => {
    const beforeContra = play(createBidding(0), [bid("clubs")]);
    expect(legalBids(beforeContra, 2)).not.toContainEqual(recontra);
    expect(() => applyBid(beforeContra, 2, recontra)).toThrow();

    const afterContra = play(beforeContra, [contra]);
    expect(afterContra.turn).toBe(3);
    expect(legalBids(afterContra, 3)).toContainEqual(recontra);
    expect(legalBids(afterContra, 3)).not.toContainEqual(contra);

    const opponentTurn = play(afterContra, [pass]);
    expect(opponentTurn.turn).toBe(0);
    expect(legalBids(opponentTurn, 0)).not.toContainEqual(recontra);
    expect(() => applyBid(opponentTurn, 0, recontra)).toThrow();
  });

  it("recontra sets multiplier 4 and is not legal after itself", () => {
    const state = play(createBidding(0), [bid("clubs"), contra, recontra]);
    expect(state.multiplier).toBe(4);
    expect(state.passesInRow).toBe(0);
    expect(state.contraBy).toBe(0);
    // bidding side (seat 1) cannot recontra again
    const biddingSide = play(state, [pass]);
    expect(biddingSide.turn).toBe(1);
    expect(legalBids(biddingSide, 1)).not.toContainEqual(recontra);
    expect(legalBids(biddingSide, 1)).not.toContainEqual(contra);
    // contra side (seat 2) cannot contra or recontra either
    const contraSide = play(biddingSide, [pass]);
    expect(contraSide.turn).toBe(2);
    expect(legalBids(contraSide, 2)).not.toContainEqual(recontra);
    expect(legalBids(contraSide, 2)).not.toContainEqual(contra);
  });

  it("a higher contract after contra resets the multiplier to 1", () => {
    const state = play(createBidding(0), [bid("clubs"), contra, bid("hearts")]);
    expect(state.contract).toBe("hearts");
    expect(state.bidder).toBe(3);
    expect(state.multiplier).toBe(1);
    expect(state.contraBy).toBeNull();
    expect(state.passesInRow).toBe(0);
    // the new bid can be doubled again by the other side
    expect(legalBids(state, 0)).toContainEqual(contra);
  });

  it("a higher bid is still legal after contra and recontra", () => {
    const state = play(createBidding(0), [bid("clubs"), contra, recontra]);
    expect(legalBids(state, 0)).toContainEqual(bid("spades"));
  });
});

describe("ending", () => {
  it("three passes after a bid end bidding with the last contract and bidder", () => {
    const state = play(createBidding(0), [bid("clubs"), bid("spades"), pass, pass]);
    expect(finalContract(state)).toBeNull();
    const last = applyBid(state, state.turn, pass);
    expect(last.result).toBe("done");
    expect(biddingFinished(last.state)).toBe(true);
    expect(finalContract(last.state)).toEqual({ contract: "spades", bidder: 2, multiplier: 1 });
  });

  it("three passes after a contra end bidding with the multiplier kept", () => {
    const state = play(createBidding(0), [bid("notrumps"), contra, pass, pass]);
    const last = applyBid(state, state.turn, pass);
    expect(last.result).toBe("done");
    expect(finalContract(last.state)).toEqual({ contract: "notrumps", bidder: 1, multiplier: 2 });
  });

  it("passes before a bid do not count toward the three after it", () => {
    const state = play(createBidding(0), [pass, pass, bid("clubs"), pass, pass]);
    expect(state.passesInRow).toBe(2);
    const last = applyBid(state, state.turn, pass);
    expect(last.result).toBe("done");
    expect(finalContract(last.state)).toEqual({ contract: "clubs", bidder: 3, multiplier: 1 });
  });

  it("four passes with no bid return redeal", () => {
    const state = play(createBidding(2), [pass, pass, pass]);
    expect(biddingFinished(state)).toBe(false);
    const last = applyBid(state, state.turn, pass);
    expect(last.result).toBe("redeal");
    expect(biddingFinished(last.state)).toBe(true);
    expect(finalContract(last.state)).toBeNull();
    expect(last.state.passesInRow).toBe(4);
  });

  it("does not finish early: two passes after a bid continue", () => {
    const state = play(createBidding(0), [bid("clubs"), pass, pass]);
    expect(biddingFinished(state)).toBe(false);
    expect(finalContract(state)).toBeNull();
  });

  it("rejects any action after bidding has finished", () => {
    const done = applyBid(play(createBidding(0), [bid("clubs"), pass, pass]), 0, pass).state;
    expect(() => applyBid(done, done.turn, pass)).toThrow();
  });
});

describe("history and immutability", () => {
  it("records every action with its seat in order", () => {
    const actions = [pass, bid("diamonds"), contra, recontra, pass, pass, pass];
    let state = createBidding(0);
    const expected: { seat: Seat; action: BidAction }[] = [];
    for (const action of actions) {
      expected.push({ seat: state.turn, action });
      state = applyBid(state, state.turn, action).state;
    }
    expect(state.history).toEqual(expected);
    expect(state.history.map((h) => h.seat)).toEqual([1, 2, 3, 0, 1, 2, 3]);
  });

  it("does not mutate the input state", () => {
    const state = createBidding(0);
    const snapshot = JSON.parse(JSON.stringify(state));
    applyBid(state, 1, bid("clubs"));
    expect(state).toEqual(snapshot);
  });

  it("throws on an illegal bid and names the reason", () => {
    const state = play(createBidding(0), [bid("hearts")]);
    expect(() => applyBid(state, state.turn, bid("clubs"))).toThrow(/illegal/i);
  });
});
