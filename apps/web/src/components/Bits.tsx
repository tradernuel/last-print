import { addrUrl, shortAddr, txUrl } from "../data";

export const TxLink = ({ tx, children }: { tx: string; children?: React.ReactNode }) => (
  <a className="txlink" href={txUrl(tx)} target="_blank" rel="noreferrer">{children ?? "View on Monadscan"}</a>
);
export const Addr = ({ a }: { a: string }) => (
  <a className="addr" href={addrUrl(a)} target="_blank" rel="noreferrer" title={a}>{shortAddr(a)}</a>
);
export const Loading = ({ what }: { what: string }) => <p className="status" role="status">Loading {what}…</p>;
export const Failed = ({ error }: { error: string }) => (
  <p className="status status--error" role="alert">{error} Refresh the page to try again.</p>
);
