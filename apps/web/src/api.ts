/** Client for the Last Print game server. Every call returns real data or a clear error, never a placeholder. */
export const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? "https://last-print-server.onrender.com";

export type Foil = "ORIGINAL" | "LONG_HOLD" | "FOR_SALE" | "FRESH" | "CHOG_AURA" | "LEGEND";
export interface PulledCard {
  cardId: string; tokenId: number; name: string; tier: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";
  edition: number; printNo: number; pulledAt: string; slot: "regular" | "helper" | "hot"; foils: Foil[]; hot?: { priceMon: number } | null;
}
export interface OwnedCard extends Omit<PulledCard, "hot"> { rooted: boolean; lastPrint: { edition: number; saleTx: string } | null; closed: { saleTx: string; price: string | null } | null }
export interface LiveSale { id: number; n: string; closed: number; next: number; tx: string; time: string; price: number | null; asset: string; outcome: "CROWNED" | "UNCLAIMED" | "PRE_GAME" | "SELF_SALE_NOT_CROWNED"; player: string | null; recordTx: string | null }

export class ApiError extends Error {
  code: string; status: number;
  constructor(code: string, message: string, status: number) { super(message); this.code = code; this.status = status; }
}

// Guest id: kept in localStorage; if storage is blocked, it lasts for this visit only (STORAGE_BLOCKED).
let memoryId: string | null = null;
export let storageBlocked = false;
function stored(): string | null {
  try { return localStorage.getItem("lp_player"); } catch { storageBlocked = true; return memoryId; }
}
function store(id: string) {
  try { localStorage.setItem("lp_player", id); } catch { storageBlocked = true; memoryId = id; }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}/api${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  } catch {
    throw new ApiError("NETWORK", "Can't reach the game server. Check your connection and try again.", 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error?.code ?? "SERVER_ERROR", body?.error?.message ?? `The game server answered ${res.status}.`, res.status);
  return body as T;
}

export async function playerId(): Promise<string> {
  const existing = stored();
  if (existing) return existing;
  const r = await call<{ playerId: string }>("/player", { method: "POST" });
  store(r.playerId);
  return r.playerId;
}
const withPlayer = async (): Promise<RequestInit> => ({ headers: { "x-player": await playerId() } });

export const api = {
  openPack: async () => call<{ day: number; cards: PulledCard[]; hotMissing: boolean }>("/pack/open", { method: "POST", ...(await withPlayer()) }),
  me: async () => call<{ streak: number; openedToday: boolean; bonusAvailable: boolean; cards: number; chogs: number; lastPrints: number }>("/me", await withPlayer()),
  duelToday: async () => call<DuelToday>("/duel/today", await withPlayer()),
  playDuel: async (cardIds: string[]) => call<{ result: DuelResult }>("/duel", { method: "POST", body: JSON.stringify({ cardIds }), ...(await withPlayer()) }),
  collection: async () => call<{ cards: OwnedCard[] }>("/collection", await withPlayer()),
  alerts: async () => call<{ alerts: { id: number; kind: string; tokenId: number; edition: number; saleTx: string; at: string; read: boolean }[] }>("/alerts", await withPlayer()),
  card: (id: string) => call<{ card: OwnedCard & { player: string }; leaf: string; root: { root: string; tx: string; block: number } | null }>(`/card/${id}`),
  feed: () => call<{ sales: LiveSale[] }>("/feed"),
  wall: () => call<{ editions: Record<string, number> }>("/wall"),
  lastPrints: () => call<{ lastPrints: { tokenId: number; name: string; edition: number; cardId: string; player: string; saleTx: string; saleBlock: number; root: string; rootTx: string | null; rootBlock: number | null; recordTx: string | null; proof: string[] }[] }>("/last-prints"),
  odds: () => call<{ odds: { regularTierBp: Record<string, number>; albumHelperBp: number }; printBook: string | null; seeds: { day: number; commitment: string; commit_tx: string | null; reveal_tx: string | null; seed: string | null }[] }>("/odds"),
  chogAura: () => call<{ thresholdChog: number; tokenIds: number[]; at: string }>("/chog-aura"),
  stats: () => call<{ stats: Record<string, number | string | null> }>("/stats"),
  health: () => call<{ health: Record<string, unknown>; writesEnabled: boolean }>("/health"),
};

/** Live sale events from the server (SSE). Returns a function that stops listening. */
export function onLiveSale(fn: (s: { tokenId: number; name: string; edition: number; outcome: string; tx: string; price: string | null; player: string | null }) => void): () => void {
  if (typeof EventSource === "undefined") return () => {};
  const es = new EventSource(`${API}/api/stream`);
  es.addEventListener("sale", (e) => { try { fn(JSON.parse((e as MessageEvent).data)); } catch { /* ignore malformed */ } });
  return () => es.close();
}

export const FOIL_LABEL: Record<Foil, string> = {
  ORIGINAL: "Held since mint", LONG_HOLD: "Long hold", FOR_SALE: "For sale", FRESH: "New home", CHOG_AURA: "$CHOG Aura", LEGEND: "Legend",
};

export type StatName = "loyalty" | "journey" | "fame" | "value";
export interface Stats { loyalty: number; journey: number; fame: number; value: number }
export interface BossCard { tokenId: number; name: string; tier: PulledCard["tier"]; stats: Stats; sale: { tx: string; time: string; price: number | null } }
export interface DuelResult { winner: "PLAYER" | "BOSS" | "DRAW"; rounds: { stat: StatName; result: "PLAYER" | "BOSS" | "VOID"; player: { tokenId: number; name: string; tier: string; stats: Stats }; boss: BossCard }[] }
export interface DuelToday { day: number; roundStats: StatName[]; boss: BossCard[]; played: DuelResult | null }
export const STAT_LABEL: Record<StatName, string> = { loyalty: "Loyalty", journey: "Journey", fame: "Fame", value: "Value" };
export const STAT_HELP: Record<StatName, string> = {
  loyalty: "how long its owner has held it", journey: "how many owners it has had", fame: "how many times it has sold", value: "its last sale price against today's floor",
};
