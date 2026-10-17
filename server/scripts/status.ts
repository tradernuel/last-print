/** Quick status from the server shell: wallet balance, contract, today's seed, last root, tail lag. */
import { formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "../src/chain.ts";
import { env } from "../src/config.ts";
import { getKv, openDb } from "../src/db.ts";

const db = openDb(env.dbPath);
const addr = privateKeyToAccount(env.privateKey()).address;
const [bal, head] = await Promise.all([publicClient.getBalance({ address: addr }), publicClient.getBlockNumber()]);
const tail = getKv(db, "tail_block");
console.log({
  wallet: addr, balanceMon: formatEther(bal), printBook: process.env.PRINTBOOK_ADDRESS ?? getKv(db, "printbook_address") ?? "not deployed", writesEnabled: env.writesEnabled,
  chainHead: head.toString(), tailBlock: tail, lagBlocks: tail ? (head - BigInt(tail)).toString() : null,
  seeds: db.prepare("SELECT day, commit_tx IS NOT NULL AS committed, reveal_tx IS NOT NULL AS revealed FROM seeds ORDER BY day DESC LIMIT 3").all(),
  lastRoot: db.prepare("SELECT root, count, block FROM roots ORDER BY created_ms DESC LIMIT 1").get() ?? null,
  players: (db.prepare("SELECT COUNT(*) n FROM players").get() as any).n, cards: (db.prepare("SELECT COUNT(*) n FROM cards").get() as any).n,
});
