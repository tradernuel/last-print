import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "./config.ts";
import { openDb } from "./db.ts";
import { startApi } from "./api.ts";
import { startDaily, startListings, startProver, startRecorder, startTail } from "./workers.ts";
import { log } from "./log.ts";

mkdirSync(dirname(env.dbPath), { recursive: true });
const db = openDb(env.dbPath);
log.info("starting", { writes: env.writesEnabled, printBook: process.env.PRINTBOOK_ADDRESS ?? null });
startApi(db);
startListings();
startDaily(db);
startTail(db);
startProver(db);
startRecorder(db);
