# Decisions

Choices made where the build spec was silent or had to change. Each keeps the project's core rules (nothing fake shown as real, fair packs, provable pulls, no money).

**D1. No late-posted roots.** A pull can only become a Last Print if its root was posted on chain before the sale. A root posted after the sale could include a backdated leaf, so "posting lag allowed" is removed. Roots should post every few seconds while pulls exist (≈ 0.005 MON per post).

**D2. Strictly earlier block.** The root must be in a block strictly before the sale block. The EVM can't see transaction order inside a block, so this is the rule `PrintBook` can enforce itself. At ~0.3 s blocks the cost is negligible.

**D3. Hot snapshot in the leaf.** The listing snapshot hash is part of every pull leaf, so the Hot slot can be recomputed and checked like the other slots.

**D4. Self-sales close editions without a crown.** If the buyer was funded by the seller in the 30 days before the sale, the wallets are the same, or both wallets are signed in by the same player, the edition still advances (the sale is real) but no Last Print is crowned. The check uses only facts known at sale time, so a crown is never revoked later.

**D5. Boss duels skip Loyalty; round stats come from the seed.** Yesterday's sold Chogs always have Loyalty 1, which made round 1 a free win. Each day's three round stats are drawn from Journey, Fame and Value, with the Boss's picks fixed by the seed. The rank bonus is capped at +2 so Legends don't decide every round.

**D6. Original and Long Hold are exclusive.** Original wins. Otherwise nearly every card would carry both for weeks.

**D7. Legend odds 1.1%.** With 3 regular slots a day, 0.6% meant a Legend about every 55 days. 1.1% gives about one a month, as intended.

**D8. Pre-launch editions are PRE_GAME.** Sales before the game existed close editions marked "before Last Print existed", not "unclaimed".

**D9. Late pulls are re-issued.** A copy printed as edition n at or after the sale time (before the server processed the sale) is re-issued as edition n+1 with a new leaf. The old leaf is marked superseded and is never a candidate.

**D10. Sales are detected by Seaport's OrderFulfilled event, wherever the tx was sent.** A sale routed through another contract still counts if Seaport emitted a fill paying the seller. Prices come only from those fills.

**D11. Canonical JSON writes numbers as strings** and rejects undefined, NaN and non-plain objects, so hashes are stable.

**D12. Nominal-price moves are not sales.** A paid Seaport move below `minSalePriceMon` (1,000 MON, ~20% of the floor on 13 Oct) is classed `NOMINAL_PRICE_MOVE`: no edition change, listed for review. Found in real data: a "no payment" move that actually paid 0.69 MON.

**D13. "Price" means what the buyer paid.** Price = seller proceeds + fees, per token. Seller proceeds are stored separately. When a seller accepts an offer directly, the seller receives the offer amount and pays the fees from it, so price = the offer amount.

**D14. OpenSea's event list is the cross-check, not its stats number.** Every sale we detect matches an OpenSea sale event by tx, token and price. OpenSea's stats endpoint reports a lower total, so it isn't used as the check.

**D15. One server process and SQLite.** The indexer, listener, engine, prover, daily job and API run as loops in one Node process with one SQLite file (WAL), backed up nightly. On a 1 GB server this has fewer moving parts than separate processes and Postgres; the loops are isolated so one failing doesn't stop the others, and `/api/health` reports each.

**D16. The server makes its own wallet.** The key is generated on the server and stored only in its `.env` (mode 600). It never passes through chat, GitHub or a laptop.

**D17. $CHOG Aura waits for A7.** Pulls don't get the $CHOG Aura foil until its threshold is frozen from real balances; every other foil is live.

**D18. Self-sale check, first version.** A sale where buyer and seller are the same wallet closes the edition without a crown. The funding-link and signed-in-player checks (D4) come with wallet sign-in.
