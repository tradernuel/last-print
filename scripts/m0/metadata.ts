/**
 * M0 metadata mirror (spec §15, F8-F13): tokenURI for every minted token, then the JSON from IPFS.
 * Writes data/metadata/chogs.json. Images are mirrored later with hosting (A10); they are too large for git.
 */
import { parseAbi } from "viem";
import { CONFIG } from "../../packages/core/src/index.ts";
import { pool, readJson, rpc, sleep, withRetry, writeJson } from "./lib.ts";

const GATEWAYS = ["https://4everland.io/ipfs/", "https://gateway.pinata.cloud/ipfs/"];
const events = readJson<{ class: string; tokenId: number }[]>("chain/events.json");
if (!events) throw new Error("run backfill.ts first");
const tokenIds = [...new Set(events.filter((e) => e.class === "MINT").map((e) => e.tokenId))].sort((a, b) => a - b);
console.log(`${tokenIds.length} tokens`);

const client = rpc();
const abi = parseAbi(["function tokenURI(uint256) view returns (string)", "function totalSupply() view returns (uint256)"]);
const totalSupply = await withRetry(() => client.readContract({ address: CONFIG.chog, abi, functionName: "totalSupply" }));
const uris = await pool(tokenIds, 6, (id) => withRetry(() => client.readContract({ address: CONFIG.chog, abi, functionName: "tokenURI", args: [BigInt(id)] })), "tokenURI");

async function fetchIpfs(uri: string): Promise<unknown> {
  if (!uri.startsWith("ipfs://")) throw new Error(`unexpected tokenURI scheme: ${uri}`);
  const path = uri.slice("ipfs://".length);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const gw of GATEWAYS) {
      try {
        const res = await fetch(gw + path, { signal: AbortSignal.timeout(20_000) });
        if (res.ok) return await res.json();
        lastErr = new Error(`${gw} ${res.status}`);
      } catch (e) { lastErr = e; }
    }
    await sleep(2000 * 2 ** attempt);
  }
  throw new Error(`failed to fetch ${uri}: ${String(lastErr)}`);
}

interface Meta { name: string; image: string; attributes: { trait_type: string; value: string }[] }
const metas = await pool(tokenIds, 8, async (id, i) => ({ tokenId: id, uri: uris[i]!, meta: (await fetchIpfs(uris[i]!)) as Meta }), "metadata");

const chogs = metas.map(({ tokenId, uri, meta }) => {
  if (typeof meta.name !== "string" || !Array.isArray(meta.attributes)) throw new Error(`token ${tokenId}: malformed metadata`);
  return { tokenId, name: meta.name, image: meta.image, uri, attributes: meta.attributes.map((a) => ({ trait_type: String(a.trait_type), value: String(a.value) })) };
});
writeJson("metadata/chogs.json", chogs);

const traitCounts: Record<string, Record<string, number>> = {};
for (const c of chogs) for (const a of c.attributes) {
  traitCounts[a.trait_type] ??= {};
  traitCounts[a.trait_type]![a.value] = (traitCounts[a.trait_type]![a.value] ?? 0) + 1;
}
writeJson("metadata/summary.json", {
  ranAt: new Date().toISOString(), totalSupply: totalSupply.toString(), tokens: chogs.length,
  nameSamples: [1, 1021, 1864].map((id) => ({ tokenId: id, name: chogs.find((c) => c.tokenId === id)?.name ?? null })),
  traitTypes: Object.fromEntries(Object.entries(traitCounts).map(([k, v]) => [k, { distinct: Object.keys(v).length, onTokens: Object.values(v).reduce((s, n) => s + n, 0) }])),
  tiers: traitCounts["Tier"] ?? null, bases: traitCounts["Base"] ?? null,
});
console.log("metadata done");
