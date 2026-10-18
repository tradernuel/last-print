import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { keccak256, toHex, zeroHash, type Hex } from "viem";
import {
  buildHotSnapshot, buildTree, computeFoils, computeStats, openPack, planDuel, proofFor, pullLeaf, runDuel, CONFIG,
  type DuelCard, type Stats,
  type CatalogEntry, type Foil, type HotSnapshot, type Listing, type Tier,
} from "../../packages/core/src/index.ts";
import { ROOT } from "./config.ts";
import { tx, type DB } from "./db.ts";

// ---------- catalog (real metadata mirror) ----------
interface Meta { tokenId: number; name: string; attributes: { trait_type: string; value: string }[] }
const metas: Meta[] = JSON.parse(readFileSync(new URL("data/metadata/chogs.json", ROOT), "utf8"));
const attr = (m: Meta, t: string) => m.attributes.find((a) => a.trait_type === t)?.value ?? null;
export const CATALOG: CatalogEntry[] = metas.map((m) => ({ tokenId: m.tokenId, tier: attr(m, "Tier") as Tier, background: attr(m, "Background") }));
export const NAMES = new Map(metas.map((m) => [m.tokenId, m.name]));
if (CATALOG.length !== 1969 || CATALOG.some((c) => !c.tier)) throw new Error("catalog incomplete: run the m0-data workflow first");

export const dayOf = (ms: number) => Number(new Date(ms).toISOString().slice(0, 10).replaceAll("-", ""));
export const newId = () => toHex(randomBytes(32));

// ---------- chain-derived state ----------
export function edition(db: DB, tokenId: number): number {
  const r = db.prepare("SELECT edition FROM editions WHERE token_id = ?").get(tokenId) as { edition: number } | undefined;
  return r?.edition ?? 1;
}

interface EvRow { block: number; time_ms: number; from_addr: string; to_addr: string; class: string }
export function chogState(db: DB, tokenId: number, nowMs: number, listed: boolean) {
  const evs = db.prepare("SELECT block, time_ms, from_addr, to_addr, class FROM events WHERE token_id = ? ORDER BY block, tx_index, log_index").all(tokenId) as unknown as EvRow[];
  if (evs.length === 0) throw new Error(`no chain history for token ${tokenId}`);
  const mint = evs.find((e) => e.class === "MINT");
  if (!mint) throw new Error(`no mint event for token ${tokenId}`);
  const last = evs[evs.length - 1]!;
  const lastChange = [...evs].reverse().find((e) => e.from_addr.toLowerCase() !== e.to_addr.toLowerCase())!;
  const sales = evs.filter((e) => e.class === "SALE");
  return {
    minter: mint.to_addr as Hex, owner: last.to_addr as Hex, ownerSinceMs: lastChange.time_ms,
    lastSaleMs: sales.length ? sales[sales.length - 1]!.time_ms : null, listed, nowMs,
  };
}

/** $CHOG balances of current owners, refreshed by the chogBalances worker (null until the first read finishes). */
export const auraSource: { get: () => { threshold: bigint | null; holders: Map<string, bigint> } } = { get: () => ({ threshold: null, holders: new Map() }) };

/** Foils from real state at pull time, including $CHOG Aura from the owner's real $CHOG balance. */
export function foilsFor(db: DB, tokenId: number, nowMs: number, listed: boolean): Foil[] {
  const s = chogState(db, tokenId, nowMs, listed);
  const isLegend = CATALOG.find((c) => c.tokenId === tokenId)!.tier === "Legendary";
  const t = CONFIG.foils;
  const aura = auraSource.get();
  return computeFoils(
    { ...s, minter: s.minter, owner: s.owner, ownerChogBalance: aura.holders.get(s.owner.toLowerCase()) ?? 0n, isLegend },
    { longHoldDays: t.longHoldDays, freshHours: t.freshHours, chogAuraMinBalance: aura.threshold ?? 2n ** 255n },
  );
}

