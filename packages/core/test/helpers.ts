/**
 * Unit-test builders. These construct encoded logs for rule tests only;
 * real-transaction fixtures (spec §24.3) are fetched from chain by scripts/fetch-fixtures.ts.
 */
import { encodeAbiParameters, encodeEventTopics, getAddress, pad, toHex, zeroAddress, type Address, type Hex } from "viem";
import { SEAPORT_ABI, type RawLog } from "../src/seaport.ts";
import { CONFIG } from "../src/config.ts";
import type { TxContext } from "../src/classifier.ts";

export const A = {
  seller: getAddress("0x1111111111111111111111111111111111111111"),
  buyer: getAddress("0x2222222222222222222222222222222222222222"),
  opensea: getAddress("0x3333333333333333333333333333333333333333"),
  creator: getAddress("0x4444444444444444444444444444444444444444"),
  zone: getAddress("0x5555555555555555555555555555555555555555"),
  router: getAddress("0x6666666666666666666666666666666666666666"),
};
export const MON = (n: number | string) => BigInt(Math.round(Number(n) * 1e6)) * 10n ** 12n;

let li = 0;
export function transferLog(from: Address, to: Address, tokenId: bigint): RawLog {
  return {
    address: CONFIG.chog,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      pad(from), pad(to), pad(toHex(tokenId)),
    ],
    data: "0x", logIndex: li++,
  };
}

type Spent = { itemType: number; token: Address; identifier: bigint; amount: bigint };
type Recv = Spent & { recipient: Address };
export function fillLog(offerer: Address, offer: Spent[], consideration: Recv[], recipient: Address = zeroAddress): RawLog {
  const ev = SEAPORT_ABI[0];
  const topics = encodeEventTopics({ abi: SEAPORT_ABI, eventName: "OrderFulfilled", args: { offerer, zone: A.zone } });
  const nonIndexed = ev.inputs.filter((i) => !("indexed" in i && i.indexed));
  const data = encodeAbiParameters(nonIndexed, [pad("0xabc"), recipient, offer, consideration]);
  return { address: CONFIG.seaport16, topics: topics as Hex[], data, logIndex: li++ };
}

export const nft = (tokenId: bigint): Spent => ({ itemType: 2, token: CONFIG.chog, identifier: tokenId, amount: 1n });
export const native = (amount: bigint, recipient: Address): Recv => ({ itemType: 0, token: zeroAddress, identifier: 0n, amount, recipient });
export const wmon = (amount: bigint, recipient: Address): Recv => ({ itemType: 1, token: CONFIG.wmon, identifier: 0n, amount, recipient });

export function tx(to: Address | null, logs: RawLog[], extra: Partial<TxContext> = {}): TxContext {
  return { hash: pad("0x1") as Hex, blockNumber: 101_800_000n, blockTime: 1_760_000_000, txIndex: 0, from: A.buyer, to, logs, ...extra };
}

export const ADDR = {
  chog: CONFIG.chog, seaport16: CONFIG.seaport16, bulkTransferHelper: CONFIG.bulkTransferHelper,
  delegationManager: CONFIG.delegationManager, wmon: CONFIG.wmon, knownRouters: [A.router],
  minSalePriceWei: CONFIG.minSalePriceWei,
};
