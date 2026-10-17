import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { CONFIG } from "../../packages/core/src/index.ts";
import { env } from "./config.ts";
import type { DB } from "./db.ts";
import { CATALOG, NAMES, PackError, openPackFor } from "./game.ts";
import { errMsg, log } from "./log.ts";
import { bus, currentListings, health } from "./workers.ts";

const short = (id: string | null) => (id ? `${id.slice(0, 6)}…${id.slice(-4)}` : null);
const isId = (s: unknown): s is Hex => typeof s === "string" && /^0x[0-9a-f]{64}$/.test(s);
const hits = new Map<string, { n: number; reset: number }>();

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ v: 1, generatedAt: new Date().toISOString(), ...(body as object) }));
}
const fail = (res: ServerResponse, status: number, code: string, message: string) => send(res, status, { error: { code, message } });

function cardView(r: any) {
  return { cardId: r.card_id, tokenId: r.token_id, name: NAMES.get(r.token_id), tier: CATALOG.find((c) => c.tokenId === r.token_id)!.tier,
    edition: r.edition, printNo: r.print_no, pulledAt: new Date(r.pulled_ms).toISOString(), slot: r.slot, foils: JSON.parse(r.foils),
    rooted: Boolean(r.root), lastPrint: r.lp_edition != null ? { edition: r.lp_edition, saleTx: r.lp_tx } : null, closed: r.closed_tx ? { saleTx: r.closed_tx, price: r.closed_price } : null };
}
const CARD_SELECT = `SELECT c.*, lp.edition AS lp_edition, lp.sale_tx AS lp_tx, cl.sale_tx AS closed_tx, cl.price AS closed_price FROM cards c
  LEFT JOIN edition_closes lp ON lp.card_id = c.card_id
  LEFT JOIN edition_closes cl ON cl.token_id = c.token_id AND cl.edition = c.edition`;