/** Hot cap: 75th percentile of listing-buy prices in the last 14 days (spec §6.6), from our own sale records. */
export function hotCapWei(db: DB, nowMs: number): bigint {
  const rows = db.prepare("SELECT price FROM events WHERE class = 'SALE' AND route = 'LISTING_BOUGHT' AND time_ms >= ? AND price IS NOT NULL")
    .all(nowMs - 14 * 86_400_000) as { price: string }[];
  if (rows.length < 10) throw new Error(`only ${rows.length} listing buys in 14 days; cannot set the Hot cap`);
  const sorted = rows.map((r) => Number(r.price)).sort((a, b) => a - b);
  const p75 = sorted[Math.floor(0.75 * (sorted.length - 1))]!;
  return BigInt(Math.round(p75)) * 10n ** 18n;
}

// ---------- packs ----------
export interface PulledCard {
  cardId: Hex; tokenId: number; name: string; tier: Tier; edition: number; printNo: number; pulledMs: number;
  slot: string; foils: Foil[]; hot: { priceMon: number } | null;
}

export class PackError extends Error {
  code: "SEED_COMMIT_FAIL" | "ALREADY_OPENED" | "UNKNOWN_PLAYER";
  constructor(code: PackError["code"], msg: string) { super(msg); this.code = code; }
}

/** Packs a player may open today: the free daily pack (index 0), plus one bonus pack (index 1) for winning today's Duel. */
export function packsAllowed(db: DB, playerId: Hex, day: number): number {
  const won = db.prepare("SELECT won FROM duels WHERE player_id = ? AND day = ?").get(playerId, day) as { won: number } | undefined;
  return 1 + (won?.won ? 1 : 0);
}
export function packsOpened(db: DB, playerId: Hex, day: number): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM packs WHERE player_id = ? AND day = ?").get(playerId, day) as { n: number }).n;
}

export function openPackFor(db: DB, playerId: Hex, nowMs: number, listings: Listing[] | null): { day: number; packIndex: number; cards: PulledCard[]; hotMissing: boolean } {
  const day = dayOf(nowMs);
  if (!db.prepare("SELECT 1 FROM players WHERE id = ?").get(playerId)) throw new PackError("UNKNOWN_PLAYER", "Unknown player.");
  const seedRow = db.prepare("SELECT seed, commit_block FROM seeds WHERE day = ?").get(day) as { seed: Hex; commit_block: number | null } | undefined;
  if (seedRow?.commit_block == null) throw new PackError("SEED_COMMIT_FAIL", "Today's packs open in a moment.");
  const packIndex = packsOpened(db, playerId, day);
  if (packIndex >= packsAllowed(db, playerId, day)) throw new PackError("ALREADY_OPENED", packIndex >= 2
    ? "You've opened today's packs. New ones arrive at 00:00 UTC."
    : "You've opened today's pack. Win today's Duel for a bonus pack, or come back at 00:00 UTC.");

  let hot: HotSnapshot | null = null;
  if (listings && listings.length) hot = buildHotSnapshot(listings, hotCapWei(db, nowMs), nowMs);
  const owned = (db.prepare(`SELECT DISTINCT token_id FROM cards WHERE player_id = ?`).all(playerId) as { token_id: number }[]).map((r) => r.token_id);
  const ownedBg = [...new Set(owned.map((id) => CATALOG.find((c) => c.tokenId === id)!.background).filter((b): b is string => b !== null))];
  const pack = openPack({ seed: seedRow.seed, playerId, packIndex, catalog: CATALOG, ownedBackgrounds: ownedBg, hot });
  const listed = new Set((listings ?? []).map((l) => l.tokenId));
  const snapshotHash = (hot?.hash ?? zeroHash) as Hex;

  return tx(db, () => {
    if (hot) db.prepare("INSERT OR IGNORE INTO hot_snapshots (hash, taken_ms, cap_wei, listings) VALUES (?, ?, ?, ?)")
      .run(hot.hash, hot.takenAtMs, hot.capWei.toString(), JSON.stringify(hot.listings.map((l) => [l.tokenId, l.priceWei.toString()])));
    const cards = pack.slots.map((s, i) => {
      const pulledMs = nowMs + i; // distinct, ordered pull times within one pack
      return recordPull(db, { playerId, tokenId: s.tokenId, slot: s.slot, pulledMs, day, packIndex,
        foils: foilsFor(db, s.tokenId, pulledMs, listed.has(s.tokenId)), snapshotHash: s.slot === "hot" ? snapshotHash : zeroHash,
        hotPriceWei: s.slot === "hot" ? hot!.listings.find((l) => l.tokenId === s.tokenId)!.priceWei : null });
    });
    db.prepare("INSERT INTO packs (player_id, day, pack_index, opened_ms, slots, hot_snapshot) VALUES (?, ?, ?, ?, ?, ?)")
      .run(playerId, day, packIndex, nowMs, JSON.stringify(pack.slots), hot?.hash ?? null);
    if (packIndex === 0) bumpStreak(db, playerId, day);
    return { day, packIndex, cards, hotMissing: pack.hotMissing };
  });
}

