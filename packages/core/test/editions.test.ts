import { describe, expect, it } from "vitest";
import { pad, zeroHash, type Hex } from "viem";
import { EditionBook, type SaleForEdition } from "../src/editions.ts";
import { verifyProof } from "../src/merkle.ts";

const LAUNCH = { block: 1000n, txIndex: 0 };
const T0 = 1_760_000_000_000n;
let n = 0;
const card = () => pad(`0x${(++n).toString(16)}`) as Hex;
const P1 = pad("0xa1") as Hex, P2 = pad("0xa2") as Hex;
const sale = (tokenId: bigint, block: bigint, txIndex: number, timeMs: bigint, extra: Partial<SaleForEdition> = {}): SaleForEdition =>
  ({ tokenId, txHash: pad(`0x${block.toString(16)}${txIndex}`), pos: { block, txIndex }, logIndex: 0, blockTimeMs: timeMs, selfSale: false, ...extra });

function setup() {
  const book = new EditionBook(LAUNCH);
  const pull = (tokenId: bigint, player: Hex, atMs: bigint) => book.recordPull({ cardId: card(), tokenId, playerId: player, pulledAtMs: atMs, snapshotHash: zeroHash });
  const post = (block: bigint, txIndex = 0) => { const b = book.buildBatch()!; book.confirmRoot(b, { block, txIndex }); return b; };
  return { book, pull, post };
}

