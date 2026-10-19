Every card is a real Chog. When the real Chog sells on Monad, its card prints a new edition, and the last copy pulled before the sale becomes a one-of-one Last Print.

# Last Print

A free daily card game built on the 1,969 Chog Genesis NFTs on Monad. Card stats come from each Chog's real life on chain, foils come from its real state at the moment you pull it, and editions are printed by its real sales. The market writes the rarity; nobody at Last Print decides it.

**Play:** {{APP_URL}} · **Game server:** https://last-print-server.onrender.com/api/health · **Contract:** [PrintBook on Monadscan](https://monadscan.com/address/0x72a879f83e7f759743f5970ed4097fc4401476ec)

## For judges: three minutes, no wallet

1. **Open the app.** The home page replays the latest real Chog sales: the card is stamped "Edition n closed" (or "LAST PRINT · Edition n" when a player's copy was crowned) and turns to its new edition. Every line links to the sale on Monadscan.
2. **Pack → Open today's pack.** Five real Chogs. One is **Hot**: listed for sale on OpenSea right now. If it sells, the last copy pulled before the sale becomes its Last Print.
3. **Click a card.** Its proof of pull: the fingerprint and the Monad block it was posted in, seconds after you opened the pack.
4. **Duel.** Three rounds against the Market Boss, a deck of Chogs that really sold yesterday. Win for a bonus pack.
5. **Optional:** *Odds and fairness* shows today's seed commitment on Monad and past reveals; *Hall of Last Prints* shows every crown with its sale and proof.

More detail: [docs/judges.md](docs/judges.md).

## What is real

| On a card | Where it comes from |
|---|---|
| Edition | 1 + the Chog's real sales since mint. Every sale links to its transaction |
| Last Print | The last copy pulled before a sale. Its pull's Merkle root is on Monad in an **earlier block** than the sale; `PrintBook.recordLastPrint` re-checks the proof on chain |
| Stats | Loyalty (hold time), Journey (owners), Fame (sales), Value (last price vs floor), computed from chain history |
| Foils | The Chog's state at pull time: held since mint, long hold, listed for sale, just sold, owner holds $CHOG |
| Packs | HMAC of a daily seed committed on Monad before packs open and revealed the next day |
| Art | Original Chog Genesis art by CHOGLABS, mirrored once from IPFS |

No money is involved: no paid packs, prizes, token rewards or trading, and no Chog or wallet is needed to play.

## Checked against the real market

Every Chog transfer since mint (4,800+) was indexed and classified. All **1,590 sales** we detect match OpenSea's own sale events one for one, by transaction, token and price; OpenSea's 3 extra events are nominal-price moves (0.69, 11.9 and 270 MON) that we deliberately don't count as sales. Nine real transactions, including traps like a Seaport move with no payment and aggregator sweeps, are test fixtures. See [docs/audit/M0.md](docs/audit/M0.md).

## How it works

```
Monad ──▶ server (Render, 24/7)                         ──▶ website (Vercel)
          tail Chog transfers every 1.5 s, classify sales     packs, wall, cards, duel,
          close editions, crown Last Prints                   albums, proofs, live feed (SSE)
          post pull Merkle roots on chain every ~5 s
          commit / reveal the daily seed            ──▶ PrintBook contract on Monad
          read OpenSea listings and owners' $CHOG
```

| Path | Contents |
|---|---|
| `packages/core` | Sale classifier (Seaport `OrderFulfilled`), edition and Last Print rules, pack draws, Merkle proofs, stats, foils, duel |
| `contracts` | `PrintBook` (seeds, pull roots, on-chain-verified Last Prints) and a soulbound certificate, Foundry |
| `server` | Chain tail, prover, daily seeds, recorder, API with live updates; SQLite |
| `apps/web` | React + Vite site |
| `scripts`, `data` | Backfill, metadata and art mirrors, verification reports |

**Stack:** TypeScript, Node 22, viem, SQLite, React, Vite, Solidity 0.8.28 with Foundry, Envio HyperSync, OpenSea API. Hosting: Vercel (site), Render (server).

## Verify it yourself

- **A pack:** `npm run verify:pack -- inputs.json` recomputes a pack from the revealed seed and prints PASS or FAIL.
- **A Last Print:** each one in the Hall links the sale, the root's block and the `recordLastPrint` transaction, which only succeeds if the proof is valid and the root came first.
- **Tests:** `npm test` (core, including 9 real Monad transactions), `cd contracts && forge test` (23 tests, including a check that the Solidity leaf matches the TypeScript one), `npm test -w @last-print/server` (pack → root → sale → on-chain Last Print on a local chain).

## Credits

Chog Genesis art by CHOGLABS. Unofficial Chogathon entry. Wallets appear only as short addresses; owners can ask to be shown as "a private collector".

## License

MIT
