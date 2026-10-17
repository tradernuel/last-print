/**
 * End-to-end flow on a local anvil chain (skipped when anvil isn't installed):
 * deploy PrintBook → commit seed → open a pack → post the pull root → close an edition → record the Last Print on chain.
 * Uses the real imported history and catalog; the sale itself is a test input, never shown live.
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasAnvil = (() => { try { execSync("anvil --version", { stdio: "ignore" }); return true; } catch { return false; } })();
const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // anvil test account 0
let anvil: ChildProcess;

describe.skipIf(!hasAnvil)("server flow on anvil", () => {
  const dir = mkdtempSync(join(tmpdir(), "lp-"));
  beforeAll(async () => {
    anvil = spawn("anvil", ["--port", "8599", "--chain-id", "143", "--silent"], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 1500));
    Object.assign(process.env, { MONAD_RPC_HTTP: "http://127.0.0.1:8599", SERVER_PRIVATE_KEY: KEY, WRITES_ENABLED: "true", DB_PATH: join(dir, "t.db"), OPENSEA_API_KEY: "test" });
  });
  afterAll(() => anvil?.kill());

  it("runs a pack through to an on-chain Last Print", async () => {
    const { createWalletClient, http, keccak256 } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { artifact, monad } = await import("../src/config.ts");
    const { publicClient, read, write } = await import("../src/chain.ts");
    const account = privateKeyToAccount(KEY as `0x${string}`);
    const wallet = createWalletClient({ account, chain: monad, transport: http("http://127.0.0.1:8599") });
    const pb = artifact("PrintBook");
    const dh = await wallet.deployContract({ abi: pb.abi, bytecode: pb.bytecode, args: [account.address], account, chain: monad });
    const addr = (await publicClient.waitForTransactionReceipt({ hash: dh })).contractAddress!;
    process.env.PRINTBOOK_ADDRESS = addr;

    const { openDb, setKv } = await import("../src/db.ts");
    const game = await import("../src/game.ts");
    const db = openDb(process.env.DB_PATH!);
    // Load real history so foils, editions and the Hot cap come from real data.
    execSync("node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/import-history.ts", { env: process.env, cwd: process.cwd(), stdio: "ignore" });

    const now = Date.now();
    const day = game.dayOf(now);
    const seed = keccak256("0x1234");
    db.prepare("INSERT INTO seeds (day, seed, commitment) VALUES (?, ?, ?)").run(day, seed, keccak256(seed));
    const c = await write("commitSeed", [day, keccak256(seed)]);
    db.prepare("UPDATE seeds SET commit_tx = ?, commit_block = ? WHERE day = ?").run(c.hash, Number(c.block), day);

    const player = game.newId();
    db.prepare("INSERT INTO players (id, created_ms) VALUES (?, ?)").run(player, now);
    const listings = [{ tokenId: 1, priceWei: 5000n * 10n ** 18n }, { tokenId: 2, priceWei: 5100n * 10n ** 18n }];
    const pack = game.openPackFor(db, player, now, listings);
    expect(pack.cards).toHaveLength(5);
    expect(pack.cards[4]!.slot).toBe("hot");
    expect(() => game.openPackFor(db, player, now, listings)).toThrow(/opened today's pack/);

    const batch = game.nextRootBatch(db)!;
    expect(batch.leaves).toHaveLength(5);
    const r = await write("postPullRoot", [batch.root, BigInt(batch.fromMs), BigInt(batch.toMs), batch.leaves.length]);
    game.confirmRoot(db, batch, r.hash, r.block);

    // Mine a few blocks, then a "sale" of the Hot card's Chog in a later block.
    for (let i = 0; i < 3; i++) await write("commitSeed", [day + 100 + i, keccak256(`0x0${i + 1}`)]);
    const hot = pack.cards[4]!;
    const saleBlock = Number(await publicClient.getBlockNumber());
    const close = game.closeEdition(db, { tx: keccak256("0xsale" as `0x${string}`), logIndex: 0, block: saleBlock, timeMs: now + 60_000, tokenId: hot.tokenId,
      from: "0x0000000000000000000000000000000000000001", to: "0x0000000000000000000000000000000000000002", price: "5000", asset: "MON" });
    expect(close.outcome).toBe("CROWNED");
    expect(close.winner!.cardId).toBe(hot.cardId);
    expect(game.edition(db, hot.tokenId)).toBe(hot.edition + 1);

    const w = close.winner!;
    const claim = { tokenId: BigInt(hot.tokenId), edition: hot.edition, cardId: w.cardId, printNo: w.printNo, playerId: w.playerId, pulledAtMs: BigInt(w.pulledMs),
      snapshotHash: w.snapshotHash, root: w.root, saleTx: keccak256("0xsale" as `0x${string}`), saleBlock: BigInt(saleBlock), saleTimeMs: BigInt(now + 60_000) };
    await write("recordLastPrint", [claim, w.proof]);
    expect(await read("lastPrintOf", [claim.tokenId, claim.edition])).toBe(w.cardId);

    // A second sale with no new pulls: unclaimed.
    const again = game.closeEdition(db, { tx: keccak256("0xsale2" as `0x${string}`), logIndex: 0, block: saleBlock + 1, timeMs: now + 120_000, tokenId: hot.tokenId,
      from: "0x0000000000000000000000000000000000000002", to: "0x0000000000000000000000000000000000000003", price: "5100", asset: "MON" });
    expect(again.outcome).toBe("UNCLAIMED");
    const alerts = db.prepare("SELECT kind FROM alerts WHERE player_id = ?").all(player) as { kind: string }[];
    expect(alerts.map((a) => a.kind)).toContain("LAST_PRINT");
  }, 60_000);
});
