import { getAddress, parseAbiItem, type Hex } from "viem";
import { randomBytes } from "node:crypto";
import { classifyTx, CONFIG, formatUnits18, TRANSFER_TOPIC, type Listing, type TxContext } from "../../packages/core/src/index.ts";
import { publicClient, read, write } from "./chain.ts";
import { env } from "./config.ts";
import { getKv, setKv, type DB } from "./db.ts";
import { closeEdition, confirmRoot, dayOf, nextRootBatch, seedCommitmentOf, type CloseResult } from "./game.ts";
import { errMsg, log } from "./log.ts";

export const bus = new EventTarget();
const emit = (type: string, detail: unknown) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const health: Record<string, unknown> = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loop(name: string, everyMs: number, fn: () => Promise<void>) {
  (async () => {
    for (;;) {
      try { await fn(); health[`${name}Ok`] = new Date().toISOString(); health[`${name}Error`] = null; }
      catch (e) { health[`${name}Error`] = errMsg(e); log.error(`${name} failed`, { error: errMsg(e) }); }
      await sleep(everyMs);
    }
  })();
}

// ---------- chain tail: every Chog transfer, classified, in order ----------
const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
const FINALITY_BLOCKS = 2n; // spec §8.4

async function hypersyncTxs(from: bigint, to: bigint): Promise<Hex[]> {
  const res = await fetch("https://monad.hypersync.xyz/query", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.hypersyncToken}` },
    body: JSON.stringify({ from_block: Number(from), to_block: Number(to) + 1, logs: [{ address: [CONFIG.chog], topics: [[TRANSFER_TOPIC]] }], field_selection: { log: ["transaction_hash", "block_number"] } }),
  });
  if (!res.ok) throw new Error(`HyperSync ${res.status}`);
  const page = (await res.json()) as { data: { logs?: { transaction_hash: Hex }[] }[]; next_block: number };
  if (page.next_block <= Number(to)) throw new Error("HyperSync returned a partial range; retrying");
  return [...new Set(page.data.flatMap((d) => (d.logs ?? []).map((l) => l.transaction_hash)))];
}

export async function processTx(db: DB, hash: Hex): Promise<CloseResult[]> {
  const r = await publicClient.getTransactionReceipt({ hash });
  const block = await publicClient.getBlock({ blockNumber: r.blockNumber });
  const ctx: TxContext = {
    hash, blockNumber: r.blockNumber, blockTime: Number(block.timestamp), txIndex: r.transactionIndex, from: getAddress(r.from), to: r.to ? getAddress(r.to) : null,
    logs: r.logs.map((l) => ({ address: getAddress(l.address), topics: l.topics, data: l.data, logIndex: l.logIndex! })),
  };
  const closes: CloseResult[] = [];
  for (const e of classifyTx(ctx, CONFIG)) {
    const ins = db.prepare(`INSERT OR IGNORE INTO events (tx, log_index, block, tx_index, time_ms, token_id, from_addr, to_addr, class, rule, price, proceeds, asset, route, tx_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      e.txHash, e.logIndex, Number(e.blockNumber), e.txIndex, e.blockTime * 1000, Number(e.tokenId), e.from, e.to, e.class, e.rule,
      e.sale?.grossWei == null ? null : formatUnits18(e.sale.grossWei, 4), e.sale?.proceedsWei == null ? null : formatUnits18(e.sale.proceedsWei, 4),
      e.sale?.asset ?? null, e.sale?.route ?? null, ctx.to);
    if (ins.changes === 0) continue; // already processed
    if (e.class === "UNCLASSIFIED") log.warn("unclassified transfer (review)", { tx: e.txHash, token: e.tokenId, to: ctx.to });
    if (e.class !== "SALE") continue;
    const c = closeEdition(db, { tx: e.txHash, logIndex: e.logIndex, block: Number(e.blockNumber), timeMs: e.blockTime * 1000, tokenId: Number(e.tokenId),
      from: e.from, to: e.to, price: e.sale!.grossWei == null ? null : formatUnits18(e.sale!.grossWei, 4), asset: e.sale!.asset });
    log.info("edition closed", { token: c.tokenId, edition: c.edition, outcome: c.outcome, tx: e.txHash });
    emit("sale", { tokenId: c.tokenId, edition: c.edition, outcome: c.outcome, tx: e.txHash, price: e.sale!.grossWei == null ? null : formatUnits18(e.sale!.grossWei, 0), timeMs: e.blockTime * 1000, playerId: c.winner?.playerId ?? null });
    closes.push(c);
  }
  return closes;
}

