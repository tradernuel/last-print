# M0 data report (generated)

Generated 2026-10-15T15:18:23.292Z by `scripts/m0/report.ts`. Raw data is in `data/`.

## A3/A4: backfill
- 4849 Chog transfers since block 100000000, fetched in 63 s. **PASS**
- Tokens minted: 1969 (expected 1,969). **PASS**
- First mint: block 101704044 at 2026-09-03T19:58:42.000Z (spec F7: ≈ 101,704,044, 2026-09-03 19:58 UTC).
- By class: MINT 1969, TRANSFER 671, SALE 1580, UNCLASSIFIED 32, SMART_WALLET_MOVE 409, BULK_MOVE 185, NOMINAL_PRICE_MOVE 3

## Sales vs OpenSea (F15)
- Our SALE count 1580 vs OpenSea all-time sales 1553 (diff 1.7%). Target ±1%: **CHECK**

## 14-day window 2026-09-29 to 2026-10-13 (F18, F19)
- Sales 163 (spec 126), listing buys 95 (spec 104), offers accepted 68 (spec 22), distinct Chogs 106.
- Fewest sales in a day: 3 over 14 days (spec: never fewer than 2).
- Listing-buy prices: p25 5244, median 6000, p75 6499 MON (spec 4,999 / ≈5,452 / ≈6,700).

## Review lists
- UNCLASSIFIED: 32 transfers. By tx.to: 0xb497999D6460D738A2221C9579aa0960f30663AC (25), 0x0c13D51f3d52Bb74E4EB131a2ED6978A99a417cf (5), 0xfdB89767e570312b973AC4252e1e9066e0b0866a (1), 0x86485b8EEd03Bd710bF243982392dc61F3257785 (1)
- NOMINAL_PRICE_MOVE: 3. Examples: 0xf4c77ff7b1… 11.9 MON; 0xb3c2dbad6a… 270 MON; 0xb99816a462… 0.69 MON
- Bundles without per-item price: 0

## Metadata (F8, F11)
Metadata mirror did not complete.

## A5: OpenSea API
- listingsAll: HTTP 200, 100 items (more pages), 755 ms
  - sample: `{"tokenId":"1233","token":"0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763","currency":"MON","value":"5694990000000000000000","decimals":18}`
- listingsBest: HTTP 200, 100 items (more pages), 765 ms
  - sample: `{"tokenId":"1233","token":"0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763","currency":"MON","value":"5694990000000000000000","decimals":18}`
- offers: HTTP 200, 47 items, 746 ms
  - sample: `{"value":"82000000000000000000000","currency":"WMON","criteria":"collection/trait"}`
- saleEvents: HTTP 200, 50 items (more pages), 696 ms
  - sample: `{"tokenId":"1090","tx":"0x5427ca3e4f9b61549a4c71b759861af084422c1f57cbabe5f567d9e45a98c26d","quantity":1,"payment":{"quantity":"4949000000000000000000","token_address":"0x0000000000000000000000000000000000000000","decimals":18,"symbol":"MON"},"time":1792071142}`
- Stats HTTP 200; floor 5694.99 MON, owners 986.

