import { useEffect, useState } from "react";

export type Tier = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";
export interface ChogIndex { id: number; n: string; ti: string | null; t: Tier; bg: string | null; e: number; s: number; ls: string | null; lp: number | null }
export interface FeedItem { id: number; n: string; time: string; tx: string; price: number | null; asset: string; closed: number; next: number }
export interface Meta { generatedAt: string; dataAsOf: string | null; transfers: number; sales: number; chogs: number; backgrounds: Record<string, string>; sources: string[] }
export interface TimelineItem { kind: "mint" | "sale" | "move"; cls: string; time: string; tx: string; from: string; to: string; price?: number | null; asset?: string; route?: string }
export interface ChogDetail {
  tokenId: number; name: string; title: string | null; traits: Record<string, string>; edition: number;
  owner: string | null; ownerSince: string | null; owners: number; timeline: TimelineItem[];
}

const cache = new Map<string, Promise<unknown>>();
export function load<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(path, fetch(`/data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`Couldn't load ${path} (HTTP ${r.status}).`);
      return r.json();
    }));
  }
  return cache.get(path) as Promise<T>;
}

export type Loadable<T> = { state: "loading" } | { state: "error"; error: string } | { state: "ready"; data: T };
export function useData<T>(path: string | null): Loadable<T> {
  const [v, setV] = useState<Loadable<T>>({ state: "loading" });
  useEffect(() => {
    if (!path) return;
    let live = true;
    setV({ state: "loading" });
    load<T>(path).then((data) => live && setV({ state: "ready", data }), (e: Error) => live && setV({ state: "error", error: e.message }));
    return () => { live = false; };
  }, [path]);
  return v;
}

export const txUrl = (tx: string) => `https://monadscan.com/tx/${tx}`;
export const addrUrl = (a: string) => `https://monadscan.com/address/${a}`;
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const art = (id: number, size: 256 | 512) => `/art/${size}/${id}.webp`;
export const mon = (n: number | null | undefined) => (n == null ? "a bundle price" : `${n.toLocaleString("en-US")} MON`);

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
export const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
