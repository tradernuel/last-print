import { concat, encodeAbiParameters, keccak256, zeroHash, type Hex } from "viem";
import { invariant } from "./errors.ts";

/** One pull, fingerprinted (spec §9.4 + decisions D3: snapshotHash is part of the leaf). */
export interface PullLeafInput {
  cardId: Hex;        // bytes32
  tokenId: bigint;
  edition: number;
  printNo: number;
  playerId: Hex;      // bytes32
  pulledAtMs: bigint;
  snapshotHash: Hex;  // bytes32; zeroHash when the slot is not Hot
}

const LEAF_PARAMS = [
  { type: "bytes32" }, { type: "uint256" }, { type: "uint32" }, { type: "uint32" },
  { type: "bytes32" }, { type: "uint64" }, { type: "bytes32" },
] as const;

/** Double-hashed leaf (protects against second-preimage attacks); matches PrintBook.pullLeaf. */
export function pullLeaf(p: PullLeafInput): Hex {
  invariant(Number.isInteger(p.edition) && p.edition >= 1, "edition must be >= 1");
  invariant(Number.isInteger(p.printNo) && p.printNo >= 1, "printNo must be >= 1");
  const inner = keccak256(encodeAbiParameters(LEAF_PARAMS, [
    p.cardId, p.tokenId, p.edition, p.printNo, p.playerId, p.pulledAtMs, p.snapshotHash ?? zeroHash,
  ]));
  return keccak256(inner);
}

export function hashPair(a: Hex, b: Hex): Hex {
  return BigInt(a) < BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

export interface MerkleTree { root: Hex; layers: Hex[][] }

export function buildTree(leaves: readonly Hex[]): MerkleTree {
  invariant(leaves.length > 0, "cannot build a tree with no leaves");
  invariant(new Set(leaves).size === leaves.length, "duplicate leaves");
  const layers: Hex[][] = [[...leaves]];
  while (layers[layers.length - 1]!.length > 1) {
    const prev = layers[layers.length - 1]!;
    const next: Hex[] = [];
    for (let i = 0; i < prev.length; i += 2) next.push(i + 1 < prev.length ? hashPair(prev[i]!, prev[i + 1]!) : prev[i]!);
    layers.push(next);
  }
  return { root: layers[layers.length - 1]![0]!, layers };
}

export function proofFor(tree: MerkleTree, leaf: Hex): Hex[] {
  let idx = tree.layers[0]!.indexOf(leaf);
  invariant(idx >= 0, "leaf not in tree");
  const proof: Hex[] = [];
  for (let l = 0; l < tree.layers.length - 1; l++) {
    const layer = tree.layers[l]!;
    const sib = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (sib < layer.length) proof.push(layer[sib]!);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

export function verifyProof(leaf: Hex, proof: readonly Hex[], root: Hex): boolean {
  let h = leaf;
  for (const p of proof) h = hashPair(h, p);
  return h === root;
}
