import { createPublicClient, createWalletClient, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { artifact, env, monad } from "./config.ts";
import { log } from "./log.ts";

export const publicClient: PublicClient = createPublicClient({
  chain: monad, transport: http(env.rpcHttp, { batch: { batchSize: 20, wait: 15 }, retryCount: 6, retryDelay: 800, timeout: 20_000 }),
}) as PublicClient;

const PB = artifact("PrintBook");

function wallet() {
  const account = privateKeyToAccount(env.privateKey());
  return { account, client: createWalletClient({ account, chain: monad, transport: http(env.rpcHttp, { retryCount: 4, retryDelay: 1000 }) }) };
}
export const serverAddress = (): Address => privateKeyToAccount(env.privateKey()).address;

/** Every on-chain write goes through here: kill switch, one at a time, wait for the receipt, fail loudly. */
let queue: Promise<unknown> = Promise.resolve();
export function write(functionName: string, args: unknown[]): Promise<{ hash: Hex; block: bigint }> {
  const run = async () => {
    if (!env.writesEnabled) throw new Error(`WRITES_ENABLED is false; not sending ${functionName}`);
    const { account, client } = wallet();
    const hash = await client.writeContract({ address: env.printBook(), abi: PB.abi, functionName, args, account, chain: monad });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted in ${hash}`);
    log.info("chain write", { fn: functionName, hash, block: receipt.blockNumber.toString(), gas: receipt.gasUsed.toString() });
    return { hash, block: receipt.blockNumber };
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

export function read<T>(functionName: string, args: unknown[] = []): Promise<T> {
  return publicClient.readContract({ address: env.printBook(), abi: PB.abi, functionName, args }) as Promise<T>;
}
