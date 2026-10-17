/** One-line JSON logs (journald keeps them). Never log secrets. */
const out = (level: string, msg: string, data?: Record<string, unknown>) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, ...data }, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
export const log = {
  info: (m: string, d?: Record<string, unknown>) => out("info", m, d),
  warn: (m: string, d?: Record<string, unknown>) => out("warn", m, d),
  error: (m: string, d?: Record<string, unknown>) => out("error", m, d),
};
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
