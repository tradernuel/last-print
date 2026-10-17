/** Imports the verified history into the database (the server also does this on first boot). */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { importHistory } from "../src/history.ts";

mkdirSync(dirname(env.dbPath), { recursive: true });
const r = importHistory(openDb(env.dbPath));
console.log(r.transfers ? `Imported ${r.transfers} transfers. The chain tail starts after block ${r.tailBlock}.` : "History is already imported. Nothing to do.");
