/**
 * M0 check A5: does the OpenSea API key give Monad listings (token id + price), offers and sale events?
 * Writes data/opensea/probe.json (status codes, counts, parsed samples). Never writes the key.
 */
import { env, sleep, writeJson } from "./lib.ts";

const KEY = env("OPENSEA_API_KEY");
const BASE = "https://api.opensea.io/api/v2";
const SLUG = "chog-genesis";

async function get(path: string) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json", "x-api-key": KEY } });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* keep text */ }
  await sleep(600);
  return { path, status: res.status, ms: Date.now() - started, json, error: res.ok ? null : text.slice(0, 300), rateLimit: res.headers.get("x-ratelimit-remaining") };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const stats = await get(`/collections/${SLUG}/stats`);
const collection = await get(`/collections/${SLUG}`);
const listings = await get(`/listings/collection/${SLUG}/all?limit=100`);
const best = await get(`/listings/collection/${SLUG}/best?limit=100`);
const offers = await get(`/offers/collection/${SLUG}/all?limit=50`);
const events = await get(`/events/collection/${SLUG}?event_type=sale&limit=50`);

const parseListing = (l: Any) => {
  const offer = l?.protocol_data?.parameters?.offer?.[0];
  const cur = l?.price?.current;
  return { tokenId: offer?.identifierOrCriteria ?? null, token: offer?.token ?? null, currency: cur?.currency ?? null, value: cur?.value ?? null, decimals: cur?.decimals ?? null };
};
const summarize = (r: Awaited<ReturnType<typeof get>>, key: string, parse?: (x: Any) => unknown) => {
  const arr: Any[] = (r.json as Any)?.[key] ?? [];
  return { status: r.status, ms: r.ms, error: r.error, rateLimitRemaining: r.rateLimit, count: arr.length, hasNext: Boolean((r.json as Any)?.next), samples: arr.slice(0, 3).map(parse ?? ((x) => x)) };
};

writeJson("opensea/probe.json", {
  ranAt: new Date().toISOString(),
  stats: { status: stats.status, error: stats.error, total: (stats.json as Any)?.total ?? null },
  collection: { status: collection.status, error: collection.error, contracts: (collection.json as Any)?.contracts ?? null, fees: (collection.json as Any)?.fees ?? null },
  listingsAll: summarize(listings, "listings", parseListing),
  listingsBest: summarize(best, "listings", parseListing),
  offers: summarize(offers, "offers", (o: Any) => ({ value: o?.price?.value ?? null, currency: o?.price?.currency ?? null, criteria: o?.criteria ? "collection/trait" : "item" })),
  saleEvents: summarize(events, "asset_events", (e: Any) => ({ tokenId: e?.nft?.identifier ?? null, tx: e?.transaction ?? null, quantity: e?.quantity ?? null, payment: e?.payment ?? null, time: e?.event_timestamp ?? null })),
});
console.log("opensea probe:", [stats, collection, listings, best, offers, events].map((r) => `${r.path.split("?")[0]} ${r.status}`).join(" | "));
