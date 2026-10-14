import { decodeEventLog, getAddress, parseAbi, toEventSelector, type Address, type Hex } from "viem";

export const SEAPORT_ABI = parseAbi([
  "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)",
]);
export const ORDER_FULFILLED_TOPIC = toEventSelector(SEAPORT_ABI[0]);

/** Seaport ItemType enum. */
export const ItemType = { NATIVE: 0, ERC20: 1, ERC721: 2, ERC1155: 3, ERC721_WITH_CRITERIA: 4, ERC1155_WITH_CRITERIA: 5 } as const;

export interface RawLog { address: Address; topics: readonly Hex[]; data: Hex; logIndex: number }

export interface SpentItem { itemType: number; token: Address; identifier: bigint; amount: bigint }
export interface ReceivedItem extends SpentItem { recipient: Address }
export interface Fill {
  logIndex: number;
  orderHash: Hex;
  offerer: Address;
  recipient: Address;
  offer: SpentItem[];
  consideration: ReceivedItem[];
}

/** Decode every OrderFulfilled emitted by the given Seaport address. Malformed logs throw. */
export function decodeFills(logs: readonly RawLog[], seaport: Address): Fill[] {
  const fills: Fill[] = [];
  for (const log of logs) {
    if (getAddress(log.address) !== seaport) continue;
    if (log.topics[0] !== ORDER_FULFILLED_TOPIC) continue;
    const ev = decodeEventLog({ abi: SEAPORT_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    const a = ev.args;
    fills.push({
      logIndex: log.logIndex,
      orderHash: a.orderHash,
      offerer: getAddress(a.offerer),
      recipient: getAddress(a.recipient),
      offer: a.offer.map((i) => ({ itemType: i.itemType, token: getAddress(i.token), identifier: i.identifier, amount: i.amount })),
      consideration: a.consideration.map((i) => ({
        itemType: i.itemType, token: getAddress(i.token), identifier: i.identifier, amount: i.amount, recipient: getAddress(i.recipient),
      })),
    });
  }
  return fills;
}
