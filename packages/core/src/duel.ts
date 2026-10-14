import type { Hex } from "viem";
import { draw } from "./packs.ts";
import { rankBonus, type Stats, type StatName } from "./stats.ts";
import type { Tier } from "./config.ts";
import { invariant } from "./errors.ts";

export interface DuelCard { tokenId: number; tier: Tier; stats: Stats }
/** Loyalty is excluded from Boss duels: yesterday's sold Chogs always have Loyalty 1 (decisions D5). */
export const BOSS_STATS: readonly StatName[] = ["journey", "fame", "value"];

export interface DuelPlan { roundStats: StatName[]; bossOrder: number[] }

/** Round stats and Boss picks are fixed by the day's seed, so every player faces the same hidden plan. */
export function planDuel(seed: Hex, day: string): DuelPlan {
  const stats = [...BOSS_STATS];
  const roundStats: StatName[] = [];
  for (let i = 0; i < 3; i++) roundStats.push(stats.splice(Number(draw(seed, `boss:${day}`, 0, `stat${i}`) % BigInt(stats.length)), 1)[0]!);
  const order = [0, 1, 2];
  const bossOrder: number[] = [];
  for (let i = 0; i < 3; i++) bossOrder.push(order.splice(Number(draw(seed, `boss:${day}`, 0, `pick${i}`) % BigInt(order.length)), 1)[0]!);
  return { roundStats, bossOrder };
}

export type RoundResult = "PLAYER" | "BOSS" | "VOID";

export function resolveRound(player: DuelCard, boss: DuelCard, stat: StatName): RoundResult {
  const p = player.stats[stat] + rankBonus(player.tier);
  const b = boss.stats[stat] + rankBonus(boss.tier);
  if (p !== b) return p > b ? "PLAYER" : "BOSS";
  if (player.stats.journey !== boss.stats.journey) return player.stats.journey > boss.stats.journey ? "PLAYER" : "BOSS";
  return "VOID";
}

export function runDuel(plan: DuelPlan, bossDeck: readonly DuelCard[], playerPicks: readonly DuelCard[]) {
  invariant(bossDeck.length === 3 && playerPicks.length === 3, "a duel needs 3 cards a side");
  invariant(new Set(playerPicks.map((c) => c.tokenId)).size === 3, "player picks must be 3 different cards");
  const rounds = plan.roundStats.map((stat, i) => ({ stat, result: resolveRound(playerPicks[i]!, bossDeck[plan.bossOrder[i]!]!, stat) }));
  const wins = rounds.filter((r) => r.result === "PLAYER").length;
  const losses = rounds.filter((r) => r.result === "BOSS").length;
  return { rounds, winner: wins >= 2 ? "PLAYER" : losses >= 2 ? "BOSS" : wins > losses ? "PLAYER" : losses > wins ? "BOSS" : "DRAW" } as const;
}
