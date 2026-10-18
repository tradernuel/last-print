import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { api, ApiError, storageBlocked, type PulledCard } from "../api";

const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SLOT_NOTE: Record<string, string> = {
  hot: "Hot card: this Chog is listed for sale right now. If it sells, the last copy pulled before the sale becomes its Last Print.",
  helper: "Album helper: picked to fill a Background you don't have yet.",
};

export function Pack() {
  const [state, setState] = useState<"idle" | "opening" | "open" | "done" | "error">("idle");
  const [cards, setCards] = useState<PulledCard[]>([]);
  const [shown, setShown] = useState(0);
  const [hotMissing, setHotMissing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [opened, setOpened] = useState<boolean | null>(null);

  useEffect(() => { api.me().then((m) => setOpened(m.openedToday), () => setOpened(false)); }, []);
  useEffect(() => {
    if (state !== "open" || shown >= cards.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), reduce() ? 0 : shown === 0 ? 150 : 900);
    return () => clearTimeout(t);
  }, [state, shown, cards.length]);

  async function open() {
    setState("opening"); setError(null);
    try {
      const r = await api.openPack();
      setCards(r.cards); setHotMissing(r.hotMissing); setShown(0); setState("open");
    } catch (e) { setError(e as ApiError); setState("error"); }
  }

  return (
    <section className="section">
      <h1>Today's pack</h1>
      {state === "idle" && (
        <>
          <p className="lede">Five real Chogs, free, once a day. One of them is listed for sale right now.</p>
          {opened ? (
            <p>You've opened today's pack. A new one arrives at 00:00 UTC. <Link to="/collection">See your cards</Link>.</p>
          ) : (
            <button className="btn btn--big" onClick={open}>Open today's pack</button>
          )}
          <p className="muted">Packs are drawn from a seed locked on Monad before any pack opens. <Link to="/odds">Odds and fairness</Link>.</p>
        </>
      )}
      {state === "opening" && <p className="status" role="status">Opening your pack…</p>}
      {state === "error" && error && (
        <div className="notice" role="alert">
          <p><strong>{error.code === "SEED_COMMIT_FAIL" ? "Packs aren't open yet." : error.code === "ALREADY_OPENED" ? "Already opened today." : "The pack didn't open."}</strong> {error.message}</p>
          {error.code === "ALREADY_OPENED" ? <Link className="btn btn--quiet" to="/collection">See your cards</Link> : <button className="btn btn--quiet" onClick={open}>Try again</button>}
        </div>
      )}
      {(state === "open" || state === "done") && (
        <>
          {storageBlocked && <p className="notice">Your browser blocks storage, so your cards are saved for this visit only.</p>}
          <ol className="pack" aria-live="polite">
            {cards.map((c, i) => (
              <li key={c.cardId} className={`pack__slot ${i < shown ? "pack__slot--in" : ""}`}>
                {i < shown ? (
                  <>
                    <Link to={`/card/${c.cardId}`} aria-label={`${c.name}, edition ${c.edition}, print ${c.printNo}`}>
                      <Card id={c.tokenId} name={c.name} tier={c.tier} edition={c.edition} printNo={c.printNo} foils={c.foils} hot={c.slot === "hot"} size="sm" />
                    </Link>
                    {SLOT_NOTE[c.slot] && <p className="pack__note">{c.slot === "hot" && c.hot ? `Listed now at about ${c.hot.priceMon.toLocaleString("en-US")} MON. ` : ""}{SLOT_NOTE[c.slot]}</p>}
                  </>
                ) : <div className="pack__back" aria-hidden="true">?</div>}
              </li>
            ))}
          </ol>
          {shown >= cards.length && (
            <div className="pack__after">
              {hotMissing && <p className="muted">No Hot card this time: live listings weren't available when you opened.</p>}
              <p>Every card above is a real Chog. Each pull was fingerprinted on Monad within seconds, so if one of these Chogs sells and yours was the last copy pulled, it becomes a one-of-one Last Print.</p>
              <div className="hero__actions">
                <Link className="btn" to="/collection">See your cards</Link>
                <Link className="btn btn--quiet" to="/wall">Watch the Edition Wall</Link>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
