/**
 * Recompute a past pack from the revealed seed and the stored inputs (spec §9.2).
 * Usage: node --experimental-strip-types scripts/verify-pack.ts <inputs.json>
 * inputs.json = { seed, playerId, packIndex, catalog[], ownedBackgrounds[], hot: {listings[], capWei, takenAtMs, hash} | null, expected: { slots[] } }
 */
import { readFileSync } from "node:fs";
import { buildHotSnapshot, openPack, canonicalize } from "../packages/core/src/index.ts";

const file = process.argv[2];
if (!file) { console.error("usage: verify-pack <inputs.json>"); process.exit(2); }
const raw = JSON.parse(readFileSync(file, "utf8"));
let hot = null;
if (raw.hot) {
  hot = buildHotSnapshot(raw.hot.listings.map((l: { tokenId: number; priceWei: string }) => ({ tokenId: l.tokenId, priceWei: BigInt(l.priceWei) })), BigInt(raw.hot.capWei), raw.hot.takenAtMs);
  if (hot.hash !== raw.hot.hash) { console.error(`FAIL: Hot snapshot hash ${hot.hash} != stored ${raw.hot.hash}`); process.exit(1); }
}
const pack = openPack({ seed: raw.seed, playerId: raw.playerId, packIndex: raw.packIndex, catalog: raw.catalog, ownedBackgrounds: raw.ownedBackgrounds, hot });
const ok = canonicalize(pack.slots) === canonicalize(raw.expected.slots);
console.log(ok ? "PASS" : "FAIL");
if (!ok) { console.error(JSON.stringify({ got: pack.slots, expected: raw.expected.slots }, null, 2)); process.exit(1); }
