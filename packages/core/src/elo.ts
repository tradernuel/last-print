export const ELO_START = 1000;
export const ELO_K = 24;
/** score: 1 win, 0.5 draw, 0 loss for player A. Returns new integer ratings. */
export function elo(a: number, b: number, score: 0 | 0.5 | 1, k = ELO_K): [number, number] {
  const ea = 1 / (1 + 10 ** ((b - a) / 400));
  const da = k * (score - ea);
  return [Math.round(a + da), Math.round(b - da)];
}
