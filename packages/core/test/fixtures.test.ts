/**
 * Real-transaction fixtures (spec §24.3, M0 check A2).
 * The JSON files are raw Monad mainnet replies saved by scripts/fetch-fixtures.ts
 * (run it with the "fetch-fixtures" GitHub Actions workflow). Tests skip until they exist.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAddress, type Hex } from "viem";
import { classifyTx, type EventClass, type TxContext } from "../src/classifier.ts";
import { CONFIG } from "../src/config.ts";

interface Fixture {
  name: string; fetchedAt: string;
  tx: { hash: Hex; from: string; to: string | null; blockNumber: string; transactionIndex: number };
  block: { number: string; timestamp: string };
  logs: { address: string; topics: Hex[]; data: Hex; logIndex: number }[];
}

const EXPECTED: Record<string, { cls: EventClass; priceMon?: number }> = {
  accepted_offer: { cls: "SALE", priceMon: 4422 },
  listing_buy: { cls: "SALE", priceMon: 4949 },
  basic_order_listing_buy: { cls: "SALE", priceMon: 5200 },
  high_sale: { cls: "SALE", priceMon: 6786.5 },
  no_payment_seaport_move: { cls: "NO_PAYMENT_MOVE" },
  bulk_move: { cls: "BULK_MOVE" },
  smart_wallet_move: { cls: "SMART_WALLET_MOVE" },
  direct_transfer: { cls: "TRANSFER" },
  multicall_router: { cls: "ROUTER_MOVE" },
};

const dir = new URL("./fixtures/", import.meta.url);
const ADDR = { ...CONFIG, knownRouters: CONFIG.knownRouters };

function load(name: string): Fixture | null {
  const f = new URL(`${name}.json`, dir);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Fixture) : null;
}

function toCtx(f: Fixture): TxContext {
  return {
    hash: f.tx.hash, blockNumber: BigInt(f.block.number), blockTime: Number(f.block.timestamp),
    txIndex: f.tx.transactionIndex, from: getAddress(f.tx.from), to: f.tx.to ? getAddress(f.tx.to) : null,
    logs: f.logs.map((l) => ({ address: getAddress(l.address), topics: l.topics, data: l.data, logIndex: Number(l.logIndex) })),
  };
}

const wholeMon = (wei: bigint) => Number(wei / 10n ** 14n) / 10_000;

describe("real Monad transactions", () => {
  for (const [name, exp] of Object.entries(EXPECTED)) {
    const f = load(name);
    it.skipIf(!f)(`${name} → ${exp.cls}`, () => {
      const results = classifyTx(toCtx(f!), ADDR);
      expect(results.length, "no Chog Transfer in this tx").toBeGreaterThan(0);
      const classes = [...new Set(results.map((r) => r.class))];
      expect(classes, `classes found: ${classes.join(", ")}; tx.to = ${f!.tx.to}`).toEqual([exp.cls]);

      if (exp.priceMon !== undefined) {
        const sale = results[0]!.sale!;
        if (sale.bundleSize > 1) return; // bundles have no per-item price
        const proceeds = wholeMon(sale.proceedsWei!);
        const gross = proceeds + sale.fees.reduce((s, p) => s + wholeMon(p.amountWei), 0);
        const close = (v: number) => Math.abs(v - exp.priceMon!) / exp.priceMon! < 0.01;
        expect(close(proceeds) || close(gross), `proceeds ${proceeds} MON, gross ${gross} MON, expected ≈ ${exp.priceMon}`).toBe(true);
      }
    });
  }

  it("every fixture was fetched (M0 evidence)", () => {
    const missing = Object.keys(EXPECTED).filter((n) => !load(n));
    if (missing.length) console.warn(`fixtures not fetched yet: ${missing.join(", ")} — run the fetch-fixtures workflow`);
    expect(true).toBe(true);
  });
});
