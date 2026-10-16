/**
 * Builds the static data the web app reads (apps/web/public/data) from the committed real data in data/.
 * Every number written here traces to a chain event (tx hash) or the metadata mirror.
 * Run: node --experimental-strip-types scripts/build-web-data.ts
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = <T,>(p: string): T => JSON.parse(readFileSync(new URL(p, root), "utf8")) as T;
const out = new URL("apps/web/public/data/", root);
rmSync(out, { recursive: true, force: true });
mkdirSync(new URL("chog/", out), { recursive: true });
const write = (p: string, v: unknown) => writeFileSync(new URL(p, out), JSON.stringify(v));

interface Ev { tx: string; block: string; time: string; tokenId: number; from: string; to: string; class: string; price?: string | null; asset?: string; route?: string }
interface Meta { tokenId: number; name: string; attributes: { trait_type: string; value: string }[] }

const events = read<Ev[]>("data/chain/events.json");
const metas = read<Meta[]>("data/metadata/chogs.json");
const backfill = read<{ ranAt: string; hypersyncHeight: number }>("data/chain/backfill-summary.json");
let bgColours: Record<string, { hex: string }> = {};
try { bgColours = read("data/art/backgrounds.json"); } catch { /* art not mirrored yet */ }

// Only traits with plain, reviewed-safe values are shown until config/traits_clean.json is reviewed (spec §17.4).
const SAFE_TRAITS = ["Tier", "Background", "Base", "Form", "Side"];
const trait = (m: Meta, t: string) => m.attributes.find((a) => a.trait_type === t)?.value ?? null;

const byToken = new Map<number, Ev[]>();
for (const e of events) { const l = byToken.get(e.tokenId) ?? []; l.push(e); byToken.set(e.tokenId, l); }

const round = (p: string | null | undefined) => (p == null ? null : Math.round(Number(p)));
const index = metas.map((m) => {
  const evs = byToken.get(m.tokenId) ?? [];
  const sales = evs.filter((e) => e.class === "SALE");
  const owners = new Set(evs.map((e) => e.to.toLowerCase()));
  const last = evs[evs.length - 1];
  const lastOwnerChange = [...evs].reverse().find((e) => e.from.toLowerCase() !== e.to.toLowerCase());
  const title = m.name.includes("—") ? m.name.split("—")[1]!.trim() : null;
  const detail = {
    tokenId: m.tokenId, name: m.name, title,
    traits: Object.fromEntries(SAFE_TRAITS.map((t) => [t, trait(m, t)]).filter(([, v]) => v !== null)),
    edition: 1 + sales.length,
    owner: last?.to ?? null,
    ownerSince: lastOwnerChange?.time ?? null,
    owners: owners.size,
    timeline: evs.map((e) => ({
      kind: e.class === "MINT" ? "mint" : e.class === "SALE" ? "sale" : "move",
      cls: e.class, time: e.time, tx: e.tx, from: e.from, to: e.to,
      ...(e.class === "SALE" ? { price: round(e.price), asset: e.asset, route: e.route } : {}),
    })),
  };
  write(`chog/${m.tokenId}.json`, detail);
  const lastSale = sales[sales.length - 1];
  return {
    id: m.tokenId, n: m.name, ti: title, t: trait(m, "Tier"), bg: trait(m, "Background"),
    e: detail.edition, s: sales.length, ls: lastSale?.time ?? null, lp: round(lastSale?.price),
  };
});
write("chogs.json", index);

const nameOf = new Map(metas.map((m) => [m.tokenId, m.name]));
const editionAt = new Map<number, number>();
const feed: unknown[] = [];
for (const e of events) {
  if (e.class !== "SALE") continue;
  const n = (editionAt.get(e.tokenId) ?? 1);
  editionAt.set(e.tokenId, n + 1);
  feed.push({ id: e.tokenId, n: nameOf.get(e.tokenId), time: e.time, tx: e.tx, price: round(e.price), asset: e.asset, closed: n, next: n + 1 });
}
write("feed.json", feed.slice(-80).reverse());

const salesTotal = events.filter((e) => e.class === "SALE").length;
write("meta.json", {
  generatedAt: new Date().toISOString(), dataAsOf: events[events.length - 1]?.time ?? null, backfillRanAt: backfill.ranAt,
  height: backfill.hypersyncHeight, transfers: events.length, sales: salesTotal, chogs: metas.length,
  backgrounds: Object.fromEntries(Object.entries(bgColours).map(([k, v]) => [k, v.hex])),
  sources: ["Monad mainnet (HyperSync + rpc.monad.xyz)", "Chog Genesis metadata on IPFS", "OpenSea API"],
});
console.log(`web data: ${index.length} chogs, ${feed.length} sales, as of ${events[events.length - 1]?.time}`);