export function startApi(db: DB) {
  const sse = new Set<ServerResponse>();
  bus.addEventListener("sale", (e) => {
    const d = (e as CustomEvent).detail;
    const msg = `event: sale\ndata: ${JSON.stringify({ ...d, name: NAMES.get(d.tokenId), player: short(d.playerId), playerId: undefined })}\n\n`;
    for (const r of sse) r.write(msg);
  });
  setInterval(() => { for (const r of sse) r.write(": ping\n\n"); }, 25_000);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin ?? "";
    const allowed = env.corsOrigins.includes("*") || env.corsOrigins.includes(origin);
    if (allowed) { res.setHeader("access-control-allow-origin", origin || "*"); res.setHeader("vary", "origin"); }
    res.setHeader("access-control-allow-headers", "content-type, x-player");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "?";
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || h.reset < now) hits.set(ip, { n: 1, reset: now + 60_000 });
    else if (++h.n > 120) return fail(res, 429, "RATE_LIMIT", "Too many requests. Try again in a minute.");

    const url = new URL(req.url ?? "/", "http://x");
    const path = url.pathname.replace(/^\/api/, "");
    const player = req.headers["x-player"];
    try {
      if (req.method === "POST" && path === "/player") {
        const id = `0x${randomBytes(32).toString("hex")}`;
        db.prepare("INSERT INTO players (id, created_ms) VALUES (?, ?)").run(id, now);
        return send(res, 200, { playerId: id });
      }
      if (req.method === "POST" && path === "/pack/open") {
        if (!isId(player)) return fail(res, 400, "INVALID_INPUT", "Missing player id.");
        try {
          const r = openPackFor(db, player, now, currentListings());
          return send(res, 200, { ...r, cards: r.cards.map((c) => ({ ...c, pulledAt: new Date(c.pulledMs).toISOString() })) });
        } catch (e) {
          if (e instanceof PackError) return fail(res, e.code === "SEED_COMMIT_FAIL" ? 503 : 409, e.code, e.message);
          throw e;
        }
      }
      if (req.method !== "GET") return fail(res, 405, "INVALID_INPUT", "Method not allowed.");

      if (path === "/me") {
        if (!isId(player)) return fail(res, 400, "INVALID_INPUT", "Missing player id.");
        const p = db.prepare("SELECT streak, last_day FROM players WHERE id = ?").get(player) as any;
        if (!p) return fail(res, 404, "UNKNOWN_PLAYER", "Unknown player.");
        const today = Number(new Date(now).toISOString().slice(0, 10).replaceAll("-", ""));
        const opened = Boolean(db.prepare("SELECT 1 FROM packs WHERE player_id = ? AND day = ?").get(player, today));
        const counts = db.prepare("SELECT COUNT(*) AS cards, COUNT(DISTINCT token_id) AS chogs FROM cards WHERE player_id = ? AND superseded_by IS NULL").get(player) as any;
        const lastPrints = (db.prepare("SELECT COUNT(*) AS n FROM edition_closes WHERE player_id = ?").get(player) as any).n;
        return send(res, 200, { streak: p.streak, openedToday: opened, ...counts, lastPrints });
      }
      if (path === "/collection") {
        if (!isId(player)) return fail(res, 400, "INVALID_INPUT", "Missing player id.");
        const rows = db.prepare(`${CARD_SELECT} WHERE c.player_id = ? AND c.superseded_by IS NULL ORDER BY c.pulled_ms DESC LIMIT 2000`).all(player);
        return send(res, 200, { cards: rows.map(cardView) });
      }
      if (path === "/alerts") {
        if (!isId(player)) return fail(res, 400, "INVALID_INPUT", "Missing player id.");
        const rows = db.prepare("SELECT id, kind, body, created_ms, read FROM alerts WHERE player_id = ? ORDER BY created_ms DESC LIMIT 50").all(player) as any[];
        return send(res, 200, { alerts: rows.map((a) => ({ id: a.id, kind: a.kind, ...JSON.parse(a.body), at: new Date(a.created_ms).toISOString(), read: Boolean(a.read) })) });
      }
      const card = path.match(/^\/card\/(0x[0-9a-f]{64})$/);
      if (card) {
        const r = db.prepare(`${CARD_SELECT} WHERE c.card_id = ?`).get(card[1]) as any;
        if (!r) return fail(res, 404, "NOT_FOUND", "No such card.");
        const root = r.root ? db.prepare("SELECT root, tx, block FROM roots WHERE root = ?").get(r.root) : null;
        return send(res, 200, { card: { ...cardView(r), player: short(r.player_id) }, leaf: r.leaf, root });
      }
      if (path === "/feed") {
        const rows = db.prepare(`SELECT token_id, edition, sale_tx, sale_time_ms, price, asset, outcome, player_id, record_tx FROM edition_closes ORDER BY sale_block DESC, sale_log_index DESC LIMIT 60`).all() as any[];
        return send(res, 200, { sales: rows.map((r) => ({ id: r.token_id, n: NAMES.get(r.token_id), closed: r.edition, next: r.edition + 1, tx: r.sale_tx,
          time: new Date(r.sale_time_ms).toISOString(), price: r.price == null ? null : Math.round(Number(r.price)), asset: r.asset, outcome: r.outcome, player: short(r.player_id), recordTx: r.record_tx })) });
      }
      if (path === "/wall") {
        const rows = db.prepare("SELECT token_id, edition FROM editions").all() as any[];
        return send(res, 200, { editions: Object.fromEntries(rows.map((r) => [r.token_id, r.edition])) });
      }
      const chog = path.match(/^\/chog\/(\d+)$/);
      if (chog) {
        const id = Number(chog[1]);
        if (!NAMES.has(id)) return fail(res, 404, "NOT_FOUND", "No such Chog.");
        const ed = (db.prepare("SELECT edition FROM editions WHERE token_id = ?").get(id) as any)?.edition ?? 1;
        const closes = db.prepare("SELECT edition, sale_tx, sale_time_ms, price, outcome, player_id, record_tx FROM edition_closes WHERE token_id = ? ORDER BY edition").all(id) as any[];
        const copies = (db.prepare("SELECT COUNT(*) AS n FROM cards WHERE token_id = ? AND edition = ? AND superseded_by IS NULL").get(id, ed) as any).n;
        const listed = (currentListings() ?? []).find((l) => l.tokenId === id);
        return send(res, 200, { tokenId: id, edition: ed, copiesThisEdition: copies, listedMon: listed ? Number(listed.priceWei / 10n ** 18n) : null,
          closes: closes.map((c) => ({ edition: c.edition, tx: c.sale_tx, time: new Date(c.sale_time_ms).toISOString(), price: c.price == null ? null : Math.round(Number(c.price)), outcome: c.outcome, player: short(c.player_id), recordTx: c.record_tx })) });
      }
      if (path === "/last-prints") {
        const rows = db.prepare(`SELECT ec.*, r.tx AS root_tx, r.block AS root_block FROM edition_closes ec LEFT JOIN roots r ON r.root = ec.root WHERE ec.outcome = 'CROWNED' ORDER BY ec.sale_block DESC LIMIT 200`).all() as any[];
        return send(res, 200, { lastPrints: rows.map((r) => ({ tokenId: r.token_id, name: NAMES.get(r.token_id), edition: r.edition, cardId: r.card_id, player: short(r.player_id),
          saleTx: r.sale_tx, saleBlock: r.sale_block, root: r.root, rootTx: r.root_tx, rootBlock: r.root_block, recordTx: r.record_tx, proof: JSON.parse(r.proof ?? "[]") })) });
      }
      if (path === "/odds") {
        const seeds = db.prepare("SELECT day, commitment, commit_tx, reveal_tx, CASE WHEN reveal_tx IS NOT NULL THEN seed END AS seed FROM seeds ORDER BY day DESC LIMIT 30").all();
        return send(res, 200, { odds: CONFIG.odds, printBook: env.printBook(), seeds });
      }
      if (path === "/health") return send(res, 200, { health, writesEnabled: env.writesEnabled });
      if (path === "/stream") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(": connected\n\n");
        sse.add(res);
        req.on("close", () => sse.delete(res));
        return;
      }
      return fail(res, 404, "NOT_FOUND", "No such route.");
    } catch (e) {
      log.error("api error", { path, error: errMsg(e) });
      return fail(res, 500, "SERVER_ERROR", "Something went wrong on our side.");
    }
  });
  server.listen(env.port, "127.0.0.1", () => log.info("api listening", { port: env.port }));
  return server;
}