function recordPull(db: DB, p: { playerId: Hex; tokenId: number; slot: string; pulledMs: number; day: number; packIndex: number; foils: Foil[]; snapshotHash: Hex; hotPriceWei: bigint | null }): PulledCard {
  const ed = edition(db, p.tokenId);
  db.prepare("INSERT INTO print_counters (token_id, edition, n) VALUES (?, ?, 1) ON CONFLICT(token_id, edition) DO UPDATE SET n = n + 1").run(p.tokenId, ed);
  const printNo = (db.prepare("SELECT n FROM print_counters WHERE token_id = ? AND edition = ?").get(p.tokenId, ed) as { n: number }).n;
  const cardId = newId();
  const leaf = pullLeaf({ cardId, tokenId: BigInt(p.tokenId), edition: ed, printNo, playerId: p.playerId, pulledAtMs: BigInt(p.pulledMs), snapshotHash: p.snapshotHash });
  db.prepare(`INSERT INTO cards (card_id, player_id, token_id, edition, print_no, pulled_ms, slot, foils, snapshot_hash, leaf, day, pack_index)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(cardId, p.playerId, p.tokenId, ed, printNo, p.pulledMs, p.slot, JSON.stringify(p.foils), p.snapshotHash, leaf, p.day, p.packIndex);
  const meta = CATALOG.find((c) => c.tokenId === p.tokenId)!;
  return { cardId, tokenId: p.tokenId, name: NAMES.get(p.tokenId)!, tier: meta.tier, edition: ed, printNo, pulledMs: p.pulledMs, slot: p.slot, foils: p.foils,
    hot: p.hotPriceWei === null ? null : { priceMon: Number(p.hotPriceWei / 10n ** 18n) } };
}

function bumpStreak(db: DB, playerId: Hex, day: number) {
  const r = db.prepare("SELECT streak, last_day FROM players WHERE id = ?").get(playerId) as { streak: number; last_day: string | null };
  const yesterday = dayOf(Date.UTC(Math.floor(day / 10000), Math.floor(day / 100) % 100 - 1, day % 100) - 86_400_000);
  const streak = r.last_day && Number(r.last_day) === yesterday ? r.streak + 1 : 1;
  db.prepare("UPDATE players SET streak = ?, last_day = ? WHERE id = ?").run(streak, String(day), playerId);
}

// ---------- pull roots ----------
export function nextRootBatch(db: DB) {
  const rows = db.prepare("SELECT leaf, pulled_ms FROM cards WHERE root IS NULL AND superseded_by IS NULL ORDER BY pulled_ms LIMIT 4096").all() as { leaf: Hex; pulled_ms: number }[];
  if (rows.length === 0) return null;
  const leaves = rows.map((r) => r.leaf);
  return { root: buildTree(leaves).root, leaves, fromMs: rows[0]!.pulled_ms, toMs: rows[rows.length - 1]!.pulled_ms };
}
export function confirmRoot(db: DB, b: { root: Hex; leaves: Hex[]; fromMs: number; toMs: number }, txHash: Hex, block: bigint) {
  tx(db, () => {
    db.prepare("INSERT INTO roots (root, from_ms, to_ms, count, tx, block, leaves, created_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(b.root, b.fromMs, b.toMs, b.leaves.length, txHash, Number(block), JSON.stringify(b.leaves), Date.now());
    const upd = db.prepare("UPDATE cards SET root = ? WHERE leaf = ? AND root IS NULL");
    for (const l of b.leaves) upd.run(b.root, l);
  });
}

// ---------- editions and Last Prints (spec §10 with decisions D1, D2, D4, D9) ----------
export interface SaleRow { tx: Hex; logIndex: number; block: number; timeMs: number; tokenId: number; from: string; to: string; price: string | null; asset: string | null }
export interface CloseResult {
  tokenId: number; edition: number; outcome: "CROWNED" | "UNCLAIMED" | "SELF_SALE_NOT_CROWNED";
  winner: { cardId: Hex; playerId: Hex; printNo: number; pulledMs: number; snapshotHash: Hex; leaf: Hex; root: Hex; rootBlock: number; proof: Hex[] } | null;
}

export function closeEdition(db: DB, s: SaleRow): CloseResult {
  return tx(db, () => {
    const n = edition(db, s.tokenId);
    if (db.prepare("SELECT 1 FROM edition_closes WHERE token_id = ? AND edition = ?").get(s.tokenId, n)) throw new Error(`edition ${n} of ${s.tokenId} already closed`);
    const selfSale = s.from.toLowerCase() === s.to.toLowerCase();
    const cand = db.prepare(`
      SELECT c.card_id, c.player_id, c.print_no, c.pulled_ms, c.snapshot_hash, c.leaf, c.root, r.block AS root_block
      FROM cards c JOIN roots r ON r.root = c.root
      WHERE c.token_id = ? AND c.edition = ? AND c.superseded_by IS NULL AND c.pulled_ms < ? AND r.block < ?
      ORDER BY c.pulled_ms DESC, c.print_no ASC LIMIT 1`).get(s.tokenId, n, s.timeMs, s.block) as
      { card_id: Hex; player_id: Hex; print_no: number; pulled_ms: number; snapshot_hash: Hex; leaf: Hex; root: Hex; root_block: number } | undefined;

    let outcome: CloseResult["outcome"] = selfSale ? "SELF_SALE_NOT_CROWNED" : cand ? "CROWNED" : "UNCLAIMED";
    let winner: CloseResult["winner"] = null;
    if (outcome === "CROWNED" && cand) {
      const leaves = JSON.parse((db.prepare("SELECT leaves FROM roots WHERE root = ?").get(cand.root) as { leaves: string }).leaves) as Hex[];
      winner = { cardId: cand.card_id, playerId: cand.player_id, printNo: cand.print_no, pulledMs: cand.pulled_ms, snapshotHash: cand.snapshot_hash,
        leaf: cand.leaf, root: cand.root, rootBlock: cand.root_block, proof: proofFor(buildTree(leaves), cand.leaf) };
    }
    db.prepare(`INSERT INTO edition_closes (token_id, edition, sale_tx, sale_log_index, sale_block, sale_time_ms, price, asset, outcome, card_id, player_id, root, proof)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(s.tokenId, n, s.tx, s.logIndex, s.block, s.timeMs, s.price, s.asset, outcome, winner?.cardId ?? null, winner?.playerId ?? null, winner?.root ?? null, winner ? JSON.stringify(winner.proof) : null);
    db.prepare("INSERT INTO editions (token_id, edition) VALUES (?, ?) ON CONFLICT(token_id) DO UPDATE SET edition = excluded.edition").run(s.tokenId, n + 1);

    // D9: copies printed as edition n at/after the sale time move to edition n+1 with a fresh leaf.
    const late = db.prepare("SELECT card_id, player_id, pulled_ms, slot, foils, snapshot_hash, day, pack_index FROM cards WHERE token_id = ? AND edition = ? AND pulled_ms >= ? AND superseded_by IS NULL")
      .all(s.tokenId, n, s.timeMs) as { card_id: Hex; player_id: Hex; pulled_ms: number; slot: string; foils: string; snapshot_hash: Hex; day: number; pack_index: number }[];
    for (const l of late) {
      const fresh = recordPull(db, { playerId: l.player_id, tokenId: s.tokenId, slot: l.slot, pulledMs: l.pulled_ms, day: l.day, packIndex: l.pack_index,
        foils: JSON.parse(l.foils), snapshotHash: l.snapshot_hash, hotPriceWei: null });
      db.prepare("UPDATE cards SET superseded_by = ? WHERE card_id = ?").run(fresh.cardId, l.card_id);
    }

    if (winner) db.prepare("INSERT INTO alerts (player_id, kind, body, created_ms) VALUES (?, 'LAST_PRINT', ?, ?)")
      .run(winner.playerId, JSON.stringify({ tokenId: s.tokenId, edition: n, cardId: winner.cardId, saleTx: s.tx }), Date.now());
    const holders = db.prepare("SELECT DISTINCT player_id FROM cards WHERE token_id = ? AND edition = ? AND slot = 'hot' AND superseded_by IS NULL").all(s.tokenId, n) as { player_id: string }[];
    for (const h of holders) if (h.player_id !== winner?.playerId) db.prepare("INSERT INTO alerts (player_id, kind, body, created_ms) VALUES (?, 'HOT_SOLD', ?, ?)")
      .run(h.player_id, JSON.stringify({ tokenId: s.tokenId, edition: n, saleTx: s.tx }), Date.now());
    return { tokenId: s.tokenId, edition: n, outcome, winner };
  });
}