describe("editions and Last Prints", () => {
  it("print numbers count per edition", () => {
    const { book, pull } = setup();
    expect(pull(7n, P1, T0).printNo).toBe(1);
    expect(pull(7n, P2, T0 + 1n).printNo).toBe(2);
    expect(pull(8n, P2, T0 + 2n).printNo).toBe(1);
    expect(book.edition(7n)).toBe(1);
  });

  it("crowns the latest pull whose root was posted before the sale, with a valid proof", () => {
    const { book, pull, post } = setup();
    pull(7n, P1, T0); const late = pull(7n, P2, T0 + 5000n); post(1100n);
    const c = book.applySale(sale(7n, 1200n, 0, T0 + 10_000n));
    expect(c.outcome).toBe("CROWNED");
    expect(c.lastPrint!.pull.leaf).toBe(late.leaf);
    expect(verifyProof(late.leaf, c.lastPrint!.proof, c.lastPrint!.root)).toBe(true);
    expect(book.edition(7n)).toBe(2);
  });

  it("a root posted after the sale never counts, even if the pull time is earlier (backdating guard)", () => {
    const { book, pull, post } = setup();
    pull(7n, P1, T0); post(1100n);
    pull(7n, P2, T0 + 5000n); // pulled before sale time...
    post(1200n, 3);            // ...but its root lands in the sale block after the sale tx
    const c = book.applySale(sale(7n, 1200n, 2, T0 + 10_000n));
    expect(c.lastPrint!.pull.playerId).toBe(P1);
  });

  it("a root in the same block as the sale does not count, even at an earlier tx index", () => {
    const { book, pull, post } = setup();
    pull(7n, P2, T0); post(1200n, 1);
    expect(book.applySale(sale(7n, 1200n, 2, T0 + 1n)).outcome).toBe("UNCLAIMED");
  });

  it("a root one block before the sale counts", () => {
    const { book, pull, post } = setup();
    pull(7n, P2, T0); post(1199n, 9);
    expect(book.applySale(sale(7n, 1200n, 0, T0 + 1n)).outcome).toBe("CROWNED");
  });

  it("an unrooted pull cannot win", () => {
    const { book, pull } = setup();
    pull(7n, P1, T0);
    expect(book.applySale(sale(7n, 1200n, 0, T0 + 1n)).outcome).toBe("UNCLAIMED");
  });

  it("no copies pulled: UNCLAIMED, edition still advances", () => {
    const { book } = setup();
    const c = book.applySale(sale(9n, 1200n, 0, T0));
    expect(c.outcome).toBe("UNCLAIMED"); expect(book.edition(9n)).toBe(2);
  });

  it("ties on pull time go to the smaller print number", () => {
    const { book, pull, post } = setup();
    const a = pull(7n, P1, T0); pull(7n, P2, T0); post(1100n);
    expect(book.applySale(sale(7n, 1200n, 0, T0 + 1n)).lastPrint!.pull.leaf).toBe(a.leaf);
  });

  it("pulls at or after the sale time are late and re-issued into the next edition", () => {
    const { book, pull, post } = setup();
    pull(7n, P1, T0); const late = pull(7n, P2, T0 + 10_000n); post(1100n);
    const c = book.applySale(sale(7n, 1200n, 0, T0 + 10_000n));
    expect(c.lastPrint!.pull.playerId).toBe(P1);
    expect(c.latePulls.map((p) => p.leaf)).toEqual([late.leaf]);
    const fresh = book.reissueLatePull(late);
    expect(fresh.edition).toBe(2); expect(fresh.printNo).toBe(1);
    expect(() => book.reissueLatePull(late)).toThrow();
    expect(book.buildBatch()!.leaves).toEqual([fresh.leaf]);
  });

  it("self-sale closes the edition without a crown", () => {
    const { book, pull, post } = setup();
    pull(7n, P1, T0); post(1100n);
    const c = book.applySale(sale(7n, 1200n, 0, T0 + 1n, { selfSale: true }));
    expect(c.outcome).toBe("SELF_SALE_NOT_CROWNED"); expect(c.lastPrint).toBeNull(); expect(book.edition(7n)).toBe(2);
  });

  it("pre-launch sales are PRE_GAME, not UNCLAIMED", () => {
    const { book } = setup();
    expect(book.loadHistoricalSale(sale(7n, 900n, 0, T0)).outcome).toBe("PRE_GAME");
    expect(book.edition(7n)).toBe(2);
    expect(() => book.loadHistoricalSale(sale(7n, 1001n, 0, T0))).toThrow();
    expect(() => book.applySale(sale(7n, 999n, 0, T0))).toThrow();
  });

  it("two sales of one Chog in one block: second edition usually has no Last Print", () => {
    const { book, pull, post } = setup();
    pull(7n, P1, T0); post(1100n);
    const a = book.applySale({ ...sale(7n, 1200n, 1, T0 + 9n), logIndex: 1 });
    const b = book.applySale({ ...sale(7n, 1200n, 4, T0 + 9n), logIndex: 7 });
    expect(a.outcome).toBe("CROWNED"); expect(a.edition).toBe(1);
    expect(b.outcome).toBe("UNCLAIMED"); expect(b.edition).toBe(2);
    expect(book.edition(7n)).toBe(3);
  });

  it("sales must be applied in chain order", () => {
    const { book } = setup();
    book.applySale(sale(7n, 1300n, 0, T0));
    expect(() => book.applySale(sale(8n, 1200n, 0, T0))).toThrow(/chain order/);
  });

  it("each closed edition has exactly one crown or none", () => {
    const { book, pull, post } = setup();
    for (let i = 0; i < 20; i++) pull(BigInt(i % 4), i % 2 ? P1 : P2, T0 + BigInt(i));
    post(1100n);
    for (let t = 0; t < 4; t++) book.applySale(sale(BigInt(t), 1200n + BigInt(t), 0, T0 + 100n));
    const h = book.history();
    expect(h).toHaveLength(4);
    for (const c of h) expect(c.outcome === "CROWNED" ? c.lastPrint !== null : c.lastPrint === null).toBe(true);
  });

  it("confirmRoot rejects mismatched roots and double rooting", () => {
    const { book, pull } = setup();
    pull(7n, P1, T0);
    const b = book.buildBatch()!;
    expect(() => book.confirmRoot({ ...b, root: zeroHash }, { block: 1n, txIndex: 0 })).toThrow();
    book.confirmRoot(b, { block: 1100n, txIndex: 0 });
    expect(() => book.confirmRoot(b, { block: 1100n, txIndex: 0 })).toThrow();
    expect(book.buildBatch()).toBeNull();
  });
});
