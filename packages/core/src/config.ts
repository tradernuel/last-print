import addresses from "../../../config/addresses.json" with { type: "json" };
import odds from "../../../config/odds.json" with { type: "json" };
import stats from "../../../config/stats.json" with { type: "json" };
import foils from "../../../config/foils.json" with { type: "json" };
import { getAddress, type Address } from "viem";

export const CONFIG = {
  chainId: addresses.chainId,
  chog: getAddress(addresses.chog),
  seaport16: getAddress(addresses.seaport16),
  bulkTransferHelper: getAddress(addresses.bulkTransferHelper),
  delegationManager: getAddress(addresses.delegationManager),
  chogToken: getAddress(addresses.chogToken),
  wmon: getAddress(addresses.wmon),
  knownRouters: (addresses.knownRouters as string[]).map((a) => getAddress(a)) as Address[],
  odds,
  stats,
  foils,
} as const;

export const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary"] as const;
export type Tier = (typeof TIERS)[number];
