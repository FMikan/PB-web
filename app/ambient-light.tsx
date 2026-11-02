"use client";

import { useEffect, useRef } from "react";

// Lamp-like lights drifting across the page background (the pointer light from
// rockstargames.com/VI, but moving on their own), with the dot texture magnified under
// them as if a lens were sliding over it.
//
// Lights: each enters at a random spot beyond the screen edge, crosses the middle area
// on a random heading and leaves at another random spot. There is only ever one: PAUSE
// after it has left the screen, the next one comes in. A light is 5 overlapping soft
// ellipses, a new random set each time, that drift and breathe as it travels.
//
// Lens: every ellipse also carries a soft gaussian bump, and the dots are sampled at
// p + K * gradient(bumps). Where a light's ellipses cluster the bulge is strong, where
// they spread it's weak and wide, so the zoom varies across a light and fades out
// smoothly. Bumps are averaged per light and lights combine as 1 - (1 - F1)(1 - F2)...,
// which keeps it in check: simulated on random shapes, a light's strongest spot zooms
// 1.1-1.3x, the rims squeeze at most ~1.2x, and it never folds over, even where two
// lights overlap.
//
// One WebGL shader draws it all, including the dots' overlay blend, so it replaces the
// CSS dots layer (globals.css hides that once [data-gl] is set). Without WebGL the
// lights go on a 2D canvas under the CSS dots instead, without the lens.

const SIZE = 150; // light diameter, vmax; theirs is 2160px on a 1440px-wide screen
const OPACITY = 0.5; // same as theirs
const BG = [0x12, 0x13, 0x24]; // --background in globals.css
// Light color. Theirs is #1f1f38 at 50% over #0c0d1b; #252540 would give our background
// the same lift, this one about 2.5 times as much so it reads more.
const COLOR = [0x42, 0x41, 0x6c];
const SPEED: [number, number] = [10, 14.5]; // vmax per second
// From the moment a light's shape stops touching the screen to the moment the next
// one's starts to, in ms.
const PAUSE = 500;
const MAX_LIGHTS = 1; // one light at a time
const PER_LIGHT = 5; // ellipses per light
const DRIFT = 0.08; // how far each ellipse wanders, in light radii
const BREATH = 0.08; // how much each ellipse grows and shrinks
const LENS_SIGMA = 0.28; // width of each lens bump, in light radii (smaller = tighter zoom area)
const LENS_K = 0.11 * LENS_SIGMA ** 2; // lens strength, in light radii (limits above; zoom scales with the 0.11)

// Offsets and radii in light radii, angles in radians.
type Ellipse = { x: number; y: number; rx: number; ry: number; angle: number; phase: number };
// enter / leave: progress (0..1) at which its shape starts / stops touching the screen.
type Light = { from: number[]; to: number[]; t0: number; duration: number; turn: number[]; shape: Ellipse[]; enter: number; leave: number };
// On screen, in CSS px.
type Placed = { x: number; y: number; rx: number; ry: number; angle: number };

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function makeShape(): Ellipse[] {
  return Array.from({ length: PER_LIGHT }, (_, i) => {
    // The first ellipse stays near the middle so the light always has a core.
    const dist = rand(0, i === 0 ? 0.08 : 0.3);
    const dir = rand(0, 2 * Math.PI);
    // Largest radius that stays within the light's radius at full drift and breath.
    const maxR = (1 - dist - DRIFT) / (1 + BREATH);
    const rx = rand(0.6, 1) * maxR;
    return { x: Math.cos(dir) * dist, y: Math.sin(dir) * dist, rx, ry: rx * rand(0.55, 1), angle: rand(0, Math.PI), phase: rand(0, 2 * Math.PI) };
  });
}

// Distance along the ray from (x, y) heading (dx, dy) to the edge of the screen grown by
// r on every side. Past it, a light of radius r no longer touches the screen.
function toEdge(x: number, y: number, dx: number, dy: number, w: number, h: number, r: number) {
  const tx = dx > 0 ? (w + r - x) / dx : dx < 0 ? (-r - x) / dx : Infinity;
  const ty = dy > 0 ? (h + r - y) / dy : dy < 0 ? (-r - y) / dy : Infinity;
  return Math.min(tx, ty);
}

