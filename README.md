Every card is a real Chog. When the real Chog sells on Monad, its card prints a new edition, and the last copy pulled before the sale becomes a one-of-one Last Print.

# Last Print

A free daily card game built on the 1,969 Chog Genesis NFTs on Monad. Card stats come from each Chog's real life on chain, foils come from its real state at the moment you pull it, and editions are printed by its real sales. The market writes the rarity.

> Status: in development for Chogathon 2026. This README describes what exists in the repo today; the judge guide is added when the app is live.

## What is real

| Thing on a card | Where it comes from |
|---|---|
| Edition number | 1 + the Chog's real sales since mint, each linked to its sale transaction |
| Last Print | The last copy pulled before the sale, proven by a pull fingerprint posted on Monad in an earlier block than the sale |
| Stats | Hold time, owners, sales and last price, read from Monad and OpenSea, each with its source |
| Foils | The Chog's real state when the card was pulled (held since mint, listed, just sold, owner holds $CHOG) |
| Pack draws | HMAC of a daily seed that is committed on chain before packs open and revealed after |
| Art | Original Chog Genesis art by CHOGLABS |

No money is involved: no paid packs, no prizes, no token rewards, no trading. You don't need a Chog, a wallet or any token to play.

## Repo layout

| Path | Contents |
|---|---|
| `packages/core` | Sale classifier, editions and Last Print rules, pack draws, Merkle proofs, stats, foils, duel, Elo |
| `contracts` | `PrintBook` (seeds, pull roots, Last Prints) and `LastPrintCertificate` (soulbound), Foundry |
| `config` | Contract addresses, published odds, stat bands, foil thresholds |
| `scripts` | Fixture fetcher, pack verifier, interop vectors |
| `docs` | Decisions log and milestone audit notes |
| `apps/web`, `apps/api`, `workers` | Added in later milestones |

## Run it

```bash
npm install
npm test                 # core unit tests (offline)
npm run typecheck
cd contracts && forge test
```

Fetch real-transaction fixtures from Monad mainnet (needs network access to the RPC):

```bash
MONAD_RPC_HTTP=https://rpc.monad.xyz npm run fixtures:fetch
```

Verify a past pack from its revealed seed and stored inputs:

```bash
npm run verify:pack -- path/to/inputs.json
```

## How a Last Print is proven

1. Every pull is hashed into a leaf: card id, Chog token id, edition, print number, player id, pull time and the Hot listing snapshot hash.
2. Leaves are batched into a Merkle root and posted to `PrintBook` on Monad.
3. When a Chog sells, the winning copy is the latest pull whose root sits in an **earlier block** than the sale and whose pull time is before the sale time.
4. `PrintBook.recordLastPrint` re-checks all of this on chain, including the Merkle proof, so a pull can't be added after a sale is known.

## Credits

Chog Genesis art by CHOGLABS. Unofficial Chogathon entry.

## License

MIT
