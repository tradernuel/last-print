# Judge guide

**App:** https://last-print-om8f-ruddy.vercel.app

No wallet, no Chog, no sign-up. Your browser gets a guest id automatically.

## The three-minute path

1. **Home.** The card on the right is a replay (labelled "Replay") of the most recent real Chog sales on Monad. Watch it get stamped and turn to its new edition. Below it, the latest real sales update live; each links to Monadscan.
2. **Pack.** Click *Open today's pack*. Cards are dealt one by one:
   - three regular cards (odds published on *Odds and fairness*),
   - an **album helper** that tends to fill a Background you don't have yet,
   - a **Hot** card: a Chog listed for sale on OpenSea at this moment, with its price.
   Foils show the Chog's real state at the moment you pulled it, e.g. "Held since mint" (gold frame), "Long hold" (shimmer), "For sale" (holo), "$CHOG Aura" (purple glow: its owner holds $CHOG).
3. **Card page.** Click any card. *Proof of pull* shows its fingerprint and the Monad block where it was posted, normally within seconds.
4. **Duel.** Three rounds against the Market Boss, three Chogs that really sold yesterday, with stats from their real history. Pick a card per round; the Boss's picks are revealed together. A win unlocks a bonus pack.
5. **Wall and Chog pages.** All 1,969 Chogs with the edition each is printing now. Open any Chog to see its full life on Monad: mint, every move, every sale.

## Why a Last Print can't be faked

When a Chog sells at block *B*, only pulls whose Merkle root was posted on Monad in a block **before B** can win. The server then calls `recordLastPrint` on the PrintBook contract, which re-checks the Merkle proof, the root's block and the pull time, and reverts otherwise. Each day's pack seed is committed before packs open and revealed afterwards, so packs can be recomputed.

## If you want to dig deeper

- *Odds and fairness*: published odds, each day's seed commitment and reveal, with transactions.
- *Hall of Last Prints*: every crown with its sale, root block and on-chain record.
- `https://last-print-server.onrender.com/api/health`: live status of every part of the server.
- `https://last-print-server.onrender.com/api/stats`: real usage counts.
