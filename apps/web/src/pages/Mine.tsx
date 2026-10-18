import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { Failed, Loading, TxLink } from "../components/Bits";
import { api, FOIL_LABEL, type OwnedCard } from "../api";
import { fmtDate } from "../data";

function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [v, setV] = useState<{ s: "loading" } | { s: "error"; e: string } | { s: "ready"; d: T }>({ s: "loading" });
  useEffect(() => { let live = true; fn().then((d) => live && setV({ s: "ready", d }), (e: Error) => live && setV({ s: "error", e: e.message })); return () => { live = false; }; }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export function Collection() {
  const col = useApi(() => api.collection());
  const me = useApi(() => api.me());
  const [f, setF] = useState<"all" | "lp" | "hot" | "foil">("all");
  const list = useMemo(() => {
    if (col.s !== "ready") return [];
    const c = col.d.cards;
    return f === "lp" ? c.filter((x) => x.lastPrint) : f === "hot" ? c.filter((x) => x.slot === "hot") : f === "foil" ? c.filter((x) => x.foils.length) : c;
  }, [col, f]);
  if (col.s === "error") return <section className="section"><h1>My cards</h1><Failed error={col.e} /></section>;
  return (
    <section className="section">
      <h1>My cards</h1>
      {me.s === "ready" && <p className="lede">{me.d.cards} cards, {me.d.chogs} different Chogs, {me.d.lastPrints} Last {me.d.lastPrints === 1 ? "Print" : "Prints"}. Streak: {me.d.streak} {me.d.streak === 1 ? "day" : "days"}.</p>}
      <div className="chips" role="group" aria-label="Show">
        {([["all", "All"], ["lp", "Last Prints"], ["hot", "Hot cards"], ["foil", "Foils"]] as const).map(([k, l]) => (
          <button key={k} className={`chip ${f === k ? "chip--on" : ""}`} aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>
        ))}
      </div>
      {col.s === "loading" ? <Loading what="your cards" /> : list.length === 0 ? (
        <p className="status">{col.d.cards.length === 0 ? <>No cards yet. <Link to="/pack">Open today's pack</Link>.</> : "No cards match this filter."}</p>
      ) : (
        <ul className="mine">
          {list.map((c) => (
            <li key={c.cardId}><Link to={`/card/${c.cardId}`}>
              <Card id={c.tokenId} name={c.name} tier={c.tier} edition={c.edition} printNo={c.printNo} foils={c.foils} hot={c.slot === "hot"} lastPrint={c.lastPrint?.edition ?? null}
                stamp={!c.lastPrint && c.closed ? `Edition ${c.edition} closed` : null} size="sm" />
            </Link></li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CardPage() {
  const { id } = useParams();
  const r = useApi(() => api.card(id ?? ""), [id]);
  if (r.s === "loading") return <Loading what="this card" />;
  if (r.s === "error") return <section className="section"><Failed error={r.e} /></section>;
  const { card: c, leaf, root } = r.d;
  return (
    <section className="section chog">
      <div className="chog__card"><Card id={c.tokenId} name={c.name} tier={c.tier} edition={c.edition} printNo={c.printNo} foils={c.foils} hot={c.slot === "hot"} lastPrint={c.lastPrint?.edition ?? null} stamp={!c.lastPrint && c.closed ? `Edition ${c.edition} closed` : null} /></div>
      <div className="chog__info">
        <h1>{c.name}, Edition {c.edition} #{c.printNo}</h1>
        <p className="muted">Pulled {fmtDate(c.pulledAt)} by player {c.player}. <Link to={`/chog/${c.tokenId}`}>This Chog's life on Monad</Link>.</p>
        {c.lastPrint && <p className="notice notice--gold"><strong>Last Print.</strong> This was the last copy pulled before the sale that closed Edition {c.lastPrint.edition}. <TxLink tx={c.lastPrint.saleTx}>The sale</TxLink>.</p>}
        {!c.lastPrint && c.closed && <p className="notice">Edition {c.edition} closed when this Chog sold. <TxLink tx={c.closed.saleTx}>The sale</TxLink>.</p>}
        <dl className="facts">
          <div><dt>Foils at pull</dt><dd>{c.foils.length ? c.foils.map((f) => FOIL_LABEL[f]).join(", ") : "None"}</dd></div>
          <div><dt>Slot</dt><dd>{c.slot === "hot" ? "Hot" : c.slot === "helper" ? "Album helper" : "Regular"}</dd></div>
        </dl>
        <h2>Proof of pull</h2>
        <p>This pull's fingerprint (leaf) is <code className="hash">{leaf}</code>.</p>
        {root ? <p>It was posted on Monad in block {root.block}, inside Merkle root <code className="hash">{root.root}</code>. {root.tx && root.tx !== "0x" && <TxLink tx={root.tx}>See the post</TxLink>}</p>
          : <p className="muted">Its fingerprint is being posted on Monad. This takes a few seconds.</p>}
      </div>
    </section>
  );
}

export function LastPrints() {
  const r = useApi(() => api.lastPrints());
  return (
    <section className="section narrow">
      <h1>Hall of Last Prints</h1>
      <p className="lede">Every one-of-one ever crowned. Each was pulled, and fingerprinted on Monad, in an earlier block than the sale that closed its edition.</p>
      {r.s === "loading" ? <Loading what="Last Prints" /> : r.s === "error" ? <Failed error={r.e} /> : r.d.lastPrints.length === 0 ? (
        <p className="status">No Last Prints yet. The first one is crowned when a Chog someone has pulled sells on Monad.</p>
      ) : (
        <ol className="ticker">
          {r.d.lastPrints.map((l) => (
            <li key={`${l.tokenId}-${l.edition}`}>
              <Link to={`/card/${l.cardId}`} className="ticker__name">{l.name.split("—")[0]}</Link>
              <span>Edition {l.edition}, held by {l.player}. Root in block {l.rootBlock}, sale in block {l.saleBlock}.</span>
              <TxLink tx={l.saleTx}>Sale</TxLink>
              {l.recordTx ? <TxLink tx={l.recordTx}>Proof on chain</TxLink> : <span className="muted">Recording…</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Odds() {
  const r = useApi(() => api.odds());
  const addrUrl = (a: string) => `https://monadscan.com/address/${a}`;
  return (
    <section className="section narrow">
      <h1>Odds and fairness</h1>
      <p className="lede">Each day's packs come from a secret seed. Its fingerprint is posted on Monad before any pack opens, and the seed itself is revealed the next day, so anyone can check no pack was changed.</p>
      {r.s === "loading" ? <Loading what="odds" /> : r.s === "error" ? <Failed error={r.e} /> : (
        <>
          <h2>Regular card odds</h2>
          <table className="real"><tbody>
            {Object.entries(r.d.odds.regularTierBp).map(([t, bp]) => <tr key={t}><th scope="row">{t}</th><td>{(bp / 100).toFixed(bp % 100 ? 1 : 0)}%</td></tr>)}
          </tbody></table>
          <p>Each pack has three regular cards, one album helper ({r.d.odds.albumHelperBp / 100}% chance it fills a Background you're missing) and one Hot card, a Chog listed for sale now, weighted toward the cheapest listings.</p>
          <h2>Daily seeds</h2>
          {r.d.printBook ? <p>Contract: <a className="txlink" href={addrUrl(r.d.printBook)} target="_blank" rel="noreferrer">PrintBook on Monadscan</a></p> : <p className="muted">The contract goes live with the game.</p>}
          {r.d.seeds.length === 0 ? <p className="status">No seeds yet.</p> : (
            <ol className="ticker">
              {r.d.seeds.map((s) => {
                const d = String(s.day);
                return (
                  <li key={s.day}>
                    <span className="ticker__name">{`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`}</span>
                    <span>Commitment <code className="hash">{s.commitment.slice(0, 18)}…</code>{s.seed ? <> revealed seed <code className="hash">{s.seed.slice(0, 18)}…</code></> : " (seed revealed tomorrow)"}</span>
                    {s.commit_tx ? <TxLink tx={s.commit_tx}>Commit</TxLink> : <span />}
                    {s.reveal_tx ? <TxLink tx={s.reveal_tx}>Reveal</TxLink> : <span />}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
