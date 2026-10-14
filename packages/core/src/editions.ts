import { type Hex } from "viem";
import { invariant } from "./errors.ts";
import { pullLeaf, buildTree, proofFor } from "./merkle.ts";

/** On-chain position used to order events (block, then tx index within the block). */
export interface ChainPos { block: bigint; txIndex: number }
export const before = (a: ChainPos, b: ChainPos) => a.block < b.block || (a.block === b.block && a.txIndex < b.txIndex);

export interface Pull {
  cardId: Hex; tokenId: bigint; edition: number; printNo: number; playerId: Hex;
  pulledAtMs: bigint; snapshotHash: Hex; leaf: Hex;
  root: Hex | null; // set once the leaf is in a posted root
  supersededBy?: Hex; // leaf of the re-issued copy when a late pull is moved to the next edition
}

export interface PostedRoot { root: Hex; pos: ChainPos; fromMs: bigint; toMs: bigint; leaves: Hex[] }

export interface SaleForEdition {
  tokenId: bigint; txHash: Hex; pos: ChainPos; logIndex: number; blockTimeMs: bigint;
  /** Set by the self-sale linker (decisions D4): the edition still closes, no Last Print is crowned. */
  selfSale: boolean;
}

export type CloseOutcome = "CROWNED" | "UNCLAIMED" | "PRE_GAME" | "SELF_SALE_NOT_CROWNED";

export interface EditionClose {
  tokenId: bigint; edition: number; sale: SaleForEdition; outcome: CloseOutcome;
  lastPrint: { pull: Pull; root: Hex; proof: Hex[]; rootPos: ChainPos } | null;
  /** Pulls printed as this edition but at/after the sale time; the caller re-issues them in the next edition. */
  latePulls: Pull[];
}

/**
 * Edition state for all Chogs (spec §10, with decisions D1-D2):
 * a pull can become a Last Print only if its root was posted on chain strictly before the sale tx.
 */
export class EditionBook {
  private editions = new Map<bigint, number>();
  private printCounters = new Map<string, number>();
  private pulls = new Map<Hex, Pull>();
  private byToken = new Map<bigint, Pull[]>();
  private roots = new Map<Hex, PostedRoot>();
  private closes: EditionClose[] = [];

  private readonly launch: ChainPos;
  constructor(launch: ChainPos) { this.launch = launch; }

  /** Seed the book from history: edition = 1 + sales since mint. Pre-launch closes are recorded as PRE_GAME. */
  loadHistoricalSale(sale: SaleForEdition): EditionClose {
    invariant(before(sale.pos, this.launch), "historical sale must be before launch");
    const n = this.edition(sale.tokenId);
    this.editions.set(sale.tokenId, n + 1);
    const close: EditionClose = { tokenId: sale.tokenId, edition: n, sale, outcome: "PRE_GAME", lastPrint: null, latePulls: [] };
    this.closes.push(close);
    return close;
  }

  edition(tokenId: bigint): number { return this.editions.get(tokenId) ?? 1; }

  recordPull(p: Omit<Pull, "edition" | "printNo" | "leaf" | "root">): Pull {
    const edition = this.edition(p.tokenId);
    const key = `${p.tokenId}:${edition}`;
    const printNo = (this.printCounters.get(key) ?? 0) + 1;
    this.printCounters.set(key, printNo);
    const pull: Pull = { ...p, edition, printNo, root: null, leaf: pullLeaf({ ...p, edition, printNo }) };
    invariant(!this.pulls.has(pull.leaf), "duplicate pull leaf");
    this.pulls.set(pull.leaf, pull);
    const list = this.byToken.get(p.tokenId) ?? [];
    list.push(pull);
    this.byToken.set(p.tokenId, list);
    return pull;
  }

