/** Builds docs/audit/M0-data.md from data/ (checks A3, A4, A5 and the spec facts F7, F8, F11, F15, F18, F19). */
import { writeFileSync } from "node:fs";
import { ROOT, readJson } from "./lib.ts";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Ev { tx: string; block: string; time: string; tokenId: number; class: string; rule: string; txTo: string | null; route?: string; price?: string | null; asset?: string; bundleSize?: number }

const lines: string[] = [];
const L = (s = "") => lines.push(s);
const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${(((a - b) / b) * 100).toFixed(1)}%`);
const verdict = (ok: boolean) => (ok ? "**PASS**" : "**CHECK**");

const summary = readJson<Any>("chain/backfill-summary.json");
const events = readJson<Ev[]>("chain/events.json") ?? [];
const meta = readJson<Any>("metadata/summary.json");
const os = readJson<Any>("opensea/probe.json");

L("# M0 data report (generated)");
L();
L(`Generated ${new Date().toISOString()} by \`scripts/m0/report.ts\`. Raw data is in \`data/\`.`);
L();

L("## A3/A4: backfill");
if (!summary) L("Backfill did not complete. See the workflow log.");
else {
  L(`- ${summary.transfers} Chog transfers since block ${summary.startBlock}, fetched in ${summary.seconds} s. ${verdict(summary.seconds < 1800)}`);
  L(`- Tokens minted: ${summary.distinctTokensMinted} (expected 1,969). ${verdict(summary.distinctTokensMinted === 1969)}`);
  L(`- First mint: block ${summary.firstMint?.block} at ${summary.firstMint?.time} (spec F7: ≈ 101,704,044, 2026-09-03 19:58 UTC).`);
  L(`- By class: ${Object.entries(summary.byClass).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}
L();

const sales = events.filter((e) => e.class === "SALE");
L("## Sales vs OpenSea (F15)");
const osSales = os?.stats?.total?.sales ?? null;
if (osSales !== null) L(`- Our SALE count ${sales.length} vs OpenSea all-time sales ${osSales} (diff ${pct(sales.length, osSales)}). Target ±1%: ${verdict(Math.abs(sales.length - osSales) <= Math.ceil(osSales * 0.01))}`);
else L(`- Our SALE count ${sales.length}. OpenSea stats unavailable (see A5).`);
L();

L("## 14-day window 2026-09-29 to 2026-10-13 (F18, F19)");
const win = sales.filter((e) => e.time >= "2026-09-29T00:00:00Z" && e.time < "2026-10-13T00:00:00Z");
const perDay = new Map<string, number>();
for (const e of win) perDay.set(e.time.slice(0, 10), (perDay.get(e.time.slice(0, 10)) ?? 0) + 1);
const listingBuys = win.filter((e) => e.route === "LISTING_BOUGHT");
L(`- Sales ${win.length} (spec 126), listing buys ${listingBuys.length} (spec 104), offers accepted ${win.length - listingBuys.length} (spec 22), distinct Chogs ${new Set(win.map((e) => e.tokenId)).size}.`);
L(`- Fewest sales in a day: ${perDay.size ? Math.min(...perDay.values()) : 0} over ${perDay.size} days (spec: never fewer than 2).`);
const prices = listingBuys.map((e) => Number(e.price)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
const q = (p: number) => (prices.length ? prices[Math.min(prices.length - 1, Math.floor(p * prices.length))]!.toFixed(0) : "n/a");
L(`- Listing-buy prices: p25 ${q(0.25)}, median ${q(0.5)}, p75 ${q(0.75)} MON (spec 4,999 / ≈5,452 / ≈6,700).`);
L();

L("## Review lists");
const unclassified = events.filter((e) => e.class === "UNCLASSIFIED");
const nominal = events.filter((e) => e.class === "NOMINAL_PRICE_MOVE");
const byTo = new Map<string, number>();
for (const e of unclassified) byTo.set(e.txTo ?? "null", (byTo.get(e.txTo ?? "null") ?? 0) + 1);
L(`- UNCLASSIFIED: ${unclassified.length} transfers. By tx.to: ${[...byTo].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} (${v})`).join(", ") || "none"}`);
L(`- NOMINAL_PRICE_MOVE: ${nominal.length}. Examples: ${nominal.slice(0, 5).map((e) => `${e.tx.slice(0, 12)}… ${e.price} ${e.asset}`).join("; ") || "none"}`);
L(`- Bundles without per-item price: ${sales.filter((e) => e.price === null).length}`);
L();

L("## Metadata (F8, F11)");
if (!meta) L("Metadata mirror did not complete.");
else {
  const want: Record<number, string> = { 1: "CHOG #1462", 1021: "CHOG #513", 1864: "CHOG #1356" };
  for (const s of meta.nameSamples) L(`- Token ${s.tokenId}: "${s.name}" (expected "${want[s.tokenId]}") ${verdict(s.name === want[s.tokenId])}`);
  L(`- totalSupply ${meta.totalSupply}, metadata files ${meta.tokens}. ${verdict(meta.tokens === 1969)}`);
  L(`- Tiers: ${JSON.stringify(meta.tiers)} (spec: Common 1279, Uncommon 590, Rare 60, Epic 30, Legendary 10)`);
  L(`- Trait types: ${Object.entries(meta.traitTypes).map(([k, v]: [string, Any]) => `${k} ${v.distinct} values on ${v.onTokens}`).join("; ")}`);
}
L();

L("## A5: OpenSea API");
if (!os) L("Probe did not run.");
else {
  for (const k of ["listingsAll", "listingsBest", "offers", "saleEvents"]) {
    const r = os[k];
    L(`- ${k}: HTTP ${r.status}, ${r.count} items${r.hasNext ? " (more pages)" : ""}, ${r.ms} ms${r.error ? `, error: ${r.error}` : ""}`);
    if (r.samples?.length) L(`  - sample: \`${JSON.stringify(r.samples[0])}\``);
  }
  L(`- Stats HTTP ${os.stats.status}; floor ${os.stats.total?.floor_price ?? "n/a"} ${os.stats.total?.floor_price_symbol ?? ""}, owners ${os.stats.total?.num_owners ?? "n/a"}.`);
}
L();

writeFileSync(new URL("docs/audit/M0-data.md", ROOT), lines.join("\n") + "\n");
console.log(lines.join("\n"));
