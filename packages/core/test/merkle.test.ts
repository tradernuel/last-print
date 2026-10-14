import { describe, expect, it } from "vitest";
import { keccak256, pad, toHex, zeroHash, type Hex } from "viem";
import { buildTree, proofFor, pullLeaf, verifyProof } from "../src/merkle.ts";

const leaves = (n: number): Hex[] => Array.from({ length: n }, (_, i) => keccak256(toHex(`leaf${i}`)));

describe("merkle", () => {
  it("single leaf: root is the leaf, empty proof", () => {
    const [l] = leaves(1); const t = buildTree([l!]);
    expect(t.root).toBe(l); expect(proofFor(t, l!)).toEqual([]);
  });
  for (const n of [2, 3, 4, 5, 7, 8, 9, 16, 17, 33]) {
    it(`every proof verifies for ${n} leaves`, () => {
      const ls = leaves(n); const t = buildTree(ls);
      for (const l of ls) expect(verifyProof(l, proofFor(t, l), t.root)).toBe(true);
    });
  }
  it("a tampered leaf fails", () => {
    const ls = leaves(6); const t = buildTree(ls);
    expect(verifyProof(keccak256("0x01"), proofFor(t, ls[2]!), t.root)).toBe(false);
  });
  it("rejects empty and duplicate leaves", () => {
    expect(() => buildTree([])).toThrow();
    const [l] = leaves(1); expect(() => buildTree([l!, l!])).toThrow(/duplicate/);
  });
  it("pull leaf changes with every field", () => {
    const base = { cardId: pad("0x1"), tokenId: 1864n, edition: 8, printNo: 41, playerId: pad("0x2"), pulledAtMs: 1_760_000_000_000n, snapshotHash: zeroHash };
    const l0 = pullLeaf(base);
    expect(pullLeaf({ ...base })).toBe(l0);
    for (const change of [{ edition: 9 }, { printNo: 42 }, { pulledAtMs: 1n }, { tokenId: 1n }, { snapshotHash: pad("0x3") }])
      expect(pullLeaf({ ...base, ...change })).not.toBe(l0);
    expect(() => pullLeaf({ ...base, edition: 0 })).toThrow();
  });
});
