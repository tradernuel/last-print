/** Shared helpers for the M0 data scripts. All output lands in data/ and is committed by the m0-data workflow. */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createPublicClient, http, type PublicClient } from "viem";

export const ROOT = new URL("../../", import.meta.url);
export const dataPath = (p: string) => new URL(`data/${p}`, ROOT);

export function writeJson(p: string, value: unknown) {
  const url = dataPath(p);
  mkdirSync(new URL(".", url), { recursive: true });
  writeFileSync(url, JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
}
export function readJson<T>(p: string): T | null {
  const url = dataPath(p);
  return existsSync(url) ? (JSON.parse(readFileSync(url, "utf8")) as T) : null;
}

export function env(name: string, required = true): string {
  const v = process.env[name];
  if (!v && required) throw new Error(`${name} is not set (add it as a repository secret)`);
  return v ?? "";
}

export function rpc(): PublicClient {
  return createPublicClient({
    transport: http(env("MONAD_RPC_HTTP"), { batch: { batchSize: 20, wait: 20 }, retryCount: 8, retryDelay: 1000, timeout: 30_000 }),
  }) as PublicClient;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run tasks with a fixed number in flight. */
export async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>, label = ""): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
      if (++done % 200 === 0) console.log(`${label} ${done}/${items.length}`);
    }
  }));
  return out;
}

export async function withRetry<T>(fn: () => Promise<T>, tries = 6, baseMs = 1500): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await sleep(baseMs * 2 ** i); }
  }
  throw last;
}

export const toBig = (v: unknown): bigint => {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") return BigInt(v);
  throw new Error(`cannot convert ${String(v)} to bigint`);
};
