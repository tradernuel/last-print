import type { Address } from "viem";

/**
 * Self-sale check (decisions D4). Uses only facts known at sale time, so a crown is never revoked later.
 * The edition still closes (the sale is real); only the Last Print crown is withheld.
 */
export interface SelfSaleEvidence {
  seller: Address;
  buyer: Address;
  /** Wallets that sent MON/WMON to the buyer in the 30 days before the sale. */
  buyerFunders: ReadonlySet<Address>;
  /** Wallets signed in by the same player (from optional wallet sign-in). */
  sameUserWallets: ReadonlySet<Address>;
}

export function isSelfSale(e: SelfSaleEvidence): { selfSale: boolean; reason: string | null } {
  if (e.seller === e.buyer) return { selfSale: true, reason: "same wallet" };
  if (e.buyerFunders.has(e.seller)) return { selfSale: true, reason: "buyer funded by seller" };
  if (e.sameUserWallets.has(e.seller) && e.sameUserWallets.has(e.buyer)) return { selfSale: true, reason: "same signed-in player" };
  return { selfSale: false, reason: null };
}
