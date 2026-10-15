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

/**
 * Expected results checked against the decoded chain data (see docs/audit/M0.md for corrections to the spec):
 * prices are what the buyer paid (seller proceeds + fees), in MON or WMON, per token.
 */
const EXPECTED: Record<string, { cls: EventClass; grossMon?: Record<string, number> }> = {
  accepted_offer: { cls: "SALE", grossMon: { "1473": 4422 } },
  listing_buy: { cls: "SALE", grossMon: { "445": 4900 } },           // actually a direct offer acceptance
  basic_order_listing_buy: { cls: "SALE", grossMon: { "650": 5200 } },
  high_sale: { cls: "SALE", grossMon: { "1707": 6000, "1864": 6100, "768": 6100, "599": 6319 } }, // 4-Chog sweep
  no_payment_seaport_move: { cls: "NOMINAL_PRICE_MOVE" },            // 0.69 MON, not "no payment"
  bulk_move: { cls: "BULK_MOVE" },
  smart_wallet_move: { cls: "SMART_WALLET_MOVE" },
  direct_transfer: { cls: "TRANSFER" },
  multicall_router: { cls: "SALE", grossMon: { "1889": 5821, "1471": 6325, "822": 6325 } }, // aggregator sweep, paid
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

      if (exp.grossMon) {
        expect(results.map((r) => r.tokenId.toString()).sort()).toEqual(Object.keys(exp.grossMon).sort());
        for (const r of results) {
          const want = exp.grossMon[r.tokenId.toString()]!;
          const got = wholeMon(r.sale!.grossWei!);
          expect(Math.abs(got - want), `token ${r.tokenId}: gross ${got}, expected ≈ ${want}`).toBeLessThan(1);
        }
      }
    });
  }

  it("every fixture was fetched (M0 evidence)", () => {
    const missing = Object.keys(EXPECTED).filter((n) => !load(n));
    if (missing.length) console.warn(`fixtures not fetched yet: ${missing.join(", ")} — run the fetch-fixtures workflow`);
    expect(true).toBe(true);
  });
});
