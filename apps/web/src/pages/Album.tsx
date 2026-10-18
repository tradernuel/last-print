import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Failed, Loading } from "../components/Bits";
import { api, type OwnedCard } from "../api";
import { art, useData, type ChogIndex, type Meta } from "../data";

const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary"] as const;

export function Album() {
  const chogs = useData<ChogIndex[]>("chogs.json");
  const meta = useData<Meta>("meta.json");
  const [cards, setCards] = useState<OwnedCard[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aura, setAura] = useState<{ thresholdChog: number; tokenIds: number[] } | null>(null);
  useEffect(() => { api.collection().then((c) => setCards(c.cards), (e: Error) => setErr(e.message)); }, []);
  useEffect(() => { api.chogAura().then(setAura, () => setAura(null)); }, []);

  const owned = useMemo(() => new Set((cards ?? []).map((c) => c.tokenId)), [cards]);
  const countries = useMemo(() => {
    if (chogs.state !== "ready") return [];
    const m = new Map<string, { total: number; mine: number }>();
    for (const c of chogs.data) if (c.bg) { const v = m.get(c.bg) ?? { total: 0, mine: 0 }; v.total++; if (owned.has(c.id)) v.mine++; m.set(c.bg, v); }
    return [...m].sort((a, b) => b[1].total - a[1].total);
  }, [chogs, owned]);

  if (err || chogs.state === "error") return <section className="section"><h1>Albums</h1><Failed error={err ?? (chogs as { error: string }).error} /></section>;
  if (!cards || chogs.state !== "ready") return <Loading what="your albums" />;
  const done = countries.filter(([, v]) => v.mine > 0).length;
  const legends = chogs.data.filter((c) => c.t === "Legendary");
  const tiersOwned = new Set(chogs.data.filter((c) => owned.has(c.id)).map((c) => c.t));
  const edition1 = new Set((cards ?? []).filter((c) => c.edition === 1).map((c) => c.tokenId)).size;
  const lastPrints = (cards ?? []).filter((c) => c.lastPrint).length;
  return (
    <section className="section">
      <h1>Albums</h1>
      <p className="lede">Collect real Chogs into sets. Your progress counts every card you've pulled.</p>

      <h2>World Album: {done} of {countries.length} countries</h2>
      <p className="muted">Each Chog's Background is its country. The rarest have only one to three Chogs in the whole collection.</p>
      <ul className="world">
        {countries.map(([name, v]) => (
          <li key={name} className={v.mine ? "world--have" : ""}>
            <span className="world__swatch" style={{ background: meta.state === "ready" ? meta.data.backgrounds[name] ?? "var(--mat-deep)" : "var(--mat-deep)" }} />
            <span className="world__name">{name}</span>
            <span className="world__count">{v.mine ? `${v.mine} held` : "missing"} · {v.total} exist{v.total <= 3 ? ", legendary country" : ""}</span>
          </li>
        ))}
      </ul>

      <h2>Legends: {legends.filter((l) => owned.has(l.id)).length} of 10</h2>
      <ul className="wall">
        {legends.map((l) => (
          <li key={l.id} className="tile tier-legendary">
            <Link to={`/chog/${l.id}`}>
              {owned.has(l.id) ? <img src={art(l.id, 256)} alt="" loading="lazy" /> : <span className="tile__locked" aria-hidden="true">?</span>}
              <span className="tile__name">{l.ti ?? l.n}{owned.has(l.id) ? "" : " (not yet)"}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2>$CHOG Collector{aura ? `: ${aura.tokenIds.filter((id) => owned.has(id)).length} of ${aura.tokenIds.length}` : ""}</h2>
      <p className="muted">{aura ? <>Chogs whose owners hold at least {aura.thresholdChog.toLocaleString("en-US")} $CHOG right now. Pull one and it carries the purple $CHOG Aura foil. The set changes as owners buy and sell $CHOG.</> : "Reading owners' $CHOG balances from Monad…"}</p>

      <h2>Sets</h2>
      <ul className="sets">
        <li><strong>Every Tier</strong> {TIERS.map((t) => <span key={t} className={tiersOwned.has(t) ? "set--have" : "set--miss"}>{t}</span>)}</li>
        <li><strong>Edition 1 of 10 Chogs</strong> {Math.min(edition1, 10)} of 10</li>
        <li><strong>Own a Last Print</strong> {lastPrints ? `${lastPrints} owned` : "not yet"}</li>
        <li><strong>Collector level</strong> {owned.size} of 1,969 Chogs ({[10, 50, 150, 400, 1000, 1969].filter((n) => owned.size >= n).length} of 6 levels)</li>
      </ul>
    </section>
  );
}

export function Inbox() {
  const [alerts, setAlerts] = useState<Awaited<ReturnType<typeof api.alerts>>["alerts"] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const chogs = useData<ChogIndex[]>("chogs.json");
  useEffect(() => { api.alerts().then((a) => setAlerts(a.alerts), (e: Error) => setErr(e.message)); }, []);
  const name = (id: number) => (chogs.state === "ready" ? chogs.data.find((c) => c.id === id)?.n ?? `#${id}` : `#${id}`);
  return (
    <section className="section narrow">
      <h1>Alerts</h1>
      {err ? <Failed error={err} /> : !alerts ? <Loading what="alerts" /> : alerts.length === 0 ? (
        <p className="status">Nothing yet. When a Chog you hold a Hot card of sells, or your card becomes a Last Print, it shows up here.</p>
      ) : (
        <ol className="ticker">
          {alerts.map((a) => (
            <li key={a.id}>
              <span className="ticker__name">{name(a.tokenId)}</span>
              <span className={a.kind === "LAST_PRINT" ? "ticker__crown" : undefined}>{a.kind === "LAST_PRINT" ? `Your card became the Last Print of Edition ${a.edition}` : `Sold on Monad: Edition ${a.edition} closed`}</span>
              <a className="txlink" href={`https://monadscan.com/tx/${a.saleTx}`} target="_blank" rel="noreferrer">Sale</a>
              <span className="muted">{new Date(a.at).toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
