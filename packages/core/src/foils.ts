import { CONFIG } from "./config.ts";
import { ErrorCode, LastPrintError, invariant } from "./errors.ts";
import type { Address } from "viem";

export type Foil = "ORIGINAL" | "LONG_HOLD" | "FOR_SALE" | "FRESH" | "CHOG_AURA" | "LEGEND";

export interface ChogState {
  minter: Address;
  owner: Address;
  ownerSinceMs: number;
  nowMs: number;
  listed: boolean;
  lastSaleMs: number | null;
  ownerChogBalance: bigint;
  isLegend: boolean;
}

export interface FoilThresholds { longHoldDays: number; freshHours: number; chogAuraMinBalance: bigint }

export function thresholdsFromConfig(): FoilThresholds {
  const f = CONFIG.foils;
  if (f.chogAuraMinBalance === null) throw new LastPrintError(ErrorCode.INVALID_INPUT, "chogAuraMinBalance not frozen yet (set in M3 from real balances)");
  return { longHoldDays: f.longHoldDays, freshHours: f.freshHours, chogAuraMinBalance: BigInt(f.chogAuraMinBalance) };
}

/** Real-life foils (spec §6.4). Original and Long Hold are exclusive: Original wins (decisions D6). */
export function computeFoils(s: ChogState, t: FoilThresholds): Foil[] {
  invariant(s.nowMs >= s.ownerSinceMs, "ownerSince is in the future");
  const out: Foil[] = [];
  const original = s.owner === s.minter && s.lastSaleMs === null;
  if (original) out.push("ORIGINAL");
  else if (s.nowMs - s.ownerSinceMs >= t.longHoldDays * 86_400_000) out.push("LONG_HOLD");
  if (s.listed) out.push("FOR_SALE");
  if (s.lastSaleMs !== null && s.nowMs - s.lastSaleMs < t.freshHours * 3_600_000) out.push("FRESH");
  if (s.ownerChogBalance >= t.chogAuraMinBalance) out.push("CHOG_AURA");
  if (s.isLegend) out.push("LEGEND");
  return out;
}