export function startTail(db: DB) {
  loop("tail", 1500, async () => {
    const cursor = BigInt(getKv(db, "tail_block") ?? (() => { throw new Error("tail_block not set: run import:history first"); })());
    const latest = await publicClient.getBlockNumber();
    const final = latest - FINALITY_BLOCKS;
    health.chainHead = latest.toString(); health.tailBlock = cursor.toString(); health.tailLag = (final - cursor).toString();
    if (final <= cursor) return;
    const gap = final - cursor;
    const to = gap > 5000n && env.hypersyncToken ? (cursor + 200_000n < final ? cursor + 200_000n : final) : (cursor + 99n < final ? cursor + 99n : final);
    let hashes: Hex[];
    if (gap > 5000n && env.hypersyncToken) hashes = await hypersyncTxs(cursor + 1n, to);
    else {
      const logs = await publicClient.getLogs({ address: CONFIG.chog, event: transferEvent, fromBlock: cursor + 1n, toBlock: to });
      hashes = [...new Set(logs.map((l) => l.transactionHash!))];
    }
    for (const h of hashes) await processTx(db, h); // in chain order: logs and HyperSync both return ascending
    setKv(db, "tail_block", to.toString());
  });
}

// ---------- Last Print records on chain ----------
export function startRecorder(db: DB) {
  loop("recorder", 4000, async () => {
    const rows = db.prepare(`SELECT ec.*, c.print_no, c.pulled_ms, c.snapshot_hash FROM edition_closes ec JOIN cards c ON c.card_id = ec.card_id
      WHERE ec.outcome = 'CROWNED' AND ec.record_tx IS NULL ORDER BY ec.sale_block LIMIT 5`).all() as any[];
    for (const r of rows) {
      const claim = { tokenId: BigInt(r.token_id), edition: r.edition, cardId: r.card_id, printNo: r.print_no, playerId: r.player_id, pulledAtMs: BigInt(r.pulled_ms),
        snapshotHash: r.snapshot_hash, root: r.root, saleTx: r.sale_tx, saleBlock: BigInt(r.sale_block), saleTimeMs: BigInt(r.sale_time_ms) };
      try {
        const existing = await read<Hex>("lastPrintOf", [claim.tokenId, claim.edition]);
        const res = existing !== "0x0000000000000000000000000000000000000000000000000000000000000000" ? { hash: "already-recorded" as Hex } : await write("recordLastPrint", [claim, JSON.parse(r.proof)]);
        db.prepare("UPDATE edition_closes SET record_tx = ?, record_error = NULL WHERE token_id = ? AND edition = ?").run(res.hash, r.token_id, r.edition);
      } catch (e) {
        db.prepare("UPDATE edition_closes SET record_error = ? WHERE token_id = ? AND edition = ?").run(errMsg(e), r.token_id, r.edition);
        throw e;
      }
    }
  });
}

// ---------- pull roots (decisions D1, D2) ----------
export function startProver(db: DB) {
  loop("prover", env.rootEverySec * 1000, async () => {
    const b = nextRootBatch(db);
    if (!b) return;
    const already = await read<bigint>("rootBlock", [b.root]);
    if (already > 0n) { confirmRoot(db, b, "0x" as Hex, already); return; } // posted before a restart
    const { hash, block } = await write("postPullRoot", [b.root, BigInt(b.fromMs), BigInt(b.toMs), b.leaves.length]);
    confirmRoot(db, b, hash, block);
    health.lastRoot = { root: b.root, count: b.leaves.length, block: block.toString(), at: new Date().toISOString() };
  });
}

