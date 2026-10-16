import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Failed, Loading } from "../components/Bits";
import { art, timeAgo, useData, type ChogIndex, type Meta } from "../data";

const FILTERS = {
  recent: { label: "Recently sold", fn: (l: ChogIndex[]) => l.filter((c) => c.ls).sort((a, b) => (b.ls! > a.ls! ? 1 : -1)) },
  editions: { label: "Highest editions", fn: (l: ChogIndex[]) => [...l].sort((a, b) => b.e - a.e || a.id - b.id) },
  never: { label: "Never sold", fn: (l: ChogIndex[]) => l.filter((c) => c.s === 0) },
  legends: { label: "Legends", fn: (l: ChogIndex[]) => l.filter((c) => c.t === "Legendary") },
  all: { label: "All", fn: (l: ChogIndex[]) => [...l].sort((a, b) => num(a) - num(b)) },
} as const;
type F = keyof typeof FILTERS;
const num = (c: ChogIndex) => Number(c.n.match(/#(\d+)/)?.[1] ?? 0);

export function Wall() {
  const chogs = useData<ChogIndex[]>("chogs.json");
  const meta = useData<Meta>("meta.json");
  const [f, setF] = useState<F>("recent");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    if (chogs.state !== "ready") return [];
    const l = FILTERS[f].fn(chogs.data);
    const n = q.replace(/[^0-9]/g, "");
    return n ? l.filter((c) => String(num(c)).startsWith(n)) : l;
  }, [chogs, f, q]);

  if (chogs.state === "error") return <Failed error={chogs.error} />;
  return (
    <section className="section">
      <h1>Edition Wall</h1>
      <p className="lede">All 1,969 Chogs and the edition each card is printing now. A Chog's edition goes up by one every time the real Chog sells.</p>
      {meta.state === "ready" && meta.data.dataAsOf && <p className="muted">Sales up to {timeAgo(meta.data.dataAsOf)}. {meta.data.sales.toLocaleString("en-US")} real sales so far.</p>}
      <div className="wall__controls">
        <div className="chips" role="group" aria-label="Show">
          {(Object.keys(FILTERS) as F[]).map((k) => (
            <button key={k} className={`chip ${f === k ? "chip--on" : ""}`} aria-pressed={f === k} onClick={() => setF(k)}>{FILTERS[k].label}</button>
          ))}
        </div>
        <label className="search">
          <span className="sr-only">Find a Chog by number</span>
          <input inputMode="numeric" placeholder="Find #1356" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {chogs.state === "loading" ? <Loading what="the wall" /> : list.length === 0 ? (
        <p className="status">No Chog matches #{q}. Numbers run from 1 to 1969.</p>
      ) : (
        <ul className="wall">
          {list.map((c) => (
            <li key={c.id} className={`tile tier-${c.t.toLowerCase()}`}>
              <Link to={`/chog/${c.id}`}>
                <img src={art(c.id, 256)} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                <span className="tile__name">{c.ti ?? c.n}</span>
                <span className="tile__ed" aria-label={`Edition ${c.e}`}>{c.e}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