export const seedCommitmentOf = (seed: Hex) => keccak256(seed);

// ---------- stats and the Duel vs the Market Boss (spec §6.3, §11.1, decisions D5) ----------
/** Floor: cheapest live MON listing; without listings, the 25th percentile of the last 14 days' sales. */
export function floorWei(db: DB, listings: Listing[] | null, nowMs: number): bigint {
  if (listings && listings.length) return listings.reduce((m, l) => (l.priceWei < m ? l.priceWei : m), listings[0]!.priceWei);
  const rows = db.prepare("SELECT price FROM events WHERE class = 'SALE' AND time_ms >= ? AND price IS NOT NULL").all(nowMs - 14 * 86_400_000) as { price: string }[];
  if (rows.length === 0) throw new Error("no floor: no listings and no recent sales");
  const sorted = rows.map((r) => Number(r.price)).sort((a, b) => a - b);
  return BigInt(Math.round(sorted[Math.floor(0.25 * (sorted.length - 1))]!)) * 10n ** 18n;
}

export function statsFor(db: DB, tokenId: number, nowMs: number, floor: bigint): Stats {
  const evs = db.prepare("SELECT time_ms, from_addr, to_addr, class, price FROM events WHERE token_id = ? ORDER BY block, tx_index, log_index").all(tokenId) as { time_ms: number; from_addr: string; to_addr: string; class: string; price: string | null }[];
  const owners = new Set(evs.map((e) => e.to_addr.toLowerCase()));
  const lastChange = [...evs].reverse().find((e) => e.from_addr.toLowerCase() !== e.to_addr.toLowerCase());
  const sales = evs.filter((e) => e.class === "SALE");
  const last = [...sales].reverse().find((e) => e.price !== null);
  return computeStats({
    holdDays: lastChange ? Math.floor((nowMs - lastChange.time_ms) / 86_400_000) : 0,
    distinctOwners: Math.max(1, owners.size), salesCount: sales.length,
    lastSaleWei: last ? BigInt(Math.round(Number(last.price))) * 10n ** 18n : null, floorWei: floor,
    tier: CATALOG.find((c) => c.tokenId === tokenId)!.tier,
  });
}

