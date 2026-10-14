/**
 * Fetch real-transaction fixtures (spec §24.3) from Monad mainnet and store the raw replies.
 * Run from a machine that can reach the RPC:
 *   MONAD_RPC_HTTP=https://rpc.monad.xyz node --experimental-strip-types scripts/fetch-fixtures.ts
 * Output: packages/core/test/fixtures/<name>.json (receipt, tx, block header, fetchedAt).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, http, type Hex } from "viem";

const FIXTURES: Record<string, { tx: Hex; expect: string }> = {
  accepted_offer: { tx: "0x8d144408fae4b78a5d7a42efa85ddf0ec30be2de67e8c05cff2df4a6a5830e3c", expect: "SALE ~4422" },
  listing_buy: { tx: "0xdecaddd8a4f17fd6b57cbce9d504cd5b9feb86a64ffd6ef1e1f0632af077495f", expect: "SALE ~4949" },
  basic_order_listing_buy: { tx: "0x89c8e99142bd0c0419d83b79c316c33996a25b497e35c0af7f5958eb33a9a134", expect: "SALE ~5200" },
  high_sale: { tx: "0x0b9b19c489b4f816d0fb9d30029be8743d5cb9d7c870e596713a6cd796394049", expect: "SALE ~6786.5" },
  no_payment_seaport_move: { tx: "0xb99816a46217e53c5da521b31ce721fd6f751e16cc12bcf3bcc301ab9f07d2bf", expect: "NO_PAYMENT_MOVE" },
  bulk_move: { tx: "0x3d4c6e6eb9db225e5d493a55f2fa23e2c42b8fc4a0fdec4ee37182a7a660d048", expect: "BULK_MOVE" },
  smart_wallet_move: { tx: "0x6568b48b64c94150fcd68cb6e9be67e2ec0121e22894d852d63e93fe255837e8", expect: "SMART_WALLET_MOVE" },
  direct_transfer: { tx: "0xe3fa036d75423405a28f8f79664906e1623840f7d4507ddd5f2991be88717824", expect: "TRANSFER" },
  multicall_router: { tx: "0xfecca011a4b451d0e55850e29ad324e654a7d547a9a7bdccfe22d8d65259c9b0", expect: "ROUTER_MOVE" },
};

const rpc = process.env.MONAD_RPC_HTTP;
if (!rpc) throw new Error("MONAD_RPC_HTTP is not set");
const client = createPublicClient({ transport: http(rpc, { retryCount: 5, retryDelay: 800 }) });
const dir = new URL("../packages/core/test/fixtures/", import.meta.url);
mkdirSync(dir, { recursive: true });

const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
for (const [name, f] of Object.entries(FIXTURES)) {
  const [tx, receipt] = await Promise.all([client.getTransaction({ hash: f.tx }), client.getTransactionReceipt({ hash: f.tx })]);
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const out = {
    name, expect: f.expect, fetchedAt: new Date().toISOString(), rpc,
    tx: { hash: tx.hash, from: tx.from, to: tx.to, input: tx.input.slice(0, 10), blockNumber: tx.blockNumber, transactionIndex: tx.transactionIndex },
    block: { number: block.number, timestamp: block.timestamp },
    logs: receipt.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data, logIndex: l.logIndex })),
  };
  writeFileSync(new URL(`${name}.json`, dir), JSON.stringify(out, replacer, 2));
  console.log(`saved ${name} (${receipt.logs.length} logs, block ${receipt.blockNumber})`);
}
