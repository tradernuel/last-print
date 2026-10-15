/**
 * M0 metadata mirror (spec §15, F8-F13): tokenURI for every minted token, then the JSON from IPFS.
 * Resumable: progress is saved to data/metadata/partial.json, so a re-run only fetches what's missing.
 * Writes data/metadata/chogs.json when all tokens are in. Images are mirrored later with hosting (A10).
 */
import { parseAbi } from "viem";
import { CONFIG } from "../../packages/core/src/index.ts";
import { pool, readJson, rpc, sleep, withRetry, writeJson } from "./lib.ts";

const events = readJson<{ class: string; tokenId: number }[]>("chain/events.json");
if (!events) throw new Error("run backfill.ts first");
const tokenIds = [...new Set(events.filter((e) => e.class === "MINT").map((e) => e.tokenId))].sort((a, b) => a - b);

// Several gateways, in path and subdomain style; each token starts at a different one to spread the load.
const GATEWAYS: ((cid: string, rest: string) => string)[] = [
  (c, r) => `https://${c}.ipfs.4everland.io/${r}`,
  (c, r) => `https://4everland.io/ipfs/${c}/${r}`,
  (c, r) => `https://${c}.ipfs.dweb.link/${r}`,
  (c, r) => `https://ipfs.io/ipfs/${c}/${r}`,
  (c, r) => `https://gateway.pinata.cloud/ipfs/${c}/${r}`,
  (c, r) => `https://${c}.ipfs.w3s.link/${r}`,
  (c, r) => `https://nftstorage.link/ipfs/${c}/${r}`,
];
const gatewayWins = new Map<number, number>();
const errors: Record<string, number> = {};

interface Meta { name: string; image: string; attributes: { trait_type: string; value: string }[] }
interface Entry { tokenId: number; uri: string; meta: Meta }

const client = rpc();
const abi = parseAbi(["function tokenURI(uint256) view returns (string)", "function totalSupply() view returns (uint256)"]);
const totalSupply = await withRetry(() => client.readContract({ address: CONFIG.chog, abi, functionName: "totalSupply" }));

let uris = readJson<Record<string, string>>("metadata/uris.json") ?? {};
const needUri = tokenIds.filter((id) => !uris[id]);
console.log(`${tokenIds.length} tokens, totalSupply ${totalSupply}, ${needUri.length} tokenURIs to read`);
const got = await pool(needUri, 6, (id) => withRetry(() => client.readContract({ address: CONFIG.chog, abi, functionName: "tokenURI", args: [BigInt(id)] })), "tokenURI");
needUri.forEach((id, i) => { uris[id] = got[i]!; });
writeJson("metadata/uris.json", uris);
console.log(`sample tokenURIs: ${[1, 1021, 1864].map((id) => `${id} → ${uris[id]}`).join(" | ")}`);

async function fetchIpfs(uri: string, start: number): Promise<Meta> {
  if (!uri.startsWith("ipfs://")) throw new Error(`unexpected tokenURI scheme: ${uri}`);
  const [cid, ...rest] = uri.slice("ipfs://".length).split("/");
  for (let round = 0; round < 4; round++) {
    for (let k = 0; k < GATEWAYS.length; k++) {
      const g = (start + k) % GATEWAYS.length;
      const url = GATEWAYS[g]!(cid!, rest.join("/"));
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
        if (!res.ok) { errors[`${new URL(url).host.replace(cid!, "<cid>")} ${res.status}`] = (errors[`${new URL(url).host.replace(cid!, "<cid>")} ${res.status}`] ?? 0) + 1; continue; }
        const json = (await res.json()) as Meta;
        gatewayWins.set(g, (gatewayWins.get(g) ?? 0) + 1);
        return json;
      } catch (e) {
        const key = `${new URL(url).host.replace(cid!, "<cid>")} ${(e as Error).name}`;
        errors[key] = (errors[key] ?? 0) + 1;
      }
    }
    await sleep(3000 * (round + 1));
  }
  throw new Error(`all gateways failed for ${uri}`);
}

const partial = new Map<number, Entry>((readJson<Entry[]>("metadata/partial.json") ?? []).map((e) => [e.tokenId, e]));
const todo = tokenIds.filter((id) => !partial.has(id));
console.log(`${partial.size} already mirrored, ${todo.length} to fetch`);
let sinceSave = 0;
const failed: number[] = [];
await pool(todo, 5, async (id, i) => {
  try {
    const meta = await fetchIpfs(uris[id]!, i);
    partial.set(id, { tokenId: id, uri: uris[id]!, meta });
  } catch { failed.push(id); }
  if (++sinceSave >= 100) { sinceSave = 0; writeJson("metadata/partial.json", [...partial.values()]); }
}, "metadata");
writeJson("metadata/partial.json", [...partial.values()]);
console.log("gateway successes:", Object.fromEntries([...gatewayWins].map(([g, n]) => [GATEWAYS[g]!("<cid>", "").split("/")[2], n])));
console.log("gateway errors:", errors);

if (failed.length) {
  writeJson("metadata/summary.json", { ranAt: new Date().toISOString(), totalSupply: totalSupply.toString(), tokens: partial.size, failed: failed.length, errors, complete: false });
  throw new Error(`${failed.length} tokens still missing; re-run the workflow with skip_backfill to resume`);
}

const chogs = tokenIds.map((id) => {
  const { uri, meta } = partial.get(id)!;
  if (typeof meta.name !== "string" || !Array.isArray(meta.attributes)) throw new Error(`token ${id}: malformed metadata`);
  return { tokenId: id, name: meta.name, image: meta.image, uri, attributes: meta.attributes.map((a) => ({ trait_type: String(a.trait_type), value: String(a.value) })) };
});
writeJson("metadata/chogs.json", chogs);

const traitCounts: Record<string, Record<string, number>> = {};
for (const c of chogs) for (const a of c.attributes) {
  traitCounts[a.trait_type] ??= {};
  traitCounts[a.trait_type]![a.value] = (traitCounts[a.trait_type]![a.value] ?? 0) + 1;
}
writeJson("metadata/summary.json", {
  ranAt: new Date().toISOString(), totalSupply: totalSupply.toString(), tokens: chogs.length, complete: true,
  nameSamples: [1, 1021, 1864].map((id) => ({ tokenId: id, name: chogs.find((c) => c.tokenId === id)?.name ?? null })),
  traitTypes: Object.fromEntries(Object.entries(traitCounts).map(([k, v]) => [k, { distinct: Object.keys(v).length, onTokens: Object.values(v).reduce((s, n) => s + n, 0) }])),
  tiers: traitCounts["Tier"] ?? null, bases: traitCounts["Base"] ?? null, backgrounds: traitCounts["Background"] ?? null,
});
console.log("metadata done");
