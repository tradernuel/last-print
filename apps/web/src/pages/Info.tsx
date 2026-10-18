import { Link } from "react-router-dom";
import { fmtDate, useData, type Meta } from "../data";

export function About() {
  const meta = useData<Meta>("meta.json");
  return (
    <section className="section narrow">
      <h1>How Last Print works</h1>
      <p className="lede">Every card in the game is one of the 1,969 real Chog Genesis NFTs. Nothing on a card is made up.</p>
      <table className="real">
        <caption className="sr-only">Where each thing on a card comes from</caption>
        <tbody>
          <tr><th scope="row">Edition</th><td>1 plus the number of real sales of that Chog since mint. Every sale links to its transaction.</td></tr>
          <tr><th scope="row">Last Print</th><td>The last copy pulled before a sale. Its pull is fingerprinted on Monad in an earlier block than the sale, so it can't be faked afterwards.</td></tr>
          <tr><th scope="row">Stats</th><td>How long the owner has held it, how many owners it has had, and what it sold for.</td></tr>
          <tr><th scope="row">Foils</th><td>The Chog's real state when you pulled the card: held since mint, listed for sale, just sold, or owner holds $CHOG.</td></tr>
          <tr><th scope="row">Packs</th><td>Free. Drawn from a daily seed locked on Monad before packs open and revealed the next day.</td></tr>
        </tbody>
      </table>
      <p>No money is involved. There are no paid packs, prizes or token rewards, and you don't need a Chog or a wallet to play.</p>
      <h2>Data</h2>
      {meta.state === "ready" && <p className="muted">{meta.data.transfers.toLocaleString("en-US")} transfers and {meta.data.sales.toLocaleString("en-US")} sales read from Monad{meta.data.dataAsOf ? `, up to ${fmtDate(meta.data.dataAsOf)}` : ""}. Sources: {meta.data.sources.join("; ")}.</p>}
      <p>Wallets appear only as short addresses. If you own a Chog and would rather show as "a private collector", you'll be able to sign a message here to opt out.</p>
    </section>
  );
}

export function NotFound() {
  return <section className="section narrow"><h1>Nothing here</h1><p>This page doesn't exist. <Link to="/">Go to the home page</Link>.</p></section>;
}
