import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey } from "viem/accounts";
import { defineChain, getAddress, type Address, type Hex } from "viem";

/** Server settings from the environment (.env on the server, chmod 600). Missing required values stop the server. */
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in .env`);
  return v;
}
export const ROOT = new URL("../../", import.meta.url);

const dataDir = process.env.DATA_DIR ?? new URL("data/", ROOT).pathname;

/**
 * The server wallet key (decisions D16): SERVER_PRIVATE_KEY if set (Linux .env), otherwise a key generated once and kept
 * in DATA_DIR/server-key (mode 600) on the persistent disk (Render). It never leaves the server.
 */
function serverKey(): Hex {
  if (process.env.SERVER_PRIVATE_KEY) return process.env.SERVER_PRIVATE_KEY as Hex;
  const file = `${dataDir.replace(/\/$/, "")}/server-key`;
  if (!existsSync(file)) {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(file, generatePrivateKey(), { mode: 0o600 });
  }
  chmodSync(file, 0o600);
  const key = readFileSync(file, "utf8").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${file} does not hold a valid key`);
  return key as Hex;
}

export const env = {
  rpcHttp: process.env.MONAD_RPC_HTTP ?? "https://rpc.monad.xyz",
  hypersyncToken: process.env.HYPERSYNC_TOKEN ?? "",
  openseaKey: () => need("OPENSEA_API_KEY"),
  privateKey: serverKey,
  /** Set from PRINTBOOK_ADDRESS, or from the database once `npm run deploy` has stored it (see main.ts). */
  printBook: () => getAddress(need("PRINTBOOK_ADDRESS")) as Address,
  dataDir,
  dbPath: process.env.DB_PATH ?? `${dataDir.replace(/\/$/, "")}/lastprint.db`,
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 8787),
  corsOrigins: (process.env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim()),
  writesEnabled: process.env.WRITES_ENABLED === "true",
  /** Seconds between pull-root posts while there are unrooted pulls (decisions D1). */
  rootEverySec: Number(process.env.ROOT_EVERY_SEC ?? 5),
};

export const monad = defineChain({
  id: 143, name: "Monad", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [env.rpcHttp] } },
  blockExplorers: { default: { name: "Monadscan", url: "https://monadscan.com" } },
});

export function artifact(name: "PrintBook" | "LastPrintCertificate"): { abi: any[]; bytecode: Hex } {
  return JSON.parse(readFileSync(new URL(`server/artifacts/${name}.json`, ROOT), "utf8"));
}