// ---------- daily seeds: commit before packs open, reveal after the day ends ----------
export function startDaily(db: DB) {
  loop("daily", 20_000, async () => {
    const now = Date.now();
    const days = [dayOf(now)];
    const msToMidnight = 86_400_000 - (now % 86_400_000);
    if (msToMidnight < 10 * 60_000) days.push(dayOf(now + 86_400_000)); // pre-commit tomorrow so packs open at 00:00
    for (const day of days) {
      let row = db.prepare("SELECT * FROM seeds WHERE day = ?").get(day) as any;
      if (!row) {
        const seed = `0x${randomBytes(32).toString("hex")}` as Hex;
        db.prepare("INSERT INTO seeds (day, seed, commitment) VALUES (?, ?, ?)").run(day, seed, seedCommitmentOf(seed));
        row = db.prepare("SELECT * FROM seeds WHERE day = ?").get(day);
      }
      if (row.commit_block == null) {
        const onchain = await read<Hex>("seedHashOf", [day]);
        if (onchain !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
          if (onchain !== row.commitment) throw new Error(`on-chain commitment for ${day} differs from the stored seed`);
          db.prepare("UPDATE seeds SET commit_block = 0 WHERE day = ?").run(day);
        } else {
          const { hash, block } = await write("commitSeed", [day, row.commitment]);
          db.prepare("UPDATE seeds SET commit_tx = ?, commit_block = ? WHERE day = ?").run(hash, Number(block), day);
        }
      }
    }
    const due = db.prepare("SELECT day, seed FROM seeds WHERE day < ? AND commit_block IS NOT NULL AND reveal_tx IS NULL").all(dayOf(now)) as { day: number; seed: Hex }[];
    for (const d of due) {
      const { hash } = await write("revealSeed", [d.day, d.seed]);
      db.prepare("UPDATE seeds SET reveal_tx = ? WHERE day = ?").run(hash, d.day);
    }
    health.todaySeedCommitted = Boolean((db.prepare("SELECT commit_block FROM seeds WHERE day = ?").get(dayOf(now)) as any)?.commit_block != null);
  });
}

// ---------- $CHOG balances of Chog owners (spec §6.4 $CHOG Aura, check A7) ----------
export const chogAura = { threshold: null as bigint | null, holders: new Map<string, bigint>(), at: 0 };
const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }] as const;

export function startChogBalances(db: DB) {
  loop("chogBalances", 6 * 3600_000, async () => {
    const owners = (db.prepare(`SELECT to_addr FROM events e WHERE (block, tx_index, log_index) = (
      SELECT block, tx_index, log_index FROM events WHERE token_id = e.token_id ORDER BY block DESC, tx_index DESC, log_index DESC LIMIT 1)`).all() as { to_addr: string }[])
      .map((r) => r.to_addr.toLowerCase());
    const unique = [...new Set(owners)];
    const balances = new Map<string, bigint>();
    for (let i = 0; i < unique.length; i += 40) {
      const chunk = unique.slice(i, i + 40);
      const got = await Promise.all(chunk.map((a) => publicClient.readContract({ address: CONFIG.chogToken, abi: erc20, functionName: "balanceOf", args: [a as Hex] })));
      chunk.forEach((a, k) => balances.set(a, got[k]!));
      await sleep(300);
    }
    const holders = [...balances.values()].filter((b) => b > 0n).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    // Threshold: the 85th percentile of all owners' balances (at least 1 wei), so roughly the top 15% qualify.
    const all = [...balances.values()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const p85 = all[Math.floor(0.85 * (all.length - 1))] ?? 0n;
    chogAura.threshold = p85 > 0n ? p85 : 1n;
    chogAura.holders = balances;
    chogAura.at = Date.now();
    const qualifying = all.filter((b) => b >= chogAura.threshold!).length;
    health.chogAura = { owners: unique.length, holdingChog: holders.length, qualifying, thresholdWei: chogAura.threshold.toString(), at: new Date().toISOString() };
  });
}

// ---------- OpenSea listings (Hot slot and For Sale foil) ----------
let listings: Listing[] | null = null;
let listingsAt = 0;
export const currentListings = () => (Date.now() - listingsAt < 10 * 60_000 ? listings : null);

export function startListings() {
  loop("listings", 120_000, async () => {
    const all: Listing[] = [];
    let next: string | null = null;
    let pages = 0;
    do {
      const url = `https://api.opensea.io/api/v2/listings/collection/chog-genesis/all?limit=100${next ? `&next=${encodeURIComponent(next)}` : ""}`;
      const res = await fetch(url, { headers: { accept: "application/json", "x-api-key": env.openseaKey() } });
      if (!res.ok) throw new Error(`OpenSea listings ${res.status}`);
      const page = (await res.json()) as any;
      for (const l of page.listings ?? []) {
        const offer = l?.protocol_data?.parameters?.offer?.[0];
        const cur = l?.price?.current;
        if (!offer || !cur || offer.token?.toLowerCase() !== CONFIG.chog.toLowerCase() || cur.currency !== "MON") continue;
        all.push({ tokenId: Number(offer.identifierOrCriteria), priceWei: BigInt(cur.value) });
      }
      next = page.next ?? null;
      await sleep(400);
    } while (next && ++pages < 50);
    listings = all; listingsAt = Date.now();
    health.listings = { count: all.length, at: new Date(listingsAt).toISOString() };
  });
}
