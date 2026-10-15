/**
 * M0 backfill (spec §12, checks A3/A4): every Chog Genesis Transfer since mint, classified with the core rules.
 * 1. HyperSync: all Transfer logs of the Chog contract + block timestamps.
 * 2. Monad RPC: the receipt of every non-mint transfer tx (needed for Seaport fills).
 * 3. classifyTx on each tx; write data/chain/events.json and data/chain/backfill-summary.json.
 */
import { getAddress, type Hex } from "viem";
import { classifyTx, CONFIG, TRANSFER_TOPIC, formatUnits18, type TxContext } from "../../packages/core/src/index.ts";
import { env, pool, rpc, toBig, withRetry, writeJson } from "./lib.ts";

const HS = "https://monad.hypersync.xyz";
const START_BLOCK = 100_000_000; // safely before the observed first mint (~101,704,044)
const t0 = Date.now();

async function hs<T>(path: string, body?: unknown): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${HS}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("HYPERSYNC_TOKEN")}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`HyperSync ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  });
}

interface HsLog { block_number: unknown; log_index: unknown; transaction_index: unknown; transaction_hash: string; topic0: string; topic1: string; topic2: string; topic3: string }
interface HsBlock { number: unknown; timestamp: unknown }
interface HsPage { data: { logs?: HsLog[]; blocks?: HsBlock[] }[]; next_block: number; archive_height?: number }

const { height } = await hs<{ height: number }>("/height");
console.log(`HyperSync height ${height}`);
const logs: HsLog[] = [];
const blockTime = new Map<bigint, number>();
let from = START_BLOCK;
let pages = 0;
while (from < height) {
  const page = await hs<HsPage>("/query", {
    from_block: from, to_block: height,
    logs: [{ address: [CONFIG.chog], topics: [[TRANSFER_TOPIC]] }],
    field_selection: {
      log: ["block_number", "log_index", "transaction_index", "transaction_hash", "topic0", "topic1", "topic2", "topic3"],
      block: ["number", "timestamp"],
    },
  });
  for (const d of page.data) {
    logs.push(...(d.logs ?? []));
    for (const b of d.blocks ?? []) blockTime.set(toBig(b.number), Number(toBig(b.timestamp)));
  }
  if (page.next_block <= from) throw new Error(`HyperSync did not advance past ${from}`);
  from = page.next_block;
  if (++pages % 20 === 0) console.log(`HyperSync page ${pages}, block ${from}, ${logs.length} transfers`);
}
console.log(`HyperSync: ${logs.length} Chog transfers in ${pages} pages (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

const zero = "0x0000000000000000000000000000000000000000";
const addrOf = (topic: string) => getAddress(`0x${topic.slice(26)}`);
const mints = logs.filter((l) => addrOf(l.topic1) === zero);
const nonMintTxs = [...new Set(logs.filter((l) => addrOf(l.topic1) !== zero).map((l) => l.transaction_hash as Hex))];
console.log(`${mints.length} mint transfers; ${nonMintTxs.length} non-mint txs need receipts`);

const client = rpc();
const receipts = await pool(nonMintTxs, 6, (hash) => withRetry(() => client.getTransactionReceipt({ hash })), "receipts");

type Ev = ReturnType<typeof classifyTx>[number];
const events: Ev[] = [];
for (const l of mints) {
  const block = toBig(l.block_number);
  events.push({
    txHash: l.transaction_hash as Hex, blockNumber: block, blockTime: blockTime.get(block) ?? -1,
    txIndex: Number(toBig(l.transaction_index)), logIndex: Number(toBig(l.log_index)), tokenId: toBig(l.topic3),
    from: addrOf(l.topic1), to: addrOf(l.topic2), class: "MINT", rule: "R1", ownerChanged: true,
  });
}
const addr = { ...CONFIG };
const txTo = new Map<string, string | null>();
for (const r of receipts) {
  const time = blockTime.get(r.blockNumber);
  if (time === undefined) throw new Error(`no timestamp for block ${r.blockNumber}`);
  const ctx: TxContext = {
    hash: r.transactionHash, blockNumber: r.blockNumber, blockTime: time, txIndex: r.transactionIndex,
    from: getAddress(r.from), to: r.to ? getAddress(r.to) : null,
    logs: r.logs.map((l) => ({ address: getAddress(l.address), topics: l.topics, data: l.data, logIndex: l.logIndex! })),
  };
  txTo.set(r.transactionHash, ctx.to);
  events.push(...classifyTx(ctx, addr));
}
events.sort((a, b) => (a.blockNumber !== b.blockNumber ? (a.blockNumber < b.blockNumber ? -1 : 1) : a.txIndex !== b.txIndex ? a.txIndex - b.txIndex : a.logIndex - b.logIndex));
if (events.length !== logs.length) throw new Error(`classified ${events.length} events but HyperSync returned ${logs.length} transfers`);

const out = events.map((e) => ({
  tx: e.txHash, block: e.blockNumber.toString(), txIndex: e.txIndex, logIndex: e.logIndex,
  time: new Date(e.blockTime * 1000).toISOString(), tokenId: Number(e.tokenId), from: e.from, to: e.to,
  class: e.class, rule: e.rule, txTo: txTo.get(e.txHash) ?? null,
  ...(e.sale ? {
    asset: e.sale.asset, route: e.sale.route, bundleSize: e.sale.bundleSize,
    feeRecipients: [...new Set(e.sale.fees.map((f) => f.recipient))],
    price: e.sale.grossWei === null ? null : formatUnits18(e.sale.grossWei, 4),
    proceeds: e.sale.proceedsWei === null ? null : formatUnits18(e.sale.proceedsWei, 4),
  } : {}),
}));
writeJson("chain/events.json", out);

// Full receipts of anything we could not classify, for manual review (spec rule 7: unknowns never change editions).
const reviewTxs = new Set(out.filter((e) => e.class === "UNCLASSIFIED" || e.class === "NOMINAL_PRICE_MOVE").map((e) => e.tx));
writeJson("review/receipts.json", receipts.filter((r) => reviewTxs.has(r.transactionHash)).map((r) => ({
  tx: r.transactionHash, from: r.from, to: r.to, block: r.blockNumber, status: r.status,
  logs: r.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data.length > 514 ? l.data.slice(0, 514) + "…" : l.data, logIndex: l.logIndex })),
})));

const byClass: Record<string, number> = {};
for (const e of out) byClass[e.class] = (byClass[e.class] ?? 0) + 1;
const firstMint = out.find((e) => e.class === "MINT");
writeJson("chain/backfill-summary.json", {
  ranAt: new Date().toISOString(), hypersyncHeight: height, startBlock: START_BLOCK,
  transfers: out.length, byClass, distinctTokensMinted: new Set(out.filter((e) => e.class === "MINT").map((e) => e.tokenId)).size,
  firstMint: firstMint ? { block: firstMint.block, time: firstMint.time, tx: firstMint.tx } : null,
  seconds: Math.round((Date.now() - t0) / 1000),
});
console.log("backfill done", byClass);
