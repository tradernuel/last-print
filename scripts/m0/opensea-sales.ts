/**
 * M0: download every OpenSea sale event for the collection (paged), to compare one by one with our SALE list.
 * Writes data/opensea/sale-events.json as [{tx, tokenId, time, price, symbol}].
 */
import { env, sleep, withRetry, writeJson } from "./lib.ts";

const KEY = env("OPENSEA_API_KEY");
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const out: { tx: string; tokenId: number; time: string; price: string | null; symbol: string | null }[] = [];
let next: string | null = null;
let pages = 0;
do {
  const url: string = `https://api.opensea.io/api/v2/events/collection/chog-genesis?event_type=sale&limit=50${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  const page: Any = await withRetry(async (): Promise<Any> => {
    const res: Response = await fetch(url, { headers: { accept: "application/json", "x-api-key": KEY } });
    if (!res.ok) throw new Error(`OpenSea events ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as Any;
  });
  for (const e of page.asset_events ?? []) {
    const p = e.payment;
    out.push({
      tx: String(e.transaction).toLowerCase(), tokenId: Number(e.nft?.identifier), time: new Date(Number(e.event_timestamp) * 1000).toISOString(),
      price: p ? (Number(BigInt(p.quantity) / 10n ** 14n) / 1e4).toString() : null, symbol: p?.symbol ?? null,
    });
  }
  next = page.next ?? null;
  if (++pages % 10 === 0) console.log(`OpenSea sale events: ${out.length} after ${pages} pages`);
  await sleep(500);
} while (next && pages < 200);
writeJson("opensea/sale-events.json", out);
console.log(`OpenSea sale events: ${out.length} in ${pages} pages`);
