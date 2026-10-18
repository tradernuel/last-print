import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { Failed, Loading, TxLink } from "../components/Bits";
import { mon, timeAgo, useData, type ChogIndex, type FeedItem, type Meta } from "../data";
import { api, onLiveSale, type LiveSale } from "../api";

type Sale = FeedItem & { outcome?: LiveSale["outcome"]; player?: string | null };
const outcomeText = (s: Sale) =>
  s.outcome === "CROWNED" ? `Last Print crowned for player ${s.player}` :
  s.outcome === "UNCLAIMED" ? "No Last Print claimed" :
  s.outcome === "SELF_SALE_NOT_CROWNED" ? "Closed without a crown (self-sale)" :
  `Edition ${s.closed} closed, now Edition ${s.next}`;

/** Live feed from the game server; falls back to the static chain snapshot if the server can't be reached. */
function useSales(fallback: ReturnType<typeof useData<FeedItem[]>>) {
  const [live, setLive] = useState<Sale[] | null>(null);
  useEffect(() => {
    let on = true;
    const load = () => api.feed().then((r) => on && setLive(r.sales), () => undefined);
    load();
    const stop = onLiveSale(() => load());
    return () => { on = false; stop(); };
  }, []);
  if (live) return { state: "ready" as const, data: live, live: true };
  return fallback.state === "ready" ? { state: "ready" as const, data: fallback.data as Sale[], live: false } : fallback;
}

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
type Phase = "before" | "stamp" | "after";

/** Replays the latest real sales: the card is stamped closed, then shows its new edition. Labelled as a replay. */
function HeroReplay({ feed, byId, meta }: { feed: Sale[]; byId: Map<number, ChogIndex>; meta: Meta }) {
  const items = feed.slice(0, 3);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>(reduceMotion() ? "stamp" : "before");
  useEffect(() => {
    if (reduceMotion()) return;
    const next: Record<Phase, [Phase, number]> = { before: ["stamp", 1400], stamp: ["after", 2200], after: ["before", 2600] };
    const [to, ms] = next[phase];
    const t = setTimeout(() => { if (phase === "after") setI((v) => (v + 1) % items.length); setPhase(to); }, ms);
    return () => clearTimeout(t);
  }, [phase, items.length]);
  const s = items[i];
  if (!s) return null;
  const c = byId.get(s.id);
  return (
    <div className="hero__replay" aria-live="polite">
      <div className={`flip flip--${phase}`}>
        <Card id={s.id} name={s.n} title={c?.ti} tier={c?.t ?? "Common"} bgHex={c?.bg ? meta.backgrounds[c.bg] : null}
          edition={phase === "after" ? s.next : s.closed} stamp={phase === "stamp" ? (s.outcome === "CROWNED" ? `LAST PRINT · Edition ${s.closed}` : `Edition ${s.closed} closed`) : null} />
      </div>
      <p className="hero__caption">
        <span className="tag">Replay</span> {s.n.split("—")[0]} sold {timeAgo(s.time)} for about {mon(s.price)}.{" "}
        {s.outcome === "CROWNED" ? <>Player {s.player}'s copy became its Last Print. </> : null}
        {phase === "after" ? <>Its card now prints Edition {s.next}.</> : <>Edition {s.closed} is closed.</>}{" "}
        <TxLink tx={s.tx}>See the sale</TxLink>
      </p>
      {reduceMotion() && items.length > 1 && (
        <button className="btn btn--quiet" onClick={() => setI((v) => (v + 1) % items.length)}>Show the next sale</button>
      )}
    </div>
  );
}

export function Ticker({ feed, limit = 12 }: { feed: Sale[]; limit?: number }) {
  return (
    <ol className="ticker">
      {feed.slice(0, limit).map((s) => (
        <li key={`${s.tx}-${s.id}`}>
          <Link to={`/chog/${s.id}`} className="ticker__name">{s.n.split("—")[0]}</Link>
          <span className={s.outcome === "CROWNED" ? "ticker__crown" : undefined}>{outcomeText(s)}</span>
          <span className="ticker__price">{mon(s.price)}</span>
          <TxLink tx={s.tx}>{timeAgo(s.time)}</TxLink>
        </li>
      ))}
    </ol>
  );
}

export function Home() {
  const staticFeed = useData<FeedItem[]>("feed.json");
  const feed = useSales(staticFeed);
  const chogs = useData<ChogIndex[]>("chogs.json");
  const meta = useData<Meta>("meta.json");
  const byId = useMemo(() => new Map(chogs.state === "ready" ? chogs.data.map((c) => [c.id, c]) : []), [chogs]);
  const err = [feed, chogs, meta].find((x) => x.state === "error");
  return (
    <>
      <section className="hero">
        <div className="hero__text">
          <h1>Every card is a real Chog.</h1>
          <p className="lede">When the real Chog sells on Monad, its card prints a new edition, and the last copy pulled before the sale becomes a one-of-one Last Print.</p>
          <div className="hero__actions">
            <Link to="/pack" className="btn">Open today's pack</Link>
            <Link to="/wall" className="btn btn--quiet">Watch the Edition Wall</Link>
          </div>
        </div>
        {err && err.state === "error" ? <Failed error={err.error} /> :
          feed.state === "ready" && meta.state === "ready" && chogs.state === "ready" ? <HeroReplay feed={feed.data} byId={byId} meta={meta.data} /> : <Loading what="the latest sales" />}
      </section>
      <section className="section">
        <h2>Latest real sales</h2>
        <p className="muted">Each sale closes the Chog's current edition. Every line links to its transaction.{"live" in feed && feed.live ? " Updates live." : ""}</p>
        {feed.state === "ready" ? <Ticker feed={feed.data} /> : feed.state === "loading" ? <Loading what="sales" /> : null}
      </section>
    </>
  );
}
