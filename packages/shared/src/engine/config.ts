/** House-rule knobs. Rounding thresholds and the валат bonus are regionally contested, so they live here. */
export interface EngineConfig {
  /** Units digit at or above which a raw score rounds up, per contract kind. */
  roundingThreshold: {
    suit: number;
    notrumps: number;
    alltrumps: number;
  };
  valatBonus: number;
  lastTrickBonus: number;
  targetScore: number;
  /** When true, a player need not overtrump a trump led by their partner. */
  partnerExemptOnTrumpLead: boolean;
}

export const DEFAULT_CONFIG: EngineConfig = {
  roundingThreshold: { suit: 6, notrumps: 5, alltrumps: 4 },
  valatBonus: 90,
  lastTrickBonus: 10,
  targetScore: 151,
  partnerExemptOnTrumpLead: false,
};
