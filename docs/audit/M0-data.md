# M0 data report (generated)

Generated 2026-10-16T12:28:37.824Z by `scripts/m0/report.ts`. Raw data is in `data/`.

## A3/A4: backfill
- 4851 Chog transfers since block 100000000, fetched in 64 s. **PASS**
- Tokens minted: 1969 (expected 1,969). **PASS**
- First mint: block 101704044 at 2026-09-03T19:58:42.000Z (spec F7: ≈ 101,704,044, 2026-09-03 19:58 UTC).
- By class: MINT 1969, TRANSFER 701, SALE 1580, UNCLASSIFIED 2, SMART_WALLET_MOVE 411, BULK_MOVE 185, NOMINAL_PRICE_MOVE 3

## Sales vs OpenSea (F15)
- All paid sales on Monad: 1580. Of these, 1580 paid the OpenSea fee; 0 did not (other marketplaces or no-fee orders). Every one is a real sale and prints an edition.
- OpenSea-fee sales 1580 vs OpenSea all-time sales 1563 (diff 1.1%). Target ±1%: **CHECK**
- Sales by contract called: 0x0000000000000068F116a894984e2DB1123eB395 (1161), 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3 (259), 0xb92fe925DC43a0ECdE6c8b1a2709c170Ec4fFf4f (87), 0xCcC88a9d1B4ED6b0EABA998850414b24f1c315bE (73)

## 14-day window 2026-09-29 to 2026-10-13 (F18, F19)
- Sales 163 (spec 126), listing buys 95 (spec 104), offers accepted 68 (spec 22), distinct Chogs 106.
- Fewest sales in a day: 3 over 14 days (spec: never fewer than 2).
- Listing-buy prices: p25 5244, median 6000, p75 6499 MON (spec 4,999 / ≈5,452 / ≈6,700).

## Review lists
- UNCLASSIFIED: 2 transfers (full receipts in data/review/receipts.json). By tx.to: 0xfdB89767e570312b973AC4252e1e9066e0b0866a (1), 0x86485b8EEd03Bd710bF243982392dc61F3257785 (1)
- NOMINAL_PRICE_MOVE: 3. Examples: 0xf4c77ff7b1… 11.9 MON; 0xb3c2dbad6a… 270 MON; 0xb99816a462… 0.69 MON
- Bundles without per-item price: 0

## Metadata (F8, F11)
- Token 1: "CHOG #1462" (expected "CHOG #1462") **PASS**
- Token 1021: "CHOG #513" (expected "CHOG #513") **PASS**
- Token 1864: "CHOG #1356" (expected "CHOG #1356") **PASS**
- totalSupply 1969, metadata files 1969. **PASS**
- Tiers: {"Uncommon":590,"Common":1279,"Rare":60,"Epic":30,"Legendary":10} (spec: Common 1279, Uncommon 590, Rare 60, Epic 30, Legendary 10)
- Trait types: Background 32 values on 1959; Base 4 values on 1969; Skin 14 values on 1959; Side 2 values on 1959; Body 96 values on 1762; Mouth 15 values on 1804; Eyes 58 values on 1959; Head 66 values on 1716; Accessory 9 values on 195; Form 2 values on 1959; Tier 5 values on 1969; Naked 2 values on 1959; Aura 22 values on 974
- Backgrounds: 32 values (spec F13: 32).

## A5: OpenSea API
- listingsAll: HTTP 200, 100 items (more pages), 670 ms
  - sample: `{"tokenId":"1466","token":"0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763","currency":"MON","value":"6240000000000000000000","decimals":18}`
- listingsBest: HTTP 200, 100 items (more pages), 757 ms
  - sample: `{"tokenId":"1466","token":"0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763","currency":"MON","value":"6240000000000000000000","decimals":18}`
- offers: HTTP 200, 50 items (more pages), 744 ms
  - sample: `{"value":"82000000000000000000000","currency":"WMON","criteria":"collection/trait"}`
- saleEvents: HTTP 200, 50 items (more pages), 659 ms
  - sample: `{"tokenId":"286","tx":"0xc53dde76704820505c10b71c64587b4b7521a6b082515204c3872667c2b99ff7","quantity":1,"payment":{"quantity":"6220000000000000000000","token_address":"0x0000000000000000000000000000000000000000","decimals":18,"symbol":"MON"},"time":1792100741}`
- Stats HTTP 200; floor 6240 MON, owners 979.

