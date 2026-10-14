import { describe, expect, it } from "vitest";
import { keccak256, toHex, type Hex } from "viem";
import { buildHotSnapshot, draw, hotWeights, openPack, seedCommitment, tierFromRoll, type CatalogEntry } from "../src/packs.ts";
import type { Tier } from "../src/config.ts";

const SEED = keccak256(toHex("unit-test-seed")) as Hex;
// Synthetic catalog for rule tests, shaped like the real tier counts (F11). Never used live.
const tiers: [Tier, number][] = [["Common", 1279], ["Uncommon", 590], ["Rare", 60], ["Epic", 30], ["Legendary", 10]];
const bgs = ["Light Purple", "Lemon", "Aqua", "Mon", "Gold", "Blood Red"];
let id = 1;
const CATALOG: CatalogEntry[] = tiers.flatMap(([tier, n]) => Array.from({ length: n }, () => ({ tokenId: id++, tier, background: tier === "Legendary" ? null : bgs[id % bgs.length]! })));
const listings = Array.from({ length: 40 }, (_, i) => ({ tokenId: i + 1, priceWei: BigInt(5000 + i * 50) * 10n ** 18n }));
const hot = buildHotSnapshot(listings, 6700n * 10n ** 18n, 1_760_000_000_000);
const inputs = (playerId: string, packIndex = 0, owned: string[] = []) => ({ seed: SEED, playerId, packIndex, catalog: CATALOG, ownedBackgrounds: owned, hot });

describe("packs", () => {
  it("same inputs give the same pack", () => {
    expect(openPack(inputs("p_a"))).toEqual(openPack(inputs("p_a")));
  });
  it("different players and pack indexes differ", () => {
    const a = JSON.stringify(openPack(inputs("p_a")).slots);
    expect(JSON.stringify(openPack(inputs("p_b")).slots)).not.toBe(a);
    expect(JSON.stringify(openPack(inputs("p_a", 1)).slots)).not.toBe(a);
  });
  it("pack has 3 regular, 1 helper, 1 hot", () => {
    expect(openPack(inputs("p_a")).slots.map((s) => s.slot)).toEqual(["regular", "regular", "regular", "helper", "hot"]);
  });
  it("tier boundaries", () => {
    expect(tierFromRoll(0)).toBe("Common"); expect(tierFromRoll(6149)).toBe("Common");
    expect(tierFromRoll(6150)).toBe("Uncommon"); expect(tierFromRoll(9149)).toBe("Uncommon");
    expect(tierFromRoll(9150)).toBe("Rare"); expect(tierFromRoll(9650)).toBe("Epic");
    expect(tierFromRoll(9889)).toBe("Epic"); expect(tierFromRoll(9890)).toBe("Legendary"); expect(tierFromRoll(9999)).toBe("Legendary");
  });
  it("regular tier frequencies match published odds within tolerance", () => {
    const counts: Record<string, number> = {};
    const N = 6000;
    for (let i = 0; i < N; i++) for (const s of openPack(inputs(`p_${i}`)).slots.filter((s) => s.slot === "regular")) counts[s.tier] = (counts[s.tier] ?? 0) + 1;
    const total = N * 3;
    expect(counts.Common! / total).toBeCloseTo(0.615, 1);
    expect(counts.Uncommon! / total).toBeCloseTo(0.30, 1);
    expect(Math.abs(counts.Legendary! / total - 0.011)).toBeLessThan(0.004);
  });
  it("album helper prefers missing Backgrounds", () => {
    let album = 0; const N = 2000;
    for (let i = 0; i < N; i++) {
      const s = openPack(inputs(`p_${i}`, 0, ["Light Purple", "Lemon", "Aqua", "Mon", "Gold"])).slots[3]!;
      if (s.mode === "album") { album++; expect(CATALOG.find((c) => c.tokenId === s.tokenId)!.background).toBe("Blood Red"); }
    }
    expect(album / N).toBeCloseTo(0.6, 1);
  });
  it("album helper falls back to a regular draw when every Background is owned", () => {
    const s = openPack(inputs("p_a", 0, bgs)).slots[3]!;
    expect(s.mode).toBe("regular");
  });
  it("no listings: pack opens without a Hot card", () => {
    const p = openPack({ ...inputs("p_a"), hot: null });
    expect(p.hotMissing).toBe(true); expect(p.slots).toHaveLength(4);
  });
  it("Hot draws favour the cheapest listings", () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 4000; i++) { const t = openPack(inputs(`p_${i}`)).slots[4]!.tokenId; counts.set(t, (counts.get(t) ?? 0) + 1); }
    expect(counts.get(1)!).toBeGreaterThan(counts.get(20) ?? 0);
    expect([...counts.keys()].every((t) => t <= 35)).toBe(true); // cap 6700 MON keeps ids 1..35
  });
  it("Hot snapshot dedupes to the lowest price, applies the cap, and hashes deterministically", () => {
    const s = buildHotSnapshot([{ tokenId: 5, priceWei: 9n }, { tokenId: 5, priceWei: 7n }, { tokenId: 6, priceWei: 100n }], 50n, 1);
    expect(s.listings).toEqual([{ tokenId: 5, priceWei: 7n }]);
    expect(buildHotSnapshot([{ tokenId: 5, priceWei: 7n }], 50n, 1).hash).toBe(s.hash);
    expect(() => buildHotSnapshot([{ tokenId: 1, priceWei: 0n }], 5n, 1)).toThrow();
  });
  it("hot weights are decreasing integers", () => {
    const w = hotWeights(10);
    for (let i = 1; i < w.length; i++) expect(w[i]! < w[i - 1]!).toBe(true);
  });
  it("seed commitment requires 32 bytes", () => {
    expect(seedCommitment(SEED)).toBe(keccak256(SEED));
    expect(() => seedCommitment("0x1234")).toThrow();
  });
  it("draw depends on every input", () => {
    const d = draw(SEED, "p", 0, "x");
    expect(draw(SEED, "p", 0, "y")).not.toBe(d);
    expect(draw(SEED, "p", 1, "x")).not.toBe(d);
    expect(draw(keccak256("0x01"), "p", 0, "x")).not.toBe(d);
  });
});
