// Number formatting per spec §4.
export const pct1 = (frac: number) => `${(frac * 100).toFixed(1)}%`; // radial %D
export const pct2 = (frac: number) => `${(frac * 100).toFixed(2)}%`; // chip load %D
export const num1 = (x: number) => x.toFixed(1); // feed, MRR
export const len3 = (x: number) => x.toFixed(3); // lengths
export const f3 = (x: number) => x.toFixed(3);
