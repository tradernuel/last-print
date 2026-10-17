/** Creates the server's own wallet. The private key is written only to ../.env (mode 600) and never printed. */
import { appendFileSync, chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const envPath = new URL("../../.env", import.meta.url);
const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const existing = current.match(/^SERVER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m);
if (existing) {
  console.log(`A server wallet already exists: ${privateKeyToAccount(existing[1] as `0x${string}`).address}`);
  process.exit(0);
}
const key = generatePrivateKey();
if (!existsSync(envPath)) writeFileSync(envPath, "");
appendFileSync(envPath, `${current && !current.endsWith("\n") ? "\n" : ""}SERVER_PRIVATE_KEY=${key}\n`);
chmodSync(envPath, 0o600);
console.log(`Server wallet created. Send about 10 MON to:\n\n  ${privateKeyToAccount(key).address}\n\nThe private key is saved in .env on this server only.`);
