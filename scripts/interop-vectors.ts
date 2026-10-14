/** Prints the leaf/root/proof vectors hard-coded in contracts/test/PrintBook.t.sol. Run: node --experimental-strip-types scripts/interop-vectors.ts */
import { pad, zeroHash } from "viem";
import { pullLeaf, buildTree, proofFor } from "../packages/core/src/merkle.ts";

const base = { cardId: pad("0xc1"), tokenId: 1864n, edition: 8, printNo: 41, playerId: pad("0xa1"), pulledAtMs: 1760500000000n, snapshotHash: pad("0x5a") };
const leaf = pullLeaf(base);
const others = [1, 2, 3, 4].map((i) => pullLeaf({ ...base, printNo: 41 + i, snapshotHash: zeroHash }));
const tree = buildTree([leaf, ...others]);
console.log(JSON.stringify({ leaf, root: tree.root, proof: proofFor(tree, leaf) }, null, 2));
