import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "./config.ts";
import { getKv, openDb } from "./db.ts";
import { importHistory } from "./history.ts";
import { startApi } from "./api.ts";
import { chogAura, startChogBalances, startDaily, startListings, startProver, startRecorder, startTail } from "./workers.ts";
import { auraSource } from "./game.ts";
import { log } from "./log.ts";

mkdirSync(dirname(env.dbPath), { recursive: true });
const db = openDb(env.dbPath);
if (!getKv(db, "tail_block")) log.info("history imported", importHistory(db)); // first boot
if (!process.env.PRINTBOOK_ADDRESS && getKv(db, "printbook_address")) process.env.PRINTBOOK_ADDRESS = getKv(db, "printbook_address")!;
const wallet = privateKeyToAccount(env.privateKey()).address;
log.info("starting", { wallet, writes: env.writesEnabled, printBook: process.env.PRINTBOOK_ADDRESS ?? "not deployed yet" });
startApi(db);
startListings();
auraSource.get = () => chogAura;
startChogBalances(db);
if (process.env.PRINTBOOK_ADDRESS) {
  startDaily(db);
  startProver(db);
  startRecorder(db);
} else {
  log.warn("PrintBook is not deployed yet: packs stay closed. Fund the wallet, then run `npm run deploy`.", { wallet });
}
startTail(db);
