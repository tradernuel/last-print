import { readFileSync } from "node:fs";
import { defineChain, getAddress, type Address, type Hex } from "viem";

/** Server settings from the environment (.env on the server, chmod 600). Missing required values stop the server. */
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in .env`);
  return v;
}
export const ROOT = new URL("../../", import.meta.url);

export const env = {
  rpcHttp: process.env.MONAD_RPC_HTTP ?? "https://rpc.monad.xyz",
  hypersyncToken: process.env.HYPERSYNC_TOKEN ?? "",
  openseaKey: () => need("OPENSEA_API_KEY"),
  privateKey: () => need("SERVER_PRIVATE_KEY") as Hex,
  printBook: () => getAddress(need("PRINTBOOK_ADDRESS")) as Address,
  dbPath: process.env.DB_PATH ?? new URL("data/lastprint.db", ROOT).pathname,
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
