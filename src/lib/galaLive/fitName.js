// src/lib/galaLive/fitName.js
//
// Names are never cut off on the gala screens: no ellipsis, ever. In order:
//   1. fit to width: shrink the font for THIS name, down to a floor (70%);
//   2. still too long at the floor: wrap onto two lines inside the same row
//      height (tighter line height);
//   3. last resort: abbreviate middle names only ("Genoveva E. Ashworth-Ramírez",
//      "Rosaura de la Fuente M."), never the first name or the surname, then
//      try 1 and 2 again;
//   4. if even that cannot fit, shrink the single line until it does.
// Browser only (canvas measureText). Sizes are whatever unit the caller uses.

const FAMILY = '"Avenir Next", "Avenir", "Rubik", "Helvetica Neue", Arial, sans-serif';
const PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "da", "das", "do", "dos", "van", "von", "der", "di", "du", "le", "st.", "san"]);

let ctx = null;
const cache = new Map();

/** Width of `text` at font-size 100 in the gala sans (weight as given). */
export function measure100(text, weight = 600, family = FAMILY) {
  const k = `${weight}|${family}|${text}`;
  if (cache.has(k)) return cache.get(k);
  if (!ctx) {
    try {
      ctx = document.createElement("canvas").getContext("2d");
    } catch {
      ctx = null;
    }
  }
  let w;
  if (ctx) {
    ctx.font = `${weight} 100px ${family}`;
    w = ctx.measureText(text).width;
  } else {
    w = text.length * 55; // no canvas: a conservative average glyph width
  }
  if (cache.size > 4000) cache.clear();
  cache.set(k, w);
  return w;
}

/**
 * Middle names to initials; particles and the surname they introduce stay.
 * "Rosaura de la Fuente Martinez" -> "Rosaura de la Fuente M."
 * "Genoveva Elisabeth Ashworth-Ramírez" -> "Genoveva E. Ashworth-Ramírez"
 */
export function abbreviateMiddle(name) {
  const t = String(name || "").trim().split(/\s+/);
  if (t.length < 3) return t.join(" ");
  const out = [t[0]];
  const p = t.findIndex((w, i) => i > 0 && PARTICLES.has(w.toLowerCase()));
  if (p > 0 && p < t.length - 1) {
    // First name, [middles as initials], particle + surname, [second surnames as initials]
    for (let i = 1; i < p; i++) out.push(initial(t[i]));
    out.push(t[p], t[p + 1]);
    for (let i = p + 2; i < t.length; i++) out.push(initial(t[i]));
    return out.join(" ");
  }
  for (let i = 1; i < t.length - 1; i++) out.push(initial(t[i]));
  out.push(t[t.length - 1]);
  return out.join(" ");
}

function initial(w) {
  const m = String(w).match(/\p{L}/u);
  return m ? `${m[0].toUpperCase()}.` : w;
}

/** Best two-line split: the break that minimises the longer line. */
function split2(text, weight) {
  const words = text.split(/\s+/);
  if (words.length < 2) return null;
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const w = Math.max(measure100(a, weight), measure100(b, weight));
    if (!best || w < best.w) best = { lines: [a, b], w };
  }
  return best;
}

/**
 * @param {string} name
 * @param {{avail:number, size:number, rowH?:number, floor?:number, weight?:number}} o
 *   avail = width available for the name, size = the row's font size, rowH =
 *   the row height (enables the two-line step). Same units throughout.
 * @returns {{lines:string[], size:number, lineHeight:number, abbreviated:boolean}}
 */
export function fitName(name, { avail, size, rowH = 0, floor = 0.7, weight = 600 }) {
  const text = String(name || "").trim();
  if (!text || !(avail > 0)) return { lines: [text], size, lineHeight: 1.1, abbreviated: false };

  const attempt = (t) => {
    const w1 = (measure100(t, weight) * size) / 100;
    if (w1 <= avail) return { lines: [t], size, lineHeight: 1.1 };
    const s1 = (size * avail) / w1;
    if (s1 >= size * floor) return { lines: [t], size: s1, lineHeight: 1.1 };
    if (rowH > 0) {
      const sp = split2(t, weight);
      if (sp) {
        const lh = 0.98;
        const byWidth = (avail * 100) / sp.w;
        const byHeight = rowH / (2 * lh);
        const s2 = Math.min(size, byWidth, byHeight);
        if (s2 >= size * floor * 0.85) return { lines: sp.lines, size: s2, lineHeight: lh };
      }
    }
    return null;
  };

  const a = attempt(text);
  if (a) return { ...a, abbreviated: false };
  const short = abbreviateMiddle(text);
  if (short !== text) {
    const b = attempt(short);
    if (b) return { ...b, abbreviated: true };
  }
  // Last resort: one line, whatever size it takes. Never an ellipsis.
  const t = short;
  const w = (measure100(t, weight) * size) / 100;
  return { lines: [t], size: Math.min(size, (size * avail) / w), lineHeight: 1.1, abbreviated: t !== text };
}

/**
 * Svelte action for headline names in the DOM: shrinks `--fit` on the node
 * until its one-line width fits its parent (down to `min`), then lets it wrap.
 * The node's CSS must use it: font-size: calc(var(--u) * N * var(--fit, 1)).
 */
export function fitWidth(node, opts = 0.62) {
  let min = typeof opts === "number" ? opts : opts?.min ?? 0.62;
  let wrap = typeof opts === "object" && opts ? opts.wrap !== false : true;
  let raf = 0;
  function run() {
    node.style.setProperty("--fit", "1");
    node.style.whiteSpace = "nowrap";
    const parent = node.parentElement;
    if (!parent) return;
    const cs = getComputedStyle(parent);
    const avail = parent.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    const w = node.scrollWidth;
    if (!(avail > 0) || w <= avail) return;
    const k = Math.max(min, (avail / w) * 0.98);
    node.style.setProperty("--fit", String(k));
    if (wrap && node.scrollWidth > avail) node.style.whiteSpace = "normal";
  }
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(run);
  };
  schedule();
  document.fonts?.ready?.then(schedule);
  window.addEventListener("resize", schedule);
  return {
    update: schedule,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
    },
  };
}

/**
 * Svelte action for a fixed-size box of wrapping copy (the paddle-raise ask
 * card and ladder): shrinks `--k` on the node, one step at a time down to
 * `min`, until nothing overflows the box. Text wraps rather than truncating;
 * this only buys the room for the wrap. Children size themselves with
 * calc(var(--u) * N * var(--k, 1)). Pass anything that changes the copy as
 * `key` so a new level re-fits.
 */
export function fitBox(node, opts = {}) {
  let min = opts?.min ?? 0.55;
  let raf = 0;
  const fits = () => node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1;
  function run() {
    let k = 1;
    node.style.setProperty("--k", "1");
    for (let i = 0; i < 24 && !fits() && k > min; i++) {
      k = Math.max(min, k * 0.95);
      node.style.setProperty("--k", k.toFixed(3));
    }
  }
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(run);
  };
  schedule();
  document.fonts?.ready?.then(schedule);
  window.addEventListener("resize", schedule);
  return {
    update(next) {
      min = next?.min ?? min;
      schedule();
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
    },
  };
}
