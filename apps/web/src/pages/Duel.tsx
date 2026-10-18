import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { Failed, Loading, TxLink } from "../components/Bits";
import { api, ApiError, STAT_HELP, STAT_LABEL, type DuelResult, type DuelToday, type OwnedCard } from "../api";
import { mon, timeAgo } from "../data";

const RANK: Record<string, number> = { Common: 0, Uncommon: 1, Rare: 1, Epic: 2, Legendary: 2 };

export function Duel() {
  const [today, setToday] = useState<DuelToday | null>(null);
  const [cards, setCards] = useState<OwnedCard[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [result, setResult] = useState<DuelResult | null>(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.duelToday().then((t) => { setToday(t); if (t.played) { setResult(t.played); setShown(3); } }, (e: Error) => setErr(e.message));
    api.collection().then((c) => setCards(c.cards), () => setCards([]));
  }, []);
  useEffect(() => { if (result && shown < 3) { const t = setTimeout(() => setShown((n) => n + 1), 1100); return () => clearTimeout(t); } }, [result, shown]);

  // One card per Chog: a player's best copy is the same Chog, so it has the same stats.
  const choices = useMemo(() => [...new Map((cards ?? []).map((c) => [c.tokenId, c])).values()], [cards]);
  const round = picks.length;

  async function play() {
    setBusy(true);
    try { const r = await api.playDuel(picks); setResult(r.result); setShown(0); }
    catch (e) { setErr((e as ApiError).message); }
    setBusy(false);
  }

  if (err) return <section className="section narrow"><h1>Duel</h1><Failed error={err} /></section>;
  if (!today || cards === null) return <Loading what="today's Duel" />;
  return (
    <section className="section">
      <h1>Duel the Market Boss</h1>
      <p className="lede">The Boss plays three Chogs that really sold on Monad {today.boss.every((b) => Date.now() - Date.parse(b.sale.time) < 2 * 86_400_000 && new Date(b.sale.time).getUTCDate() !== new Date().getUTCDate()) ? "yesterday" : "most recently"}. Pick one of your cards for each round; the Boss's picks stay hidden until you lock in. Win two rounds for a bonus pack.</p>
      <h2>The Boss's deck</h2>
      <ul className="mine">
        {today.boss.map((b) => (
          <li key={b.tokenId}>
            <Card id={b.tokenId} name={b.name} tier={b.tier} edition={0} size="sm" />
            <p className="pack__note">Sold {timeAgo(b.sale.time)} for about {mon(b.sale.price)}. <TxLink tx={b.sale.tx}>Sale</TxLink></p>
          </li>
        ))}
      </ul>

      {result ? (
        <>
          <h2>Result</h2>
          <ol className="duel">
            {result.rounds.slice(0, shown).map((r, i) => (
              <li key={i} className={`duel__round duel__round--${r.result.toLowerCase()}`}>
                <span className="duel__stat">Round {i + 1}: {STAT_LABEL[r.stat]}</span>
                <span>Your {r.player.name}: {r.player.stats[r.stat]}{RANK[r.player.tier] ? ` + ${RANK[r.player.tier]} rank` : ""}</span>
                <span>Boss {r.boss.name}: {r.boss.stats[r.stat]}{RANK[r.boss.tier] ? ` + ${RANK[r.boss.tier]} rank` : ""}</span>
                <strong>{r.result === "PLAYER" ? "You win" : r.result === "BOSS" ? "Boss wins" : "Tie"}</strong>
              </li>
            ))}
          </ol>
          {shown >= 3 && (
            <div className="notice">
              <p><strong>{result.winner === "PLAYER" ? "You beat the Market Boss." : result.winner === "BOSS" ? "The Market Boss wins today." : "A draw."}</strong>{" "}
                {result.winner === "PLAYER" ? <>Your bonus pack is ready. <Link to="/pack">Open it</Link>.</> : <>A new Boss arrives at 00:00 UTC with yesterday's sales.</>}</p>
            </div>
          )}
        </>
      ) : choices.length < 3 ? (
        <p className="notice">You need three different Chogs to duel. <Link to="/pack">Open today's pack</Link> first.</p>
      ) : (
        <>
          <h2>{round < 3 ? <>Round {round + 1}: {STAT_LABEL[today.roundStats[round]!]}</> : "Ready"}</h2>
          {round < 3 && <p className="muted">{STAT_LABEL[today.roundStats[round]!]} is {STAT_HELP[today.roundStats[round]!]}. Higher wins. Uncommon and Rare cards add +1, Epic and Legendary +2. Ties go to Journey.</p>}
          <ol className="picks">
            {today.roundStats.map((s, i) => {
              const c = choices.find((x) => x.cardId === picks[i]);
              return <li key={s}>{STAT_LABEL[s]}: {c ? <strong>{c.name}</strong> : <span className="muted">not picked</span>}</li>;
            })}
          </ol>
          {round < 3 ? (
            <ul className="mine">
              {choices.filter((c) => !picks.includes(c.cardId)).map((c) => (
                <li key={c.cardId}>
                  <button className="pick" onClick={() => setPicks([...picks, c.cardId])} aria-label={`Play ${c.name} in round ${round + 1}`}>
                    <Card id={c.tokenId} name={c.name} tier={c.tier} edition={c.edition} printNo={c.printNo} foils={c.foils} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="hero__actions">
              <button className="btn btn--big" onClick={play} disabled={busy}>{busy ? "Locking in…" : "Lock in and reveal"}</button>
              <button className="btn btn--quiet" onClick={() => setPicks([])}>Change picks</button>
            </div>
          )}
          {round > 0 && round < 3 && <button className="btn btn--quiet" onClick={() => setPicks(picks.slice(0, -1))}>Undo last pick</button>}
        </>
      )}
    </section>
  );
}