// startAt: how far into its pass the light begins.
function makeLight(now: number, w: number, h: number, startAt = 0): Light {
  const vmax = Math.max(w, h) / 100;
  const r = (SIZE / 2) * vmax;
  // A random point in the middle of the screen it passes through, and a random heading:
  // it enters and leaves at random places but always properly crosses the screen.
  const px = rand(0.2, 0.8) * w;
  const py = rand(0.2, 0.8) * h;
  const a = rand(0, 2 * Math.PI);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const back = toEdge(px, py, -dx, -dy, w, h, r);
  const ahead = toEdge(px, py, dx, dy, w, h, r);
  const duration = ((back + ahead) / vmax / rand(...SPEED)) * 1000;
  const turn = rand(0, 360);
  const shape = makeShape();
  const from = [px - dx * back, py - dy * back];
  const to = [px + dx * ahead, py + dy * ahead];

  const light: Light = { from, to, t0: now - duration * startAt, duration, turn: [turn, turn + rand(-35, 35)], shape, enter: 0, leave: 1 };

  // First moment, scanning from `start` toward `end`, that the shape touches the screen:
  // coarse steps to find it, then bisection to pin it down.
  const find = (start: number, end: number) => {
    let off = start;
    for (let i = 1; i <= 60; i++) {
      let on = start + ((end - start) * i) / 60;
      if (!touching(light, on, w, h, r)) {
        off = on;
        continue;
      }
      for (let j = 0; j < 20; j++) {
        const m = (off + on) / 2;
        if (touching(light, m, w, h, r)) on = m;
        else off = m;
      }
      return on;
    }
    return end;
  };
  light.enter = find(0, 1);
  light.leave = find(1, 0);
  return light;
}

// Whether any of the light's ellipses, exactly where they are at progress t (with drift,
// breath and turn), overlaps the screen: its center is on screen, or one of the screen's
// edges passes through it.
function touching(l: Light, t: number, w: number, h: number, r: number) {
  const corners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  return place(l, l.t0 + t * l.duration, r).some((e) => {
    if (e.x >= 0 && e.x <= w && e.y >= 0 && e.y <= h) return true;
    const c = Math.cos(e.angle);
    const s = Math.sin(e.angle);
    // Into the ellipse's own space (unrotated, radii 1), where inside means length < 1.
    // That map is affine, so along an edge the point moves in a straight line and the
    // closest approach to the center has a closed form.
    const q = (x: number, y: number) => [(c * (x - e.x) + s * (y - e.y)) / e.rx, (-s * (x - e.x) + c * (y - e.y)) / e.ry];
    return corners.some(([ax, ay], i) => {
      const [bx, by] = corners[(i + 1) % 4];
      const [x0, y0] = q(ax, ay);
      const [x1, y1] = q(bx, by);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const k = Math.min(Math.max(-(x0 * dx + y0 * dy) / (dx * dx + dy * dy), 0), 1);
      return (x0 + k * dx) ** 2 + (y0 + k * dy) ** 2 < 1;
    });
  });
}

const progress = (l: Light, now: number) => Math.min(Math.max((now - l.t0) / l.duration, 0), 1);