/** Boss deck: the 3 Chogs sold most recently before today with the highest Fame + Value (yesterday's sales first). */
export function bossDeck(db: DB, nowMs: number, floor: bigint) {
  const dayStart = nowMs - (nowMs % 86_400_000);
  const rows = db.prepare(`SELECT token_id, MAX(time_ms) AS t, tx, price FROM events WHERE class = 'SALE' AND time_ms < ? AND time_ms >= ?
    GROUP BY token_id ORDER BY t DESC LIMIT 40`).all(dayStart, dayStart - 3 * 86_400_000) as { token_id: number; t: number; tx: string; price: string | null }[];
  if (rows.length < 3) throw new Error("not enough recent sales to build the Market Boss deck");
  const yesterday = rows.filter((r) => r.t >= dayStart - 86_400_000);
  const pool = yesterday.length >= 3 ? yesterday : rows;
  return pool.map((r) => ({ tokenId: r.token_id, name: NAMES.get(r.token_id)!, tier: CATALOG.find((c) => c.tokenId === r.token_id)!.tier,
      stats: statsFor(db, r.token_id, nowMs, floor), sale: { tx: r.tx, time: new Date(r.t).toISOString(), price: r.price == null ? null : Math.round(Number(r.price)) } }))
    .sort((a, b) => (b.stats.fame + b.stats.value) - (a.stats.fame + a.stats.value) || a.tokenId - b.tokenId).slice(0, 3);
}

