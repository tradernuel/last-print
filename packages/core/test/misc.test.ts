import { describe, expect, it } from "vitest";
import { getAddress, keccak256, toHex } from "viem";
import { canonicalize } from "../src/canonical.ts";
import { computeStats, rankBonus } from "../src/stats.ts";
import { computeFoils, thresholdsFromConfig } from "../src/foils.ts";
import { planDuel, resolveRound, runDuel, type DuelCard } from "../src/duel.ts";
import { elo, ELO_START } from "../src/elo.ts";
import { isSelfSale } from "../src/selfsale.ts";

const W = (n: number) => getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const MON = (n: number) => BigInt(n) * 10n ** 18n;

describe("canonical JSON", () => {
  it("sorts keys, strips spaces, stringifies numbers", () => {
    expect(canonicalize({ b: 1, a: { d: 2n, c: [true, null, "x"] } })).toBe('{"a":{"c":[true,null,"x"],"d":"2"},"b":"1"}');
  });
  it("rejects undefined, NaN and class instances", () => {
    expect(() => canonicalize({ a: undefined })).toThrow();
    expect(() => canonicalize({ a: NaN })).toThrow();
    expect(() => canonicalize({ a: new Date() })).toThrow();
  });
});

describe("stats", () => {
  const life = { holdDays: 0, distinctOwners: 1, salesCount: 0, lastSaleWei: null, floorWei: MON(5000), tier: "Common" as const };
  it("fresh mint", () => expect(computeStats(life)).toEqual({ loyalty: 1, journey: 1, fame: 1, value: 5 }));
  it("loyalty steps every 6 days and caps at 10", () => {
    expect(computeStats({ ...life, holdDays: 6 }).loyalty).toBe(2);
    expect(computeStats({ ...life, holdDays: 500 }).loyalty).toBe(10);
  });
  it("journey and fame cap", () => {
    expect(computeStats({ ...life, distinctOwners: 30, salesCount: 30 })).toMatchObject({ journey: 10, fame: 10 });
  });
  it("value bands use integer maths", () => {
    expect(computeStats({ ...life, lastSaleWei: MON(2000) }).value).toBe(1);
    expect(computeStats({ ...life, lastSaleWei: MON(5000) }).value).toBe(4);
    expect(computeStats({ ...life, lastSaleWei: MON(6786) }).value).toBe(7);
    expect(computeStats({ ...life, lastSaleWei: MON(20000) }).value).toBe(10);
  });
  it("fails loudly on bad input", () => {
    expect(() => computeStats({ ...life, distinctOwners: 0 })).toThrow();
    expect(() => computeStats({ ...life, floorWei: 0n })).toThrow();
    expect(() => computeStats({ ...life, holdDays: 1.5 })).toThrow();
  });
  it("rank bonus is capped at +2", () => expect(rankBonus("Legendary")).toBe(2));
});

describe("foils", () => {
  const t = { longHoldDays: 30, freshHours: 24, chogAuraMinBalance: 1000n };
  const now = 100 * 86_400_000;
  const base = { minter: W(1), owner: W(1), ownerSinceMs: 0, nowMs: now, listed: false, lastSaleMs: null, ownerChogBalance: 0n, isLegend: false };
  it("original beats long hold", () => expect(computeFoils(base, t)).toEqual(["ORIGINAL"]));
  it("long hold for a later owner", () => expect(computeFoils({ ...base, owner: W(2), lastSaleMs: 1 }, t)).toEqual(["LONG_HOLD"]));
  it("fresh, for sale, aura, legend", () => {
    expect(computeFoils({ ...base, owner: W(2), ownerSinceMs: now - 1000, lastSaleMs: now - 1000, listed: true, ownerChogBalance: 1000n, isLegend: true }, t))
      .toEqual(["FOR_SALE", "FRESH", "CHOG_AURA", "LEGEND"]);
  });
  it("aura threshold must be frozen before use", () => expect(() => thresholdsFromConfig()).toThrow(/not frozen/));
});

describe("duel", () => {
  const seed = keccak256(toHex("duel-seed"));
  const c = (tokenId: number, s: Partial<DuelCard["stats"]>, tier: DuelCard["tier"] = "Common"): DuelCard =>
    ({ tokenId, tier, stats: { loyalty: 1, journey: 1, fame: 1, value: 1, ...s } });
  it("plan is deterministic, excludes Loyalty, uses 3 distinct stats and a Boss permutation", () => {
    const p = planDuel(seed, "2026-10-15");
    expect(planDuel(seed, "2026-10-15")).toEqual(p);
    expect(new Set(p.roundStats).size).toBe(3); expect(p.roundStats).not.toContain("loyalty");
    expect([...p.bossOrder].sort()).toEqual([0, 1, 2]);
  });
  it("higher stat plus rank wins; tie goes to Journey; then void", () => {
    expect(resolveRound(c(1, { fame: 5 }), c(2, { fame: 4 }), "fame")).toBe("PLAYER");
    expect(resolveRound(c(1, { fame: 3 }, "Legendary"), c(2, { fame: 4 }), "fame")).toBe("PLAYER");
    expect(resolveRound(c(1, { fame: 4, journey: 2 }), c(2, { fame: 4 }), "fame")).toBe("PLAYER");
    expect(resolveRound(c(1, { fame: 4 }), c(2, { fame: 4 }), "fame")).toBe("VOID");
  });
  it("best of three", () => {
    const plan = { roundStats: ["fame", "value", "journey"] as const, bossOrder: [0, 1, 2] };
    const boss = [c(10, { fame: 5 }), c(11, { value: 5 }), c(12, { journey: 5 })];
    expect(runDuel({ ...plan, roundStats: [...plan.roundStats] }, boss, [c(1, { fame: 9 }), c(2, { value: 9 }), c(3, {})]).winner).toBe("PLAYER");
    expect(() => runDuel({ ...plan, roundStats: [...plan.roundStats] }, boss, [c(1, {}), c(1, {}), c(3, {})])).toThrow();
  });
});

describe("elo and self-sale", () => {
  it("elo is zero-sum and favours upsets", () => {
    const [a, b] = elo(ELO_START, ELO_START, 1);
    expect(a).toBe(1012); expect(b).toBe(988);
    expect(elo(900, 1100, 1)[0] - 900).toBeGreaterThan(12);
  });
  it("self-sale signals", () => {
    const none = new Set<ReturnType<typeof W>>();
    expect(isSelfSale({ seller: W(1), buyer: W(2), buyerFunders: none, sameUserWallets: none }).selfSale).toBe(false);
    expect(isSelfSale({ seller: W(1), buyer: W(2), buyerFunders: new Set([W(1)]), sameUserWallets: none }).reason).toBe("buyer funded by seller");
    expect(isSelfSale({ seller: W(1), buyer: W(2), buyerFunders: none, sameUserWallets: new Set([W(1), W(2)]) }).selfSale).toBe(true);
  });
});
