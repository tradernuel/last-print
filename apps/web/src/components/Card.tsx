import { useState } from "react";
import { art, type Tier } from "../data";
import { FOIL_LABEL, type Foil } from "../api";

export interface CardProps {
  id: number; name: string; title?: string | null; tier: Tier; edition: number;
  bgHex?: string | null; size?: "sm" | "lg"; stamp?: string | null;
  printNo?: number; foils?: Foil[]; hot?: boolean; lastPrint?: number | null;
}

/** A Last Print card: real Chog art in a frame coloured by Tier, with its current edition. */
export function Card({ id, name, title, tier, edition, bgHex, size = "lg", stamp, printNo, foils = [], hot, lastPrint }: CardProps) {
  const [missing, setMissing] = useState(false);
  const number = name.split("—")[0]!.trim();
  return (
    <figure className={`card card--${size} tier-${tier.toLowerCase()} ${foils.map((f) => `foil-${f.toLowerCase()}`).join(" ")}`} style={bgHex ? ({ "--accent": bgHex } as React.CSSProperties) : undefined}>
      <div className="card__art">
        {missing ? (
          <div className="card__noart" role="img" aria-label={`${number}, art not loaded`}>{number}</div>
        ) : (
          <img src={art(id, size === "lg" ? 512 : 256)} alt={`${number}${title ? `, ${title}` : ""}, ${tier}`} loading="lazy" decoding="async" onError={() => setMissing(true)} />
        )}
        {foils.length > 0 && <span className="foil-layer" aria-hidden="true" />}
        {foils.includes("FRESH") && <span className="corner">New home</span>}
        {hot && <span className="hotbadge">Hot</span>}
        {stamp && <span className="stamp" aria-hidden="true">{stamp}</span>}
        {lastPrint != null && !stamp && <span className="stamp stamp--gold" aria-hidden="true">Last Print</span>}
      </div>
      <figcaption className="card__plate">
        <span className="card__name">{title ?? number}</span>
        <span className="card__meta">
          <span className="card__tier">{title ? `${number}, ${tier}` : tier}</span>
          {edition > 0 && <span className="card__edition">Ed. {edition}{printNo ? <> #{printNo}</> : null}</span>}
        </span>
        {foils.length > 0 && <span className="card__foils">{foils.map((f) => FOIL_LABEL[f]).join(", ")}</span>}
        {lastPrint != null && <span className="card__lp">Last Print, Edition {lastPrint}</span>}
      </figcaption>
    </figure>
  );
}
