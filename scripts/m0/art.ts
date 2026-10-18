/**
 * Art mirror (spec §15, F9-F10, check A8). Downloads each Chog image once from IPFS, writes WebP copies at
 * 512 px and 256 px to apps/web/public/art/, and samples each Background's colour from the image corner.
 * Resumable: images already on disk are skipped. Never hot-links IPFS from the app.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { pool, readJson, ROOT, sleep, writeJson } from "./lib.ts";

const chogs = readJson<{ tokenId: number; image: string; attributes: { trait_type: string; value: string }[] }[]>("metadata/chogs.json");
if (!chogs) throw new Error("run metadata.ts first");

const GATEWAYS: ((cid: string, rest: string) => string)[] = [
  (c, r) => `https://${c}.ipfs.4everland.io/${r}`,
  (c, r) => `https://4everland.io/ipfs/${c}/${r}`,
  (c, r) => `https://${c}.ipfs.dweb.link/${r}`,
  (c, r) => `https://ipfs.io/ipfs/${c}/${r}`,
  (c, r) => `https://gateway.pinata.cloud/ipfs/${c}/${r}`,
  (c, r) => `https://${c}.ipfs.w3s.link/${r}`,
];
const dir = (size: number) => new URL(`apps/web/public/art/${size}/`, ROOT);
for (const s of [512, 256]) mkdirSync(dir(s), { recursive: true });
const errors: Record<string, number> = {};

async function download(uri: string, start: number): Promise<Buffer> {
  const [cid, ...rest] = uri.slice("ipfs://".length).split("/");
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < GATEWAYS.length; k++) {
      const url = GATEWAYS[(start + k) % GATEWAYS.length]!(cid!, rest.join("/"));
      const host = new URL(url).host.replace(cid!, "<cid>");
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (res.ok) return Buffer.from(await res.arrayBuffer());
        errors[`${host} ${res.status}`] = (errors[`${host} ${res.status}`] ?? 0) + 1;
      } catch (e) { errors[`${host} ${(e as Error).name}`] = (errors[`${host} ${(e as Error).name}`] ?? 0) + 1; }
    }
    await sleep(3000 * (round + 1));
  }
  throw new Error(`all gateways failed for ${uri}`);
}

// Fast source first: OpenSea's CDN copy of each token's original image (looked up by token id), then IPFS.
const cdn = new Map<number, string>();
if (process.env.OPENSEA_API_KEY) {
  let next: string | null = null, pages = 0;
  do {
    const url: string = `https://api.opensea.io/api/v2/collection/chog-genesis/nfts?limit=200${next ? `&next=${encodeURIComponent(next)}` : ""}`;
    const res: Response = await fetch(url, { headers: { accept: "application/json", "x-api-key": process.env.OPENSEA_API_KEY } });
    if (!res.ok) { console.log(`OpenSea NFT list ${res.status}; using IPFS only`); break; }
    const page: any = await res.json();
    for (const n of page.nfts ?? []) if (n.image_url) cdn.set(Number(n.identifier), n.image_url);
    next = page.next ?? null;
    await sleep(400);
  } while (next && ++pages < 30);
  console.log(`OpenSea CDN image URLs: ${cdn.size}`);
}

async function fromCdn(tokenId: number): Promise<Buffer | null> {
  const url = cdn.get(tokenId);
  if (!url) return null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      errors[`cdn ${res.status}`] = (errors[`cdn ${res.status}`] ?? 0) + 1;
    } catch (e) { errors[`cdn ${(e as Error).name}`] = (errors[`cdn ${(e as Error).name}`] ?? 0) + 1; }
    await sleep(1000 * (i + 1));
  }
  return null;
}

// Each run stops starting new downloads after ART_BUDGET_MIN minutes and saves what it has; the next run resumes.
const deadline = Date.now() + Number(process.env.ART_BUDGET_MIN ?? 50) * 60_000;
const failed: number[] = [];
let skipped = 0;
await pool(chogs, 10, async (c, i) => {
  const out512 = new URL(`${c.tokenId}.webp`, dir(512));
  const out256 = new URL(`${c.tokenId}.webp`, dir(256));
  if (existsSync(out512) && existsSync(out256)) return;
  if (Date.now() > deadline) { skipped++; return; }
  try {
    const buf = (await fromCdn(c.tokenId)) ?? (await download(c.image, i));
    await sharp(buf).resize(512, 512).webp({ quality: 82 }).toFile(out512.pathname);
    await sharp(buf).resize(256, 256).webp({ quality: 78 }).toFile(out256.pathname);
  } catch { failed.push(c.tokenId); }
}, "art");
console.log("gateway errors:", errors);

// A8: sample the top-left corner of each 256 px image; take the most common colour per Background value.
const votes = new Map<string, Map<string, number>>();
for (const c of chogs) {
  const bg = c.attributes.find((a) => a.trait_type === "Background")?.value;
  const file = new URL(`${c.tokenId}.webp`, dir(256));
  if (!bg || !existsSync(file)) continue;
  const { data } = await sharp(readFileSync(file)).extract({ left: 4, top: 4, width: 8, height: 8 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0;
  for (let p = 0; p < data.length; p += 3) { r += data[p]!; g += data[p + 1]!; b += data[p + 2]!; }
  const n = data.length / 3;
  const hex = "#" + [r / n, g / n, b / n].map((v) => Math.round(v / 4) * 4).map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("");
  const m = votes.get(bg) ?? new Map<string, number>();
  m.set(hex, (m.get(hex) ?? 0) + 1);
  votes.set(bg, m);
}
const backgrounds = Object.fromEntries([...votes].map(([bg, m]) => {
  const sorted = [...m].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  return [bg, { hex: sorted[0]![0], agreement: Number((sorted[0]![1] / total).toFixed(2)), samples: total }];
}));
writeJson("art/backgrounds.json", backgrounds);
const have = chogs.filter((c) => existsSync(new URL(`${c.tokenId}.webp`, dir(512))) && existsSync(new URL(`${c.tokenId}.webp`, dir(256)))).length;
writeJson("art/summary.json", { ranAt: new Date().toISOString(), images: have, missing: chogs.length - have, failedThisRun: failed.length, notStartedThisRun: skipped, errors });
console.log(`art: ${have} of ${chogs.length} images mirrored`);
if (have < chogs.length) throw new Error(`${chogs.length - have} images still missing; run the workflow again to resume (progress is saved)`);
console.log("art done");
