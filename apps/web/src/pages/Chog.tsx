import { Link, useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { Addr, Failed, Loading, TxLink } from "../components/Bits";
import { fmtDate, mon, useData, type ChogDetail, type Meta, type Tier } from "../data";

const MOVE_LABEL: Record<string, string> = {
  TRANSFER: "Moved by its owner", SMART_WALLET_MOVE: "Moved by a smart wallet", BULK_MOVE: "Moved in a bulk transfer",
  NO_PAYMENT_MOVE: "Moved through Seaport with no payment", NOMINAL_PRICE_MOVE: "Moved for a token amount (not counted as a sale)",
  ROUTER_MOVE: "Moved through a router", UNCLASSIFIED: "Moved (under review, never counted as a sale)",
};

export function Chog() {
  const { id } = useParams();
  const valid = id && /^\d+$/.test(id) ? id : null;
  const d = useData<ChogDetail>(valid ? `chog/${valid}.json` : null);
  const meta = useData<Meta>("meta.json");
  if (!valid) return <p className="status">That isn't a Chog token id. <Link to="/wall">Go to the wall</Link>.</p>;
  if (d.state === "error") return <Failed error={`Chog ${valid} wasn't found.`} />;
  if (d.state === "loading") return <Loading what="this Chog" />;
  const c = d.data;
  const tier = (c.traits.Tier ?? "Common") as Tier;
  const bg = c.traits.Background && meta.state === "ready" ? meta.data.backgrounds[c.traits.Background] : null;
  let edition = 0;
  const days = c.ownerSince ? Math.floor((Date.now() - Date.parse(c.ownerSince)) / 86_400_000) : null;
  return (
    <section className="section chog">
      <div className="chog__card"><Card id={c.tokenId} name={c.name} title={c.title} tier={tier} edition={c.edition} bgHex={bg} /></div>
      <div className="chog__info">
        <h1>{c.title ? `${c.title}` : c.name}</h1>
        {c.title && <p className="muted">{c.name.split("—")[0]}, one of the 10 Legends</p>}
        <dl className="facts">
          <div><dt>Printing now</dt><dd>Edition {c.edition}</dd></div>
          <div><dt>Owners since mint</dt><dd>{c.owners}</dd></div>
          {c.owner && <div><dt>Held by</dt><dd><Addr a={c.owner} />{days !== null && <>, for {days} {days === 1 ? "day" : "days"}</>}</dd></div>}
          {Object.entries(c.traits).filter(([k]) => k !== "Tier").map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <h2>Its life on Monad</h2>
        <ol className="timeline">
          {c.timeline.map((t) => {
            if (t.kind === "sale") edition += 1;
            return (
              <li key={`${t.tx}-${t.time}-${t.to}`} className={`timeline__${t.kind}`}>
                <span className="timeline__when">{fmtDate(t.time)}</span>
                <span className="timeline__what">
                  {t.kind === "mint" && <>Minted to <Addr a={t.to} />. Edition 1 starts.</>}
                  {t.kind === "sale" && <>Sold for about {mon(t.price)} {t.asset === "WMON" ? "(offer accepted)" : ""} to <Addr a={t.to} />. Edition {edition} closed before the game opened, so no Last Print.</>}
                  {t.kind === "move" && <>{MOVE_LABEL[t.cls] ?? "Moved"} to <Addr a={t.to} />. No edition change.</>}
                </span>
                <TxLink tx={t.tx}>Transaction</TxLink>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