  /** Build the root for a batch of unrooted pulls. Caller posts it, then calls confirmRoot with its chain position. */
  buildBatch(): { root: Hex; leaves: Hex[]; fromMs: bigint; toMs: bigint } | null {
    const pending = [...this.pulls.values()].filter((p) => p.root === null && !p.supersededBy);
    if (pending.length === 0) return null;
    pending.sort((a, b) => (a.pulledAtMs < b.pulledAtMs ? -1 : a.pulledAtMs > b.pulledAtMs ? 1 : 0));
    const leaves = pending.map((p) => p.leaf);
    return { root: buildTree(leaves).root, leaves, fromMs: pending[0]!.pulledAtMs, toMs: pending[pending.length - 1]!.pulledAtMs };
  }

  confirmRoot(batch: { root: Hex; leaves: Hex[]; fromMs: bigint; toMs: bigint }, pos: ChainPos): void {
    invariant(!this.roots.has(batch.root), "root already confirmed");
    invariant(buildTree(batch.leaves).root === batch.root, "root does not match leaves");
    for (const l of batch.leaves) {
      const p = this.pulls.get(l);
      invariant(p && p.root === null, "leaf unknown or already rooted", l);
      p.root = batch.root;
    }
    this.roots.set(batch.root, { ...batch, pos });
  }

  /** Close the current edition of a Chog on a final SALE. Must be called in chain order. */
  applySale(sale: SaleForEdition): EditionClose {
    invariant(!before(sale.pos, this.launch), "use loadHistoricalSale for pre-launch sales");
    const last = this.closes[this.closes.length - 1];
    if (last) invariant(!before(sale.pos, last.sale.pos) && !(last.sale.pos.block === sale.pos.block && last.sale.pos.txIndex === sale.pos.txIndex && sale.logIndex <= last.sale.logIndex), "sales must be applied in chain order");
    const n = this.edition(sale.tokenId);
    const copies = (this.byToken.get(sale.tokenId) ?? []).filter((p) => p.edition === n && !p.supersededBy);

    const candidates = copies.filter((p) => {
      if (p.pulledAtMs >= sale.blockTimeMs || p.root === null) return false;
      // Decision D2: the root must be in a strictly earlier block, which the PrintBook contract can enforce on chain.
      return this.roots.get(p.root)!.pos.block < sale.pos.block;
    });
    candidates.sort((a, b) => (a.pulledAtMs !== b.pulledAtMs ? (a.pulledAtMs > b.pulledAtMs ? -1 : 1) : a.printNo - b.printNo));
    const latePulls = copies.filter((p) => p.pulledAtMs >= sale.blockTimeMs);

    let outcome: CloseOutcome;
    let lastPrint: EditionClose["lastPrint"] = null;
    if (sale.selfSale) outcome = "SELF_SALE_NOT_CROWNED";
    else if (candidates.length === 0) outcome = "UNCLAIMED";
    else {
      const winner = candidates[0]!;
      const root = this.roots.get(winner.root!)!;
      lastPrint = { pull: winner, root: root.root, proof: proofFor(buildTree(root.leaves), winner.leaf), rootPos: root.pos };
      outcome = "CROWNED";
    }
    this.editions.set(sale.tokenId, n + 1);
    const close: EditionClose = { tokenId: sale.tokenId, edition: n, sale, outcome, lastPrint, latePulls };
    this.closes.push(close);
    return close;
  }

  /** Move a late pull to the edition that was actually open when it happened. */
  reissueLatePull(late: Pull): Pull {
    invariant(this.pulls.get(late.leaf) === late && !late.supersededBy, "pull already re-issued or unknown");
    const fresh = this.recordPull({ cardId: late.cardId, tokenId: late.tokenId, playerId: late.playerId, pulledAtMs: late.pulledAtMs, snapshotHash: late.snapshotHash });
    late.supersededBy = fresh.leaf;
    return fresh;
  }

  history(tokenId?: bigint): readonly EditionClose[] {
    return tokenId === undefined ? this.closes : this.closes.filter((c) => c.tokenId === tokenId);
  }
}
