import { invariant } from "./errors.ts";

/**
 * Canonical JSON (spec §13): sorted keys, no whitespace, numbers and bigints as strings.
 * Rejects undefined, NaN, Infinity, functions and non-plain objects so hashes are stable.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value, "$"));
}

function normalize(value: unknown, path: string): unknown {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      invariant(Number.isFinite(value), `non-finite number at ${path}`);
      return String(value);
    case "bigint":
      return value.toString();
    case "object": {
      if (Array.isArray(value)) return value.map((v, i) => normalize(v, `${path}[${i}]`));
      const proto = Object.getPrototypeOf(value);
      invariant(proto === Object.prototype || proto === null, `non-plain object at ${path}`);
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value as object).sort()) {
        const v = (value as Record<string, unknown>)[key];
        invariant(v !== undefined, `undefined value at ${path}.${key}`);
        out[key] = normalize(v, `${path}.${key}`);
      }
      return out;
    }
    default:
      invariant(false, `unsupported type ${typeof value} at ${path}`);
  }
}
