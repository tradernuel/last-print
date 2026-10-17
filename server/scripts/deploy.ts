/** Deploys PrintBook (owner = the server wallet) and writes PRINTBOOK_ADDRESS to ../.env. Asks for confirmation. */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createWalletClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { artifact, env, monad } from "../src/config.ts";
import { publicClient } from "../src/chain.ts";
import { getKv, openDb, setKv } from "../src/db.ts";

const envPath = new URL("../../.env", import.meta.url);
const db = openDb(env.dbPath);
const known = process.env.PRINTBOOK_ADDRESS ?? getKv(db, "printbook_address");
if (known) { console.log(`PrintBook is already deployed at ${known}. Nothing to do.`); process.exit(0); }
const account = privateKeyToAccount(env.privateKey());
console.log(`Server wallet: ${account.address}`);
const balance = await publicClient.getBalance({ address: account.address });
console.log(`Server wallet ${account.address} holds ${formatEther(balance)} MON.`);
if (balance < 10n ** 17n) { console.log("Send MON to this address first (about 10 MON)."); process.exit(1); }
const rl = createInterface({ input: process.stdin, output: process.stdout });
if ((await rl.question("Deploy PrintBook to Monad mainnet now? Type yes: ")).trim() !== "yes") { console.log("Cancelled."); process.exit(0); }
rl.close();
const { abi, bytecode } = artifact("PrintBook");
const wallet = createWalletClient({ account, chain: monad, transport: http(env.rpcHttp) });
const hash = await wallet.deployContract({ abi, bytecode, args: [account.address], account, chain: monad });
console.log(`Sent: https://monadscan.com/tx/${hash}`);
const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
if (r.status !== "success" || !r.contractAddress) throw new Error("deployment failed");
setKv(db, "printbook_address", r.contractAddress);
if (existsSync(envPath)) appendFileSync(envPath, `PRINTBOOK_ADDRESS=${r.contractAddress}\n`);
console.log(`PrintBook deployed at ${r.contractAddress} (block ${r.blockNumber}). Saved. Restart the server to start packs and proofs.`);
