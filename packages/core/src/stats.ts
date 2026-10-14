import { CONFIG, type Tier } from "./config.ts";
import { invariant } from "./errors.ts";

export interface ChogLife {
  holdDays: number;          // whole days the current owner has held it
  distinctOwners: number;    // owners since mint, minter included
  salesCount: number;        // classified SALE events since mint
  lastSaleWei: bigint | null;
  floorWei: bigint;
  tier: Tier;
}
export interface Stats { loyalty: number; journey: number; fame: number; value: number }
export type StatName = keyof Stats;
export const STAT_NAMES: readonly StatName[] = ["loyalty", "journey", "fame", "value"];

const clampIndex = (arr: readonly number[], i: number) => arr[Math.min(Math.max(i, 0), arr.length - 1)]!;

export function computeStats(life: ChogLife, cfg = CONFIG.stats): Stats {
  invariant(Number.isInteger(life.holdDays) && life.holdDays >= 0, "holdDays must be a non-negative integer");
  invariant(Number.isInteger(life.distinctOwners) && life.distinctOwners >= 1, "distinctOwners must be >= 1");
  invariant(Number.isInteger(life.salesCount) && life.salesCount >= 0, "salesCount must be >= 0");
  invariant(life.floorWei > 0n, "floor must be positive");

  const loyalty = Math.min(10, 1 + Math.floor(life.holdDays / cfg.loyaltyDaysPerPoint));
  const journey = clampIndex(cfg.journeyOwnersToScore, life.distinctOwners - 1);
  const fame = clampIndex(cfg.fameSalesToScore, life.salesCount);
  let value = cfg.valueNeverSold;
  if (life.lastSaleWei !== null) {
    const ratio = Number((life.lastSaleWei * 10000n) / life.floorWei) / 10000;
    value = cfg.valueRatioBands.find((b) => ratio <= b.maxRatio)?.score ?? 10;
  }
  return { loyalty, journey, fame, value };
}

export function rankBonus(tier: Tier, cfg = CONFIG.stats): number {
  return (cfg.rankBonus as Record<Tier, number>)[tier];
}