export function duelToday(db: DB, playerId: Hex | null, nowMs: number, listings: Listing[] | null) {
  const day = dayOf(nowMs);
  const seed = db.prepare("SELECT seed, commit_block FROM seeds WHERE day = ?").get(day) as { seed: Hex; commit_block: number | null } | undefined;
  if (seed?.commit_block == null) throw new PackError("SEED_COMMIT_FAIL", "Today's Duel opens in a moment.");
  const floor = floorWei(db, listings, nowMs);
  const plan = planDuel(seed.seed, String(day));
  const played = playerId ? db.prepare("SELECT result, won FROM duels WHERE player_id = ? AND day = ?").get(playerId, day) as { result: string; won: number } | undefined : undefined;
  return { day, floor, boss: bossDeck(db, nowMs, floor), roundStats: plan.roundStats, plan, played: played ? JSON.parse(played.result) : null };
}

export function playDuel(db: DB, playerId: Hex, cardIds: Hex[], nowMs: number, listings: Listing[] | null) {
  const t = duelToday(db, playerId, nowMs, listings);
  if (t.played) throw new PackError("ALREADY_OPENED", "You've played today's Duel. A new Boss arrives at 00:00 UTC.");
  if (cardIds.length !== 3 || new Set(cardIds).size !== 3) throw new Error("pick 3 different cards");
  const mine = cardIds.map((id) => db.prepare("SELECT token_id FROM cards WHERE card_id = ? AND player_id = ? AND superseded_by IS NULL").get(id, playerId) as { token_id: number } | undefined);
  if (mine.some((m) => !m)) throw new Error("you can only play your own cards");
  const picks: DuelCard[] = mine.map((m) => ({ tokenId: m!.token_id, tier: CATALOG.find((c) => c.tokenId === m!.token_id)!.tier, stats: statsFor(db, m!.token_id, nowMs, t.floor) }));
  if (new Set(picks.map((p) => p.tokenId)).size !== 3) throw new Error("pick 3 different Chogs");
  const r = runDuel(t.plan, t.boss, picks);
  const result = { winner: r.winner, rounds: r.rounds.map((x, i) => ({ stat: x.stat, result: x.result, player: { ...picks[i]!, name: NAMES.get(picks[i]!.tokenId) }, boss: t.boss[t.plan.bossOrder[i]!]! })) };
  db.prepare("INSERT INTO duels (player_id, day, picks, result, won, created_ms) VALUES (?, ?, ?, ?, ?, ?)")
    .run(playerId, t.day, JSON.stringify(cardIds), JSON.stringify(result), r.winner === "PLAYER" ? 1 : 0, nowMs);
  return result;
}
