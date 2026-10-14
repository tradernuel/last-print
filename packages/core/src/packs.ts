import { createHmac } from "node:crypto";
import { keccak256, stringToHex, hexToBytes, type Hex } from "viem";
import { canonicalize } from "./canonical.ts";
import { CONFIG, TIERS, type Tier } from "./config.ts";
import { invariant } from "./errors.ts";

export interface CatalogEntry { tokenId: number; tier: Tier; background: string | null }
export interface Listing { tokenId: number; priceWei: bigint }
export interface HotSnapshot { listings: Listing[]; capWei: bigint; takenAtMs: number; hash: Hex }

export interface PackInputs {
  seed: Hex;                 // revealed daily seed (32 bytes)
  playerId: string;
  packIndex: number;
  catalog: readonly CatalogEntry[];
  ownedBackgrounds: readonly string[];
  hot: HotSnapshot | null;   // null when listings are unavailable (OPENSEA_DOWN)
}

export type SlotKind = "regular" | "helper" | "hot";
export interface PackSlot { slot: SlotKind; index: number; tokenId: number; tier: Tier; mode?: "album" | "regular" }
export interface Pack { slots: PackSlot[]; hotSnapshotHash: Hex | null; hotMissing: boolean }

export function seedCommitment(seed: Hex): Hex {
  invariant(hexToBytes(seed).length === 32, "seed must be 32 bytes");
  return keccak256(seed);
}

/** Deterministic 256-bit draw: HMAC_SHA256(seed, playerId | packIndex | label). */
export function draw(seed: Hex, playerId: string, packIndex: number, label: string): bigint {
  const h = createHmac("sha256", Buffer.from(hexToBytes(seed))).update(`${playerId}|${packIndex}|${label}`).digest("hex");
  return BigInt(`0x${h}`);
}

/** Uniform index in [0, n). Modulo bias is below 2^-200 for n < 2^50. */
const pick = (r: bigint, n: number) => { invariant(n > 0, "empty range"); return Number(r % BigInt(n)); };

export function tierFromRoll(roll: number): Tier {
  const bp = CONFIG.odds.regularTierBp as Record<Tier, number>;
  const total = TIERS.reduce((s, t) => s + bp[t], 0);
  invariant(total === 10000, `tier odds must sum to 10000 bp, got ${total}`);
  let acc = 0;
  for (const t of TIERS) { acc += bp[t]; if (roll < acc) return t; }
  invariant(false, "unreachable");
}

function byTier(catalog: readonly CatalogEntry[]): Map<Tier, CatalogEntry[]> {
  const m = new Map<Tier, CatalogEntry[]>(TIERS.map((t) => [t, []]));
  for (const c of [...catalog].sort((a, b) => a.tokenId - b.tokenId)) m.get(c.tier)!.push(c);
  return m;
}

function regularDraw(inp: PackInputs, tiers: Map<Tier, CatalogEntry[]>, label: string): CatalogEntry {
  const tier = tierFromRoll(pick(draw(inp.seed, inp.playerId, inp.packIndex, `${label}:tier`), 10000));
  const list = tiers.get(tier)!;
  invariant(list.length > 0, `no Chogs in tier ${tier}`);
  return list[pick(draw(inp.seed, inp.playerId, inp.packIndex, `${label}:pick`), list.length)]!;
}

/** Integer weights w = floor(scale / rank^exp), rank from 1 = cheapest. */
export function hotWeights(n: number): bigint[] {
  const { hotRankExponent, hotWeightScale } = CONFIG.odds;
  return Array.from({ length: n }, (_, i) => BigInt(Math.floor(hotWeightScale / Math.pow(i + 1, hotRankExponent))));
}

export function buildHotSnapshot(all: readonly Listing[], capWei: bigint, takenAtMs: number): HotSnapshot {
  const best = new Map<number, bigint>();
  for (const l of all) {
    invariant(l.priceWei > 0n, `listing for ${l.tokenId} has no price`);
    const cur = best.get(l.tokenId);
    if (cur === undefined || l.priceWei < cur) best.set(l.tokenId, l.priceWei);
  }
  const listings = [...best].map(([tokenId, priceWei]) => ({ tokenId, priceWei }))
    .filter((l) => l.priceWei <= capWei)
    .sort((a, b) => (a.priceWei === b.priceWei ? a.tokenId - b.tokenId : a.priceWei < b.priceWei ? -1 : 1));
  const hash = keccak256(stringToHex(canonicalize({ capWei, listings, takenAtMs })));
  return { listings, capWei, takenAtMs, hash };
}

export function openPack(inp: PackInputs): Pack {
  invariant(inp.catalog.length > 0, "catalog is empty");
  const tiers = byTier(inp.catalog);
  const lookup = new Map(inp.catalog.map((c) => [c.tokenId, c]));
  const slots: PackSlot[] = [];

  for (let i = 0; i < 3; i++) {
    const c = regularDraw(inp, tiers, `regular${i}`);
    slots.push({ slot: "regular", index: i, tokenId: c.tokenId, tier: c.tier });
  }

  const owned = new Set(inp.ownedBackgrounds);
  const missing = [...inp.catalog].filter((c) => c.background !== null && !owned.has(c.background)).sort((a, b) => a.tokenId - b.tokenId);
  const helperRoll = pick(draw(inp.seed, inp.playerId, inp.packIndex, "helper:mode"), 10000);
  if (missing.length > 0 && helperRoll < CONFIG.odds.albumHelperBp) {
    const c = missing[pick(draw(inp.seed, inp.playerId, inp.packIndex, "helper:pick"), missing.length)]!;
    slots.push({ slot: "helper", index: 3, tokenId: c.tokenId, tier: c.tier, mode: "album" });
  } else {
    const c = regularDraw(inp, tiers, "helper");
    slots.push({ slot: "helper", index: 3, tokenId: c.tokenId, tier: c.tier, mode: "regular" });
  }

  if (!inp.hot || inp.hot.listings.length === 0) return { slots, hotSnapshotHash: inp.hot?.hash ?? null, hotMissing: true };
  const weights = hotWeights(inp.hot.listings.length);
  const total = weights.reduce((s, w) => s + w, 0n);
  let r = draw(inp.seed, inp.playerId, inp.packIndex, "hot") % total;
  let chosen = inp.hot.listings[inp.hot.listings.length - 1]!;
  for (let i = 0; i < weights.length; i++) { if (r < weights[i]!) { chosen = inp.hot.listings[i]!; break; } r -= weights[i]!; }
  const entry = lookup.get(chosen.tokenId);
  invariant(entry, `Hot listing ${chosen.tokenId} not in catalog`);
  slots.push({ slot: "hot", index: 4, tokenId: entry.tokenId, tier: entry.tier });
  return { slots, hotSnapshotHash: inp.hot.hash, hotMissing: false };
}
