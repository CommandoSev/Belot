import { useEffect, useRef } from "react";
import type { CompletedTrickView, RoomView, Seat } from "@belot/shared";
import { playSound } from "./sound";

function trickKey(trick: CompletedTrickView | null): string {
  return trick ? `${trick.winner}:${trick.plays.map((p) => p.card).join(",")}` : "";
}

/** Plays a cue for every change in the view that the player should notice. */
export function useGameSounds(view: RoomView | null, mySeat: Seat | null): void {
  const prevRef = useRef<RoomView | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = view;
    if (!prev || !view) return;
    const game = view.game;
    const was = prev.game;
    if (!game) return;

    if (!was || game.dealNumber !== was.dealNumber || (game.phase === "bidding" && was.phase !== "bidding")) {
      playSound("deal");
      return;
    }
    if (game.phase === "finished" && was.phase !== "finished") {
      playSound(game.winner !== null && game.winner === game.myTeam ? "win" : "lose");
      return;
    }
    if (game.bidding.history.length > was.bidding.history.length) playSound("bid");
    if (game.belots.length > was.belots.length) playSound("belot");
    if (trickKey(game.lastTrick) !== trickKey(was.lastTrick) && game.lastTrick) playSound("trick");
    else if ((game.trick?.plays.length ?? 0) > (was.trick?.plays.length ?? 0)) playSound("card");
    if (mySeat !== null && game.turn === mySeat && was.turn !== mySeat) playSound("turn");
  }, [view, mySeat]);
}
