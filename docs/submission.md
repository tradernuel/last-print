# Submission form texts

Fill `{{APP_URL}}`, `{{PRINTBOOK_ADDRESS}}`, `{{VIDEO_URL}}` and the `{{…}}` usage numbers (from https://last-print-server.onrender.com/api/stats on the day you submit). Use real numbers only.

---

## Project name

Last Print

## Short description

Every card is a real Chog. When the real Chog sells on Monad, its card prints a new edition, and the last copy pulled before the sale becomes a one-of-one Last Print.

## What we built and what makes it new

Last Print is a free daily card game where every card is one of the 1,969 real Chog Genesis NFTs, and the cards are alive.

**The rarity is written by the real market.** Each Chog's card is printed in editions. When the real Chog sells on Monad, its edition closes and the next one begins, so a Chog that changes hands often has many editions and one that never sells stays at Edition 1. The copy that was pulled last before the sale becomes a one-of-one **Last Print**. Nobody at Last Print decides what is rare: Chog owners do, by holding and selling.

**Provable, not promised.** Every pull is fingerprinted on Monad within seconds (a Merkle root posted to our PrintBook contract). A pull can only become a Last Print if its fingerprint landed in an earlier block than the sale, and the contract re-checks the Merkle proof and that ordering before it records the crown. Each day's pack seed is committed on chain before any pack opens and revealed the next day, so every pack can be recomputed.

**Real-life cards.** Stats come from each Chog's history on chain: Loyalty (how long its owner has held it), Journey (owners since mint), Fame (sales) and Value (last price against today's floor). Foils capture the Chog's real state at the moment you pull it: held since mint, long hold, listed for sale right now, just sold, or its owner holds $CHOG. A copy keeps the foils of the moment it captured.

**The daily loop.**
- Open a free pack of five real Chogs. One is a **Hot** card: a Chog listed for sale on OpenSea right now. If it sells, the last copy pulled before the sale becomes its Last Print.
- Watch the **Edition Wall**: all 1,969 Chogs and the edition each is printing, with real sales flipping cards live.
- **Duel the Market Boss**: three rounds against Chogs that really sold yesterday, with hidden picks. A win earns a bonus pack.
- Fill **albums**: 32 Background "countries" (some exist on only one Chog), the 10 Legends, a $CHOG Collector set and more.
- Every Chog has a page with its full life on Monad, every line linked to a transaction.

**What makes it new.** Card games with real-world stats exist, and so do NFT games that turn traits into stats. Last Print does something different: the parent NFT collection's own market creates the card game's rarity and editions in real time, and every one-of-one is provably timed against the sale that created it.

**Built carefully on real data.** We indexed every Chog transfer since mint and classified each one. Our 1,590 detected sales match OpenSea's own sale events one for one (same transaction, token and price); the only differences are three nominal-price moves (0.69 to 270 MON) that we deliberately don't count. Smart-wallet moves, bulk transfers and Seaport moves with no payment never print an edition.

**Usage so far ({{DATE}}):** {{PLAYERS}} players opened {{PACKS}} packs and pulled {{CARDS}} cards ({{HOT}} Hot cards); {{DUELS}} duels played; {{SALES}} real sales processed live; {{LAST_PRINTS}} Last Prints crowned; {{ROOTS}} pull fingerprints and {{SEEDS}} daily seeds posted on Monad.

## Why Chog matters

Take the Chogs out and nothing is left: no cards, no stats, no foils, no editions and no Last Prints. Every rarity in the game is created by the real Chog market. For owners it adds something new without asking anything of them: the longer they hold, the stronger their Chog's card plays for everyone, and when they sell, they close an edition across every player's collection and crown one Last Print. Players don't need a Chog or a wallet, so Last Print brings Chog culture to people who don't own one yet.

## $CHOG

The $CHOG Aura foil comes from the Chog owner's real $CHOG balance: every few hours the game reads the balance of every current Chog owner on Monad, and pulls of Chogs whose owners are among the top holders carry a purple $CHOG Aura. The same list forms the $CHOG Collector album set, which changes as owners buy and sell $CHOG.

## Links

- App: {{APP_URL}}
- Demo video: {{VIDEO_URL}}
- Repository: https://github.com/tradernuel/last-print
- Contract (PrintBook): https://monadscan.com/address/{{PRINTBOOK_ADDRESS}}
- Server status: https://last-print-server.onrender.com/api/health

## Judge access instructions

No wallet, no Chog and no sign-up needed. Open {{APP_URL}} in any browser.

1. Home: the card replays the latest real Chog sales (labelled Replay). The list below shows real sales live, each linked to Monadscan.
2. Pack → Open today's pack: five real Chogs, including a Hot card listed for sale right now. One free pack per day per browser.
3. Click any card: its proof of pull shows the Monad block where its fingerprint was posted.
4. Duel: three rounds against the Market Boss (Chogs sold yesterday). Pick a card for each round, then lock in. Win for a bonus pack.
5. Optional: Odds and fairness (today's seed commitment and past reveals on Monad), Hall of Last Prints (each crown with its sale and on-chain record), Wall and any Chog page (its full life on Monad).

To try more than one pack, open the app in a private window: each new browser is a new guest.

## Tech stack

TypeScript, Node 22, viem, SQLite, React, Vite, Solidity 0.8.28 with Foundry, Envio HyperSync, OpenSea API, Monad mainnet. Hosted on Vercel (site) and Render (game server).

## Pre-existing work

None. Everything was written during Chogathon, using public open-source libraries.

## What's next

Ghost League (async matches against other players' saved decks), weekly hunts generated from the week's real sales, passing duplicates to friends by link, push alerts when your card becomes a Last Print, and an optional soulbound on-chain certificate for Last Print holders (the contract is written and tested).

## Go-to-market (optional)

A daily "Last Print of the day" post on X with the card, the sale and its proof; a Discord bot that posts each crowned Last Print in the Chog community; and Chog-holder pages, so owners can see how many players hold their Chog's card and which editions it has printed.
