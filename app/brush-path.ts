// The line the paint brush leaves (app/brush-trace.tsx), as a function of how far it's
// drawn: d, in px down the page from where it starts. A sine-like signal, irregular but
// smooth: three sines of unrelated lengths, their sum swelling and easing over a longer
// one. Seeded, so it's the same line on every visit.
//
// The brush is a flat one, held at an angle (lean) that follows the hand: the handle
// swings out ahead of the tip when it moves sideways. Its bristles sit along the head's
// edge, and each paints its own line, the tip's path shifted along that edge; where the
// tip moves across the edge they spread to the full width, where it moves along it they
// pile up thin, like a real flat brush. Each bristle's width breathes with its own noise
// and with the pressure, so the edges are ragged and dry streaks open up, and the outer
// bristles lift off first as the brush touches down and lifts away.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const SEED = 7;
const BRISTLES = 12;
const STEP = 3; // px between samples along the line

// mulberry32: a small seeded random number generator, [0, 1).
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise in [-1, 1].
function noise(seed: number) {
  const r = random(seed);
  const v = Array.from({ length: 256 }, () => r() * 2 - 1);
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return v[i & 255] * (1 - s) + v[(i + 1) & 255] * s;
  };
}

const clamp = (x: number, a: number, b: number) => Math.min(Math.max(x, a), b);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// One bristle's line: its centre and half-width at each sample, px from the line's
// start (x across the page, y down it), and the d each sample was taken at.
export type Bristle = { x: Float32Array; y: Float32Array; w: Float32Array; d: Float32Array; opacity: number };

export type Trail = {
  length: number; // px, down the page
  head: number; // the brush head's width, px: the widest the line gets
  x: (d: number) => number; // the tip, px from the left
  lean: (d: number) => number; // radians; 0 = handle straight down, > 0 = down-right
  pressure: (d: number) => number; // 0 (lifted) to 1
  bristles: Bristle[];
};

// W, V: the page's width and the screen's height, px. The line is a screen long.
export function trail(W: number, V: number): Trail {
  const length = V;
  const phone = W < 768;
  const amp = phone ? 0.2 * W : Math.min(0.13 * W, 220);
  const head = clamp(0.032 * W, 22, 46);
  const r = random(SEED);
  const waves = [
    [0.62, 1],
    [0.33, 0.4],
    [0.17, 0.15],
  ].map(([len, a]) => ({ len: len * (0.9 + 0.2 * r()) * V, a, phase: r() * TAU }));
  const total = waves.reduce((sum, w) => sum + w.a, 0);
  const swell = { len: 1.4 * V, phase: r() * TAU };
  const press = noise(SEED + 1);

  const x = (d: number) => {
    const wave = waves.reduce((sum, w) => sum + w.a * Math.sin((TAU * d) / w.len + w.phase), 0) / total;
    const size = 1 - 0.3 * (0.5 + 0.5 * Math.sin((TAU * d) / swell.len + swell.phase));
    return W / 2 + amp * smooth(0, 0.3 * V, d) * size * wave;
  };
  // The handle leads the tip sideways: lean with the slope, over a short stretch (the
  // hand's inertia), around 18deg (down-right, as in the design) and within 22deg of it.
  const reach = 0.04 * V;
  const lean = (d: number) => (18 + clamp((14 * (x(d + reach) - x(d - reach))) / (2 * reach), -22, 22)) * DEG;
  const pressure = (d: number) =>
    (0.75 + 0.25 * press(d / (0.2 * V))) * smooth(0, 0.06 * V, d) * (1 - smooth(length - 0.06 * V, length, d));

  const samples = Math.floor(length / STEP) + 1;
  const bristles = Array.from({ length: BRISTLES }, (_, i): Bristle => {
    const across = -1 + (2 * (i + 0.5)) / BRISTLES + (r() - 0.5) * 0.08; // -1 to 1 along the edge
    const streak = noise(SEED + 10 + i);
    const half = (head / BRISTLES) * 0.85;
    const outer = Math.abs(across);
    const b = { x: new Float32Array(samples), y: new Float32Array(samples), w: new Float32Array(samples), d: new Float32Array(samples), opacity: 0 };
    for (let k = 0; k < samples; k++) {
      const d = k * STEP;
      const a = lean(d);
      const p = pressure(d);
      // Outer bristles touch only once the brush presses down.
      const touch = clamp((0.4 + 0.6 * p - outer) / 0.15 + 1, 0, 1);
      b.x[k] = x(d) + ((across * head) / 2) * Math.cos(a);
      b.y[k] = d - ((across * head) / 2) * Math.sin(a);
      b.w[k] = half * (0.35 + 0.65 * p) * touch * clamp(0.6 + 0.7 * streak(d / (0.05 * V)), 0.12, 1.2);
      b.d[k] = d;
    }
    b.opacity = 0.7 + 0.3 * r();
    return b;
  });

  return { length, head, x, lean, pressure, bristles };
}

// The line's colours, alternating along it (reflected), and the period they take.
export const PINK = [0xff, 0xb2, 0xc6];
export const VIOLET = [0x98, 0x8b, 0xd0];
export const colorPeriod = (V: number) => 0.45 * V;

// The colour under the brush at d, 0-1 per channel: for paint on its bristles.
export function paintAt(d: number, V: number) {
  const t = (d / colorPeriod(V)) % 2;
  const k = t > 1 ? 2 - t : t;
  return PINK.map((c, i) => (c + (VIOLET[i] - c) * k) / 255);
}

// A bristle's two edges, its centre pushed out by its half-width (+ pad) each side,
// along the normal of its own line. Calls back with each sample's left and right points.
export function edges(b: Bristle, pad: number, each: (k: number, lx: number, ly: number, rx: number, ry: number) => void) {
  const n = b.x.length;
  for (let k = 0; k < n; k++) {
    const dx = b.x[Math.min(k + 1, n - 1)] - b.x[Math.max(k - 1, 0)];
    const dy = b.y[Math.min(k + 1, n - 1)] - b.y[Math.max(k - 1, 0)];
    const len = Math.hypot(dx, dy) || 1;
    const w = b.w[k] + pad;
    each(k, b.x[k] - (dy / len) * w, b.y[k] + (dx / len) * w, b.x[k] + (dy / len) * w, b.y[k] - (dx / len) * w);
  }
}

// The bristle as an SVG path, for the still line (reduced motion, or no WebGL).
export function bristlePath(b: Bristle) {
  const left: string[] = [];
  const right: string[] = [];
  edges(b, 0, (_, lx, ly, rx, ry) => {
    left.push(`${lx.toFixed(1)} ${ly.toFixed(1)}`);
    right.push(`${rx.toFixed(1)} ${ry.toFixed(1)}`);
  });
  return `M${left.join("L")}L${right.reverse().join("L")}Z`;
}
