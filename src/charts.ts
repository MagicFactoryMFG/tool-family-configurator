// charts.ts — dependency-free inline-SVG line charts (spec §3.6). Each series is scaled to
// its own reference max so curve SHAPE is readable even when magnitudes differ; the legend
// states each series' real range so nothing is hidden.

export interface Series {
  name: string;
  color: string;
  ys: number[];
  refMax: number; // value mapped to the top of the plot (e.g. a cap, or the data max)
  fmt: (v: number) => string;
}

interface ChartOpts {
  title: string;
  xs: number[];
  xlabel: string;
  series: Series[];
  markerX?: number; // draw a vertical guide (e.g. the anchor L/D)
  width?: number;
  height?: number;
}

export function lineChart(o: ChartOpts): string {
  const W = o.width ?? 460;
  const H = o.height ?? 220;
  const m = { l: 38, r: 12, t: 10, b: 34 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const xmin = Math.min(...o.xs);
  const xmax = Math.max(...o.xs);
  const sx = (x: number) => m.l + (xmax === xmin ? 0 : ((x - xmin) / (xmax - xmin)) * pw);
  const sy = (frac: number) => m.t + (1 - Math.max(0, Math.min(1, frac))) * ph;

  const axes = `
    <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${m.t + ph}" class="axis"/>
    <line x1="${m.l}" y1="${m.t + ph}" x2="${m.l + pw}" y2="${m.t + ph}" class="axis"/>`;

  // x ticks (start, mid, end)
  const xticks = [xmin, (xmin + xmax) / 2, xmax]
    .map((x) => `<text x="${sx(x)}" y="${m.t + ph + 14}" class="tick" text-anchor="middle">${(+x.toFixed(2)).toString()}</text>`)
    .join("");

  const marker = o.markerX
    ? `<line x1="${sx(o.markerX)}" y1="${m.t}" x2="${sx(o.markerX)}" y2="${m.t + ph}" class="marker"/>
       <text x="${sx(o.markerX)}" y="${m.t + 8}" class="markerlbl" text-anchor="middle">anchor</text>`
    : "";

  const paths = o.series
    .map((s) => {
      const d = s.ys
        .map((y, i) => `${i === 0 ? "M" : "L"} ${sx(o.xs[i]).toFixed(1)} ${sy(s.refMax ? y / s.refMax : 0).toFixed(1)}`)
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
    })
    .join("");

  const legend = o.series
    .map((s, i) => {
      const lo = Math.min(...s.ys);
      const hi = Math.max(...s.ys);
      return `<g transform="translate(${m.l + 6}, ${m.t + 6 + i * 15})">
        <rect width="10" height="10" y="-9" fill="${s.color}"/>
        <text x="15" y="0" class="legend">${s.name} (${s.fmt(lo)}–${s.fmt(hi)})</text>
      </g>`;
    })
    .join("");

  return `<figure class="chart">
    <figcaption>${o.title}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
      ${axes}${xticks}${marker}${paths}${legend}
      <text x="${m.l + pw / 2}" y="${H - 4}" class="tick" text-anchor="middle">${o.xlabel}</text>
    </svg>
  </figure>`;
}
