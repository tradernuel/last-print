import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import { classifyTx, formatUnits18 } from "../src/classifier.ts";
import { CONFIG } from "../src/config.ts";
import { A, ADDR, MON, fillLog, native, nft, transferLog, tx, wmon } from "./helpers.ts";

describe("classifier", () => {
  it("R1: transfer from zero is MINT", () => {
    const [r] = classifyTx(tx(CONFIG.chog, [transferLog(zeroAddress, A.buyer, 7n)]), ADDR);
    expect(r!.class).toBe("MINT"); expect(r!.rule).toBe("R1");
  });

  it("R2: listing bought in MON, proceeds exclude fees", () => {
    const logs = [
      transferLog(A.seller, A.buyer, 7n),
      fillLog(A.seller, [nft(7n)], [native(MON(4652.06), A.seller), native(MON(49.49), A.opensea), native(MON(247.45), A.creator)], A.buyer),
    ];
    const [r] = classifyTx(tx(CONFIG.seaport16, logs), ADDR);
    expect(r!.class).toBe("SALE");
    expect(r!.sale!.asset).toBe("MON");
    expect(formatUnits18(r!.sale!.proceedsWei!)).toBe("4652.06");
    expect(r!.sale!.fees).toHaveLength(2);
    expect(r!.sale!.route).toBe("LISTING_BOUGHT");
  });

  it("R2: accepted offer paid in WMON across matched orders", () => {
    const logs = [
      transferLog(A.seller, A.buyer, 9n),
      fillLog(A.buyer, [{ ...wmon(MON(4422), A.buyer) }], [{ ...nft(9n), recipient: A.buyer }, wmon(MON(44.22), A.opensea)]),
      fillLog(A.seller, [nft(9n)], [wmon(MON(4377.78), A.seller)]),
    ];
    const [r] = classifyTx(tx(CONFIG.seaport16, logs), ADDR);
    expect(r!.class).toBe("SALE");
    expect(r!.sale!.asset).toBe("WMON");
    expect(r!.sale!.route).toBe("OFFER_ACCEPTED");
    expect(formatUnits18(r!.sale!.proceedsWei!)).toBe("4377.78");
  });

  it("R2: sale routed through a contract still counts when Seaport emits a paid fill", () => {
    const logs = [transferLog(A.seller, A.buyer, 3n), fillLog(A.seller, [nft(3n)], [native(MON(5200), A.seller)])];
    const [r] = classifyTx(tx(A.router, logs), ADDR);
    expect(r!.class).toBe("SALE");
  });

  it("R3: Seaport move with no payment to the seller is not a sale (F22 trap)", () => {
    const logs = [transferLog(A.seller, A.buyer, 5n), fillLog(A.seller, [nft(5n)], [{ ...nft(5n), recipient: A.buyer }])];
    const [r] = classifyTx(tx(CONFIG.seaport16, logs), ADDR);
    expect(r!.class).toBe("NO_PAYMENT_MOVE");
    expect(r!.sale).toBeUndefined();
  });

  it("R3: payment to someone other than the seller is not a sale", () => {
    const logs = [transferLog(A.seller, A.buyer, 5n), fillLog(A.seller, [nft(5n)], [native(MON(10), A.opensea)])];
    expect(classifyTx(tx(CONFIG.seaport16, logs), ADDR)[0]!.class).toBe("NO_PAYMENT_MOVE");
  });

  it("R3: Seaport tx with no fills at all", () => {
    expect(classifyTx(tx(CONFIG.seaport16, [transferLog(A.seller, A.buyer, 5n)]), ADDR)[0]!.class).toBe("NO_PAYMENT_MOVE");
  });

  it("R4-R7 and R8", () => {
    const t = () => [transferLog(A.seller, A.buyer, 1n)];
    expect(classifyTx(tx(CONFIG.bulkTransferHelper, t()), ADDR)[0]!.class).toBe("BULK_MOVE");
    expect(classifyTx(tx(CONFIG.delegationManager, t()), ADDR)[0]!.class).toBe("SMART_WALLET_MOVE");
    expect(classifyTx(tx(CONFIG.chog, t()), ADDR)[0]!.class).toBe("TRANSFER");
    expect(classifyTx(tx(A.router, t()), ADDR)[0]!.class).toBe("ROUTER_MOVE");
    const r = classifyTx(tx(A.buyer, t()), ADDR)[0]!;
    expect(r.class).toBe("UNCLASSIFIED"); expect(r.rule).toBe("R8");
  });

  it("bundle: two Chogs from one seller give no per-item price", () => {
    const logs = [
      transferLog(A.seller, A.buyer, 1n), transferLog(A.seller, A.buyer, 2n),
      fillLog(A.seller, [nft(1n), nft(2n)], [native(MON(10000), A.seller)]),
    ];
    const rs = classifyTx(tx(CONFIG.seaport16, logs), ADDR);
    expect(rs.map((r) => r.class)).toEqual(["SALE", "SALE"]);
    expect(rs[0]!.sale!.proceedsWei).toBeNull();
    expect(rs[0]!.sale!.bundleSize).toBe(2);
    expect(formatUnits18(rs[0]!.sale!.totalToSellerWei)).toBe("10000");
  });

  it("ignores Transfer logs from other contracts", () => {
    const l = transferLog(A.seller, A.buyer, 1n);
    expect(classifyTx(tx(CONFIG.chog, [{ ...l, address: A.router }]), ADDR)).toEqual([]);
  });

  it("fails loudly on mixed payment assets to the seller", () => {
    const logs = [transferLog(A.seller, A.buyer, 1n), fillLog(A.seller, [nft(1n)], [native(MON(1), A.seller), wmon(MON(1), A.seller)])];
    expect(() => classifyTx(tx(CONFIG.seaport16, logs), ADDR)).toThrow(/mixed payment/);
  });

  it("formatUnits18", () => {
    expect(formatUnits18(MON(6786.5))).toBe("6786.5");
    expect(formatUnits18(0n)).toBe("0");
    expect(formatUnits18(1n)).toBe("0");
  });
});
