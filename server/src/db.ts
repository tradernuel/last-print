import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncT } from "node:sqlite";

// Loaded via require so test tooling that doesn't know the newer node:sqlite builtin still works.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

/** One SQLite file (WAL) holds all game state (decisions D15). */
export type DB = DatabaseSyncT;

export function openDb(path: string): DB {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  db.exec(SCHEMA);
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS events (
  tx TEXT NOT NULL, log_index INTEGER NOT NULL, block INTEGER NOT NULL, tx_index INTEGER NOT NULL, time_ms INTEGER NOT NULL,
  token_id INTEGER NOT NULL, from_addr TEXT NOT NULL, to_addr TEXT NOT NULL, class TEXT NOT NULL, rule TEXT NOT NULL,
  price TEXT, proceeds TEXT, asset TEXT, route TEXT, tx_to TEXT, pre_game INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tx, log_index)
);
CREATE INDEX IF NOT EXISTS events_token ON events(token_id, block, tx_index, log_index);
CREATE INDEX IF NOT EXISTS events_class ON events(class, block);

CREATE TABLE IF NOT EXISTS editions (token_id INTEGER PRIMARY KEY, edition INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS edition_closes (
  token_id INTEGER NOT NULL, edition INTEGER NOT NULL, sale_tx TEXT NOT NULL, sale_log_index INTEGER NOT NULL,
  sale_block INTEGER NOT NULL, sale_time_ms INTEGER NOT NULL, price TEXT, asset TEXT,
  outcome TEXT NOT NULL, card_id TEXT, player_id TEXT, root TEXT, proof TEXT, record_tx TEXT, record_error TEXT,
  PRIMARY KEY (token_id, edition)
);

CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, created_ms INTEGER NOT NULL, streak INTEGER NOT NULL DEFAULT 0, last_day TEXT);

CREATE TABLE IF NOT EXISTS seeds (
  day INTEGER PRIMARY KEY, seed TEXT NOT NULL, commitment TEXT NOT NULL,
  commit_tx TEXT, commit_block INTEGER, reveal_tx TEXT
);

CREATE TABLE IF NOT EXISTS hot_snapshots (hash TEXT PRIMARY KEY, taken_ms INTEGER NOT NULL, cap_wei TEXT NOT NULL, listings TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS packs (
  player_id TEXT NOT NULL, day INTEGER NOT NULL, pack_index INTEGER NOT NULL, opened_ms INTEGER NOT NULL,
  slots TEXT NOT NULL, hot_snapshot TEXT, PRIMARY KEY (player_id, day, pack_index)
);

CREATE TABLE IF NOT EXISTS print_counters (token_id INTEGER NOT NULL, edition INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (token_id, edition));

CREATE TABLE IF NOT EXISTS cards (
  card_id TEXT PRIMARY KEY, player_id TEXT NOT NULL, token_id INTEGER NOT NULL, edition INTEGER NOT NULL, print_no INTEGER NOT NULL,
  pulled_ms INTEGER NOT NULL, slot TEXT NOT NULL, foils TEXT NOT NULL, snapshot_hash TEXT NOT NULL, leaf TEXT NOT NULL UNIQUE,
  root TEXT, superseded_by TEXT, day INTEGER NOT NULL, pack_index INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_token ON cards(token_id, edition);
CREATE INDEX IF NOT EXISTS cards_player ON cards(player_id);
CREATE INDEX IF NOT EXISTS cards_unrooted ON cards(root) WHERE root IS NULL;

CREATE TABLE IF NOT EXISTS roots (
  root TEXT PRIMARY KEY, from_ms INTEGER NOT NULL, to_ms INTEGER NOT NULL, count INTEGER NOT NULL,
  tx TEXT, block INTEGER, leaves TEXT NOT NULL, created_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, created_ms INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS alerts_player ON alerts(player_id, created_ms);
`;

export function getKv(db: DB, key: string): string | null {
  const r = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}
export function setKv(db: DB, key: string, value: string) {
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
export function tx<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
}
