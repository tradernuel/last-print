import { useState } from "react";
import { art, type Tier } from "../data";

export interface CardProps {
  id: number; name: string; title?: string | null; tier: Tier; edition: number;
  bgHex?: string | null; size?: "sm" | "lg"; stamp?: string | null;
}

/** A Last Print card: real Chog art in a frame coloured by Tier, with its current edition. */
export function Card({ id, name, title, tier, edition, bgHex, size = "lg", stamp }: CardProps) {
  const [missing, setMissing] = useState(false);
  const number = name.split("—")[0]!.trim();
  return (
    <figure className={`card card--${size} tier-${tier.toLowerCase()}`} style={bgHex ? ({ "--accent": bgHex } as React.CSSProperties) : undefined}>
      <div className="card__art">
        {missing ? (
          <div className="card__noart" role="img" aria-label={`${number}, art not loaded`}>{number}</div>
        ) : (
          <img src={art(id, size === "lg" ? 512 : 256)} alt={`${number}${title ? `, ${title}` : ""}, ${tier}`} loading="lazy" decoding="async" onError={() => setMissing(true)} />
        )}
        {stamp && <span className="stamp" aria-hidden="true">{stamp}</span>}
      </div>
      <figcaption className="card__plate">
        <span className="card__name">{title ?? number}</span>
        <span className="card__meta">
          <span className="card__tier">{title ? `${number}, ${tier}` : tier}</span>
          <span className="card__edition">Ed. {edition}</span>
        </span>
      </figcaption>
    </figure>
  );
}
