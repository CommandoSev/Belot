// Short synthesized cues (Web Audio, no files). Every sound is under 300 ms and peaks at gain 0.2.
import { useCallback, useEffect, useState } from "react";

export type SoundName = "card" | "turn" | "trick" | "deal" | "bid" | "belot" | "win" | "lose" | "error";

const STORAGE_KEY = "belot.sound";
const PEAK = 0.2;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

let ctx: AudioContext | null = null;
let unlockInstalled = false;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/** Browsers keep the context suspended until a user gesture; the first tap anywhere resumes it. */
function installUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    const c = context();
    if (c && c.state === "suspended") void c.resume();
    if (c && c.state === "running") {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

let enabled = readEnabled();

function tone(
  c: AudioContext,
  at: number,
  freq: number,
  ms: number,
  type: OscillatorType = "sine",
  peak = PEAK,
  glideTo?: number,
): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(glideTo, at + ms / 1000);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + ms / 1000 + 0.01);
}

function noise(c: AudioContext, at: number, ms: number, peak: number, filterHz: number): void {
  const length = Math.ceil((c.sampleRate * ms) / 1000);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterHz;
  filter.Q.value = 0.7;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(at);
  src.stop(at + ms / 1000 + 0.01);
}

const SOUNDS: Record<SoundName, (c: AudioContext, at: number) => void> = {
  card: (c, at) => {
    noise(c, at, 60, 0.12, 1800);
    tone(c, at, 900, 40, "triangle", 0.06, 300);
  },
  turn: (c, at) => {
    tone(c, at, 660, 120, "sine", 0.16);
    tone(c, at + 0.13, 880, 150, "sine", 0.16);
  },
  trick: (c, at) => tone(c, at, 500, 140, "triangle", 0.14, 1000),
  deal: (c, at) => {
    noise(c, at, 90, 0.14, 2500);
    noise(c, at + 0.1, 90, 0.14, 3200);
    noise(c, at + 0.2, 80, 0.12, 2000);
  },
  bid: (c, at) => tone(c, at, 740, 80, "sine", 0.12),
  belot: (c, at) => {
    tone(c, at, 523, 80, "sine", 0.16);
    tone(c, at + 0.09, 659, 80, "sine", 0.16);
    tone(c, at + 0.18, 784, 110, "sine", 0.16);
  },
  win: (c, at) => {
    tone(c, at, 523, 70, "triangle", 0.16);
    tone(c, at + 0.08, 659, 70, "triangle", 0.16);
    tone(c, at + 0.16, 784, 70, "triangle", 0.16);
    tone(c, at + 0.24, 1047, 60, "triangle", 0.16);
  },
  lose: (c, at) => {
    tone(c, at, 440, 120, "triangle", 0.14, 392);
    tone(c, at + 0.14, 330, 150, "triangle", 0.14, 262);
  },
  error: (c, at) => tone(c, at, 140, 180, "sawtooth", 0.1),
};

export function playSound(name: SoundName): void {
  if (!enabled) return;
  const c = context();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume();
    return;
  }
  try {
    SOUNDS[name](c, c.currentTime);
  } catch {
    // A failing sound never breaks the game.
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function useSoundToggle(): [boolean, () => void] {
  const [on, setOn] = useState(enabled);
  useEffect(installUnlock, []);
  const toggle = useCallback(() => {
    enabled = !enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    } catch {
      // Not persisted, still applies for this session.
    }
    setOn(enabled);
  }, []);
  return [on, toggle];
}