// The light's ellipses on screen at time now; r = light radius in px.
function place(l: Light, now: number, r: number): Placed[] {
  const t = progress(l, now);
  const cx = l.from[0] + (l.to[0] - l.from[0]) * t;
  const cy = l.from[1] + (l.to[1] - l.from[1]) * t;
  const th = ((l.turn[0] + (l.turn[1] - l.turn[0]) * t) * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  return l.shape.map((e) => {
    const w = t * 2 * Math.PI + e.phase;
    const b = 1 + BREATH * Math.sin(w * 1.3);
    const ox = e.x + Math.cos(w) * DRIFT;
    const oy = e.y + Math.sin(w) * DRIFT;
    return { x: cx + r * (c * ox - s * oy), y: cy + r * (s * ox + c * oy), rx: e.rx * b * r, ry: e.ry * b * r, angle: th + e.angle };
  });
}

const VERTEX = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform vec4 uE[${MAX_LIGHTS * PER_LIGHT}]; // ellipse center x, y (px), cos, sin of its angle
uniform vec2 uAx[${MAX_LIGHTS * PER_LIGHT}]; // 1 / radii (px)
uniform float uInvSig2; // 1 / lens bump width^2 (px)
uniform float uK; // lens strength (px^2)
uniform vec3 uBg;
uniform vec3 uColor;
uniform float uOpacity;
uniform sampler2D uDots; // the 6x6 dot tile

vec3 texel(vec2 i) { return texture2D(uDots, (mod(i, 6.0) + 0.5) / 6.0).rgb; }

// The tile repeated from the top-left corner like the CSS background, read with
// bilinear filtering so magnified dots stay smooth.
vec3 dots(vec2 p) {
  vec2 t = p - 0.5;
  vec2 i = floor(t);
  vec2 f = t - i;
  return mix(mix(texel(i), texel(i + vec2(1.0, 0.0)), f.x), mix(texel(i + vec2(0.0, 1.0)), texel(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float lightKeep = 1.0; // product over lights of (1 - opacity * coverage)
  float lensKeep = 1.0; // product over lights of (1 - F)
  vec2 lensSum = vec2(0.0); // sum over lights of grad F / (1 - F)
  for (int l = 0; l < ${MAX_LIGHTS}; l++) {
    float keep = 1.0;
    float F = 0.0;
    vec2 G = vec2(0.0);
    for (int j = 0; j < ${PER_LIGHT}; j++) {
      vec4 e = uE[l * ${PER_LIGHT} + j];
      vec2 d = p - e.xy;
      // Same falloff as a canvas radial gradient from the color to transparent.
      vec2 q = vec2(e.z * d.x + e.w * d.y, -e.w * d.x + e.z * d.y) * uAx[l * ${PER_LIGHT} + j];
      keep *= 1.0 - max(0.0, 1.0 - length(q));
      float g = exp(-dot(d, d) * uInvSig2);
      F += g;
      G -= 2.0 * uInvSig2 * g * d;
    }
    F /= ${PER_LIGHT}.0;
    G /= ${PER_LIGHT}.0;
    lightKeep *= 1.0 - uOpacity * (1.0 - keep);
    lensKeep *= 1.0 - F;
    lensSum += G / max(1.0 - F, 1e-4);
  }
  vec3 lit = mix(uBg, uColor, 1.0 - lightKeep);
  vec3 s = dots(p + uK * lensKeep * lensSum);
  // CSS mix-blend-mode: overlay of the dots onto what's under them.
  gl_FragColor = vec4(mix(2.0 * lit * s, 1.0 - 2.0 * (1.0 - lit) * (1.0 - s), step(0.5, lit)), 1.0);
}`;

function webglRenderer(canvas: HTMLCanvasElement, tile: HTMLImageElement) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  // One triangle covering the screen.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tile);
  for (const [k, v] of [
    [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
    [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ])
    gl.texParameteri(gl.TEXTURE_2D, k, v);

  const u = (name: string) => gl.getUniformLocation(prog, name);
  gl.uniform3f(u("uBg"), BG[0] / 255, BG[1] / 255, BG[2] / 255);
  gl.uniform3f(u("uColor"), COLOR[0] / 255, COLOR[1] / 255, COLOR[2] / 255);
  gl.uniform1f(u("uOpacity"), OPACITY);
  gl.uniform1i(u("uDots"), 0);
  const [uRes, uE, uAx, uInvSig2, uK] = ["uRes", "uE", "uAx", "uInvSig2", "uK"].map(u);
  const E = new Float32Array(MAX_LIGHTS * PER_LIGHT * 4);
  const AX = new Float32Array(MAX_LIGHTS * PER_LIGHT * 2);

  return (lights: Placed[][], r: number) => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    for (let i = 0; i < MAX_LIGHTS * PER_LIGHT; i++) {
      // Unused slots go far away, where they add nothing.
      const e = lights[Math.floor(i / PER_LIGHT)]?.[i % PER_LIGHT] ?? { x: -1e5, y: -1e5, rx: 1, ry: 1, angle: 0 };
      E.set([e.x, e.y, Math.cos(e.angle), Math.sin(e.angle)], i * 4);
      AX.set([1 / e.rx, 1 / e.ry], i * 2);
    }
    gl.uniform2f(uRes, w, h);
    gl.uniform4fv(uE, E);
    gl.uniform2fv(uAx, AX);
    gl.uniform1f(uInvSig2, 1 / (LENS_SIGMA * r) ** 2);
    gl.uniform1f(uK, LENS_K * r * r);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

// Fallback: lights only, at quarter resolution (a glow loses nothing), under the CSS dots.
function canvasRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext("2d");
  if (!ctx || !sctx) return null;
  const SCALE = 0.25;
  return (lights: Placed[][]) => {
    const w = Math.ceil(canvas.clientWidth * SCALE);
    const h = Math.ceil(canvas.clientHeight * SCALE);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = scratch.width = w;
      canvas.height = scratch.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    for (const light of lights) {
      // Each light's ellipses go on a scratch canvas first so the light's opacity applies
      // to all of it at once, like a layer.
      sctx.clearRect(0, 0, w, h);
      for (const e of light) {
        sctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
        sctx.translate(e.x, e.y);
        sctx.rotate(e.angle);
        sctx.scale(e.rx, e.ry);
        const g = sctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, `rgba(${COLOR}, 1)`);
        g.addColorStop(1, `rgba(${COLOR}, 0)`);
        sctx.fillStyle = g;
        sctx.fillRect(-1, -1, 2, 2);
      }
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = OPACITY;
      ctx.drawImage(scratch, 0, 0);
      ctx.globalAlpha = 1;
    }
  };
}

export default function AmbientLight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const root = document.documentElement;
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
    box.append(canvas);
    let frame = 0;
    let stopped = false;
    let onResize = () => {};

    const tile = new Image();
    tile.src = "/dots.png";
    tile
      .decode()
      .catch(() => {})
      .then(() => {
        if (stopped) return;
        const gl = tile.naturalWidth ? webglRenderer(canvas, tile) : null;
        const fallback = gl ? null : canvasRenderer(canvas);
        const render = (lights: Light[], now: number) => {
          const r = ((SIZE / 2) * Math.max(box.clientWidth, box.clientHeight)) / 100;
          const placed = lights.slice(0, MAX_LIGHTS).map((l) => place(l, now, r));
          if (gl) gl(placed, r);
          else fallback?.(placed);
        };

        if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
          // One light resting in the middle.
          const shape = makeShape();
          onResize = () => {
            const mid = [box.clientWidth / 2, box.clientHeight / 2];
            render([{ from: mid, to: mid, t0: 0, duration: 1, turn: [0, 0], shape, enter: 0, leave: 1 }], 0);
          };
          onResize();
          window.addEventListener("resize", onResize);
        } else {
          // Only ever one light. The next is made once the current one has left the
          // screen, so even a resize can't put two on screen at once.
          let light: Light | undefined;
          const tick = (now: number) => {
            const w = box.clientWidth;
            const h = box.clientHeight;
            // The first light (and one after a long break, e.g. a hidden tab) starts
            // mid-screen.
            if (!light || progress(light, now) >= 1) light = makeLight(now, w, h, rand(0.3, 0.45));
            // Gone from the screen: the next one takes over. It waits off screen at its
            // start, timed off the moment the last one left, and its shape reaches the
            // screen PAUSE after that.
            else if (progress(light, now) >= light.leave) {
              const next = makeLight(now, w, h);
              next.t0 = light.t0 + light.leave * light.duration + PAUSE - next.enter * next.duration;
              light = next;
            }
            render([light], now);
            frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        }

        if (gl) {
          root.dataset.gl = "";
          // If the GPU drops the context, bring the CSS dots back.
          canvas.addEventListener("webglcontextlost", () => delete root.dataset.gl);
        }
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      delete root.dataset.gl;
      canvas.remove();
    };
  }, []);

  return <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-2" />;
}
