import { getAddress, toEventSelector, parseAbiItem, zeroAddress, type Address, type Hex } from "viem";
import { decodeFills, ItemType, type Fill, type RawLog } from "./seaport.ts";
import { invariant } from "./errors.ts";

export const TRANSFER_TOPIC = toEventSelector(parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"));

export type EventClass =
  | "MINT" | "SALE" | "NO_PAYMENT_MOVE" | "BULK_MOVE" | "SMART_WALLET_MOVE" | "TRANSFER" | "ROUTER_MOVE" | "UNCLASSIFIED";

export interface TxContext {
  hash: Hex;
  blockNumber: bigint;
  blockTime: number; // unix seconds
  txIndex: number;
  from: Address;
  to: Address | null;
  logs: RawLog[];
}

export interface ClassifierAddresses {
  chog: Address;
  seaport16: Address;
  bulkTransferHelper: Address;
  delegationManager: Address;
  wmon: Address;
  knownRouters: readonly Address[];
}

export interface Payment { asset: "MON" | "WMON"; amountWei: bigint; recipient: Address }

export interface SaleInfo {
  /** Seller proceeds for this token in wei; null when it was sold inside a multi-item bundle. */
  proceedsWei: bigint | null;
  asset: "MON" | "WMON";
  /** Total proceeds paid to the seller in this tx (equals proceedsWei when not a bundle). */
  totalToSellerWei: bigint;
  fees: Payment[];
  bundleSize: number;
  route: "OFFER_ACCEPTED" | "LISTING_BOUGHT";
}

export interface ClassifiedTransfer {
  txHash: Hex;
  blockNumber: bigint;
  blockTime: number;
  txIndex: number;
  logIndex: number;
  tokenId: bigint;
  from: Address;
  to: Address;
  class: EventClass;
  rule: "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8";
  sale?: SaleInfo;
  /** True for anything that changes the owner; SALE is the only class that changes editions. */
  ownerChanged: boolean;
}

interface ChogTransferLog { logIndex: number; from: Address; to: Address; tokenId: bigint }

export function extractChogTransfers(tx: TxContext, chog: Address): ChogTransferLog[] {
  const out: ChogTransferLog[] = [];
  for (const log of tx.logs) {
    if (getAddress(log.address) !== chog || log.topics[0] !== TRANSFER_TOPIC) continue;
    invariant(log.topics.length === 4, `ERC-721 Transfer must have 4 topics (tx ${tx.hash} log ${log.logIndex})`);
    out.push({
      logIndex: log.logIndex,
      from: getAddress(`0x${log.topics[1]!.slice(26)}`),
      to: getAddress(`0x${log.topics[2]!.slice(26)}`),
      tokenId: BigInt(log.topics[3]!),
    });
  }
  return out;
}

const isChogItem = (chog: Address, tokenId?: bigint) => (i: { itemType: number; token: Address; identifier: bigint }) =>
  (i.itemType === ItemType.ERC721 || i.itemType === ItemType.ERC721_WITH_CRITERIA) &&
  i.token === chog && (tokenId === undefined || i.identifier === tokenId);

function paymentAsset(item: { itemType: number; token: Address }, wmon: Address): "MON" | "WMON" | null {
  if (item.itemType === ItemType.NATIVE && item.token === zeroAddress) return "MON";
  if (item.itemType === ItemType.ERC20 && item.token === wmon) return "WMON";
  return null;
}

/**
 * Classify every Chog Transfer in a tx (spec §8.2, first match wins).
 * Prices come from OrderFulfilled only (F22): a Seaport tx with no payment to the seller is not a sale.
 */
export function classifyTx(tx: TxContext, addr: ClassifierAddresses): ClassifiedTransfer[] {
  const to = tx.to ? getAddress(tx.to) : null;
  const transfers = extractChogTransfers(tx, addr.chog);
  const fills = decodeFills(tx.logs, addr.seaport16);
  const seaportInvolved = fills.length > 0 || to === addr.seaport16;

  return transfers.map((t) => {
    const base = {
      txHash: tx.hash, blockNumber: tx.blockNumber, blockTime: tx.blockTime, txIndex: tx.txIndex,
      logIndex: t.logIndex, tokenId: t.tokenId, from: t.from, to: t.to, ownerChanged: t.from !== t.to,
    };
    if (t.from === zeroAddress) return { ...base, class: "MINT" as const, rule: "R1" as const };

    if (seaportInvolved) {
      const sale = saleFor(t, transfers, fills, addr);
      if (sale) return { ...base, class: "SALE" as const, rule: "R2" as const, sale };
      return { ...base, class: "NO_PAYMENT_MOVE" as const, rule: "R3" as const };
    }
    if (to === addr.bulkTransferHelper) return { ...base, class: "BULK_MOVE" as const, rule: "R4" as const };
    if (to === addr.delegationManager) return { ...base, class: "SMART_WALLET_MOVE" as const, rule: "R5" as const };
    if (to === addr.chog) return { ...base, class: "TRANSFER" as const, rule: "R6" as const };
    if (to !== null && addr.knownRouters.includes(to)) return { ...base, class: "ROUTER_MOVE" as const, rule: "R7" as const };
    return { ...base, class: "UNCLASSIFIED" as const, rule: "R8" as const };
  });
}

function saleFor(t: ChogTransferLog, all: ChogTransferLog[], fills: Fill[], addr: ClassifierAddresses): SaleInfo | null {
  const seller = t.from;
  const tokenFills = fills.filter((f) => f.offer.some(isChogItem(addr.chog, t.tokenId)) || f.consideration.some(isChogItem(addr.chog, t.tokenId)));
  if (tokenFills.length === 0) return null;

  // Payments to the seller anywhere in the tx's fills (offer-accept splits NFT and payment across matched orders).
  const toSeller: Payment[] = [];
  for (const f of fills) for (const c of f.consideration) {
    const asset = paymentAsset(c, addr.wmon);
    if (asset && c.recipient === seller && c.amount > 0n) toSeller.push({ asset, amountWei: c.amount, recipient: c.recipient });
  }
  if (toSeller.length === 0) return null;

  const assets = new Set(toSeller.map((p) => p.asset));
  invariant(assets.size === 1, `mixed payment assets to seller in one tx`, { seller, assets: [...assets] });
  const asset = toSeller[0]!.asset;
  const totalToSellerWei = toSeller.reduce((s, p) => s + p.amountWei, 0n);

  const fees: Payment[] = [];
  for (const f of tokenFills) for (const c of f.consideration) {
    const a = paymentAsset(c, addr.wmon);
    if (a && c.recipient !== seller && c.amount > 0n) fees.push({ asset: a, amountWei: c.amount, recipient: c.recipient });
  }

  const bundleSize = all.filter((o) => o.from === seller && fills.some((f) => f.offer.some(isChogItem(addr.chog, o.tokenId)) || f.consideration.some(isChogItem(addr.chog, o.tokenId)))).length;
  const sellerOffersNft = tokenFills.some((f) => f.offerer === seller && f.offer.some(isChogItem(addr.chog, t.tokenId)));
  const buyerOrderPaysErc20 = tokenFills.some((f) => f.offerer !== seller && f.offer.some((o) => paymentAsset(o, addr.wmon) !== null));
  return {
    proceedsWei: bundleSize > 1 ? null : totalToSellerWei,
    asset,
    totalToSellerWei,
    fees,
    bundleSize,
    route: buyerOrderPaysErc20 || (!sellerOffersNft) ? "OFFER_ACCEPTED" : "LISTING_BOUGHT",
  };
}

/** Format wei as a decimal string with up to `dp` places (no float maths). */
export function formatUnits18(wei: bigint, dp = 2): string {
  const neg = wei < 0n; const v = neg ? -wei : wei;
  const whole = v / 10n ** 18n; const frac = v % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, "0").slice(0, dp).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${fracStr ? "." + fracStr : ""}`;
}
