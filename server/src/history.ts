import { readFileSync } from "node:fs";
import { ROOT } from "./config.ts";
import { getKv, setKv, tx, type DB } from "./db.ts";

/**
 * Loads the verified M0 history (data/chain/events.json) into the database. Sales before launch close editions
 * as PRE_GAME (decisions D8). The chain tail then continues from the backfill height. Runs once.
 */
export function importHistory(db: DB): { transfers: number; tailBlock: string } {
  if (getKv(db, "tail_block")) return { transfers: 0, tailBlock: getKv(db, "tail_block")! };
  const events = JSON.parse(readFileSync(new URL("data/chain/events.json", ROOT), "utf8")) as any[];
  const summary = JSON.parse(readFileSync(new URL("data/chain/backfill-summary.json", ROOT), "utf8"));
  const lastBlock = events.reduce((m, e) => Math.max(m, Number(e.block)), 0);
  const start = String(Math.max(lastBlock, Number(summary.hypersyncHeight) - 1));
  tx(db, () => {
    const ins = db.prepare(`INSERT INTO events (tx, log_index, block, tx_index, time_ms, token_id, from_addr, to_addr, class, rule, price, proceeds, asset, route, tx_to, pre_game)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
    const close = db.prepare(`INSERT INTO edition_closes (token_id, edition, sale_tx, sale_log_index, sale_block, sale_time_ms, price, asset, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PRE_GAME')`);
    const editions = new Map<number, number>();
    for (const e of events) {
      ins.run(e.tx, e.logIndex, Number(e.block), e.txIndex, Date.parse(e.time), e.tokenId, e.from, e.to, e.class, e.rule, e.price ?? null, e.proceeds ?? null, e.asset ?? null, e.route ?? null, e.txTo ?? null);
      if (e.class === "SALE") {
        const n = editions.get(e.tokenId) ?? 1;
        close.run(e.tokenId, n, e.tx, e.logIndex, Number(e.block), Date.parse(e.time), e.price ?? null, e.asset ?? null);
        editions.set(e.tokenId, n + 1);
      }
    }
    const ed = db.prepare("INSERT INTO editions (token_id, edition) VALUES (?, ?)");
    for (const [t, n] of editions) ed.run(t, n);
    setKv(db, "tail_block", start);
    setKv(db, "launch_block", start);
  });
  return { transfers: events.length, tailBlock: start };
}
