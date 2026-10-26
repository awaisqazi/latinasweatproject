// Día de los Muertos flair (flat cut paper only), shared by
// /diadelosmuertos and the homepage #ddlm-weekend spotlight. Identity:
// cempasúchil #FF7A1A as the one accent; flat magenta #E6007E is reserved
// for the papel picado flags. No other colors.
export const ORANGE = "#FF7A1A";
export const MAGENTA = "#E6007E";

export const r2 = (n: number) => Math.round(n * 100) / 100;

// Papel picado: 13 flags in a 1280x52 viewBox. Widths vary so it never
// reads as a repeating tile. Rendered by src/components/DdlmPicado.astro.
export const PICADO_W = 1280;
const PICADO_GAP = 16;
const PICADO_WIDTHS = [78, 86, 74, 90, 80, 84, 76, 88, 72, 86, 80, 76, 84];
const PICADO_MOTIFS = [
  "ring",
  "flower",
  "lattice",
  "diamond",
  "ring",
  "lattice",
  "flower",
  "diamond",
  "lattice",
  "flower",
  "ring",
  "diamond",
  "flower",
];
let picadoX =
  (PICADO_W - PICADO_WIDTHS.reduce((a, b) => a + b, 0) - PICADO_GAP * (PICADO_WIDTHS.length - 1)) / 2;
export const PICADO_FLAGS = PICADO_WIDTHS.map((w, i) => {
  const x = picadoX;
  picadoX += w + PICADO_GAP;
  // Body from y=2 to y=44, then a zig-zag cut edge down to y=50.
  const teeth = Math.round(w / 9);
  const tw = w / teeth;
  let d = `M${r2(x)} 2H${r2(x + w)}V44`;
  for (let k = 0; k < teeth; k++) {
    d += `L${r2(x + w - (k + 0.5) * tw)} 50L${r2(x + w - (k + 1) * tw)} 44`;
  }
  d += "Z";
  return {
    d,
    cx: r2(x + w / 2),
    side: r2(w / 2 - 12),
    fill: i % 2 === 0 ? ORANGE : MAGENTA,
    motif: PICADO_MOTIFS[i],
  };
});
export const PETALS_8 = Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * Math.PI * 2;
  return { x: r2(Math.cos(a) * 7.5), y: r2(Math.sin(a) * 7.5) };
});
export const LATTICE = [-1, 0, 1].flatMap((a) =>
  [-1, 0, 1].map((b) => ({ x: r2((a - b) * 5.5), y: r2((a + b) * 5.5) })),
);
export const diamond = (x: number, y: number, h: number) =>
  `${r2(x)},${r2(y - h)} ${r2(x + h)},${r2(y)} ${r2(x)},${r2(y + h)} ${r2(x - h)},${r2(y)}`;

// Cempasúchil mark: three stacked scalloped layers (orange, ground,
// orange) and a ground-colored center, like layered cut paper. Returns an
// SVG string for set:html; size it with the host element.
function scallop(n: number, ringR: number, petalR: number, rot: number) {
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2 + rot;
    return `<circle cx="${r2(Math.cos(a) * ringR)}" cy="${r2(Math.sin(a) * ringR)}" r="${petalR}"/>`;
  }).join("");
}
export function cempasuchil(ground: string) {
  return (
    `<svg viewBox="-16 -16 32 32" class="block h-full w-full" aria-hidden="true" focusable="false">` +
    `<g fill="${ORANGE}"><circle r="10.5"/>${scallop(12, 11, 4, 0)}</g>` +
    `<g fill="${ground}"><circle r="6.8"/>${scallop(10, 7.2, 2.4, Math.PI / 10)}</g>` +
    `<g fill="${ORANGE}"><circle r="4.2"/>${scallop(8, 4.6, 1.7, Math.PI / 8)}</g>` +
    `<circle r="1.8" fill="${ground}"/>` +
    `</svg>`
  );
}
