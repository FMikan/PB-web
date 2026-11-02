"use client";

import { useEffect, useRef } from "react";

// A lamp-like light drifting across the page background: the pointer light from
// rockstargames.com/VI, but moving on its own. Each pass enters from beyond a random
// corner, crosses to the opposite one and leaves; then the next pass starts. Its shape
// is a few overlapping soft ellipses, a new random set every pass, that drift while it
// travels so the outline keeps changing. They're drawn into a small canvas that CSS
// scales up: a glow has no detail to lose, and it stays cheap on the GPU.

const SIZE = 150; // vmax; theirs is 2160px on a 1440px-wide screen
const OPACITY = 0.5; // same as theirs
// Theirs is #1f1f38 at 50% over #0c0d1b; #252540 gives our #121324 the same lift.
const COLOR = "37, 37, 64";
const PX = 256; // canvas resolution
const DURATION: [number, number] = [18000, 26000]; // ms per pass
// Passes start and end with the light's center this far past the corner on both axes.
// That puts its farthest edge (SIZE / 2 from the center) right at the corner: fully
// off screen, without a long dark wait before it shows.
const OFF = SIZE / 2 / Math.SQRT2;

type Ellipse = { x: number; y: number; rx: number; ry: number; angle: number; phase: number };

const DRIFT = PX * 0.04; // how far each ellipse wanders during a pass, canvas px
const BREATH = 0.08; // how much each ellipse grows and shrinks

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function makeShape(): Ellipse[] {
  const r = PX / 2;
  return Array.from({ length: 5 }, (_, i) => {
    // The first ellipse stays near the middle so the light always has a core.
    const dist = rand(0, i === 0 ? 0.08 : 0.3) * r;
    const dir = rand(0, 2 * Math.PI);
    // Largest radius that keeps the ellipse inside the canvas at full drift and breath;
    // past that the canvas edge would cut it with a hard line.
    const maxR = (r - dist - DRIFT) / (1 + BREATH);
    const rx = rand(0.6, 1) * maxR;
    return {
      x: r + Math.cos(dir) * dist,
      y: r + Math.sin(dir) * dist,
      rx,
      ry: rx * rand(0.55, 1),
      angle: rand(0, Math.PI),
      phase: rand(0, 2 * Math.PI),
    };
  });
}

// progress: 0..1 through the pass.
function draw(ctx: CanvasRenderingContext2D, shape: Ellipse[], progress: number) {
  ctx.clearRect(0, 0, PX, PX);
  for (const e of shape) {
    const w = progress * 2 * Math.PI + e.phase;
    const s = 1 + BREATH * Math.sin(w * 1.3);
    ctx.save();
    ctx.translate(e.x + Math.cos(w) * DRIFT, e.y + Math.sin(w) * DRIFT);
    ctx.rotate(e.angle);
    ctx.scale(e.rx * s, e.ry * s);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(${COLOR}, 1)`);
    g.addColorStop(1, `rgba(${COLOR}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
}

// Where the light's center sits for a corner given as 0/1 per axis (0 = left / top).
function at(cx: number, cy: number) {
  const x = cx ? `calc(100vw + ${OFF}vmax)` : `${-OFF}vmax`;
  const y = cy ? `calc(100vh + ${OFF}vmax)` : `${-OFF}vmax`;
  return `translate(${x}, ${y}) translate(-50%, -50%)`;
}

export default function AmbientLight() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw(ctx, makeShape(), 0);
      canvas.style.transform = "translate(50vw, 50vh) translate(-50%, -50%)";
      return;
    }

    let anim: Animation | undefined;
    let frame = 0;

    const pass = () => {
      const fx = Math.round(Math.random());
      const fy = Math.round(Math.random());
      const turn = rand(0, 360);
      const duration = rand(...DURATION);
      const shape = makeShape();
      anim = canvas.animate(
        [
          { transform: `${at(fx, fy)} rotate(${turn}deg)` },
          { transform: `${at(1 - fx, 1 - fy)} rotate(${turn + rand(-35, 35)}deg)` },
        ],
        { duration, easing: "linear" },
      );
      anim.onfinish = pass;
      const current = anim;
      cancelAnimationFrame(frame);
      const tick = () => {
        draw(ctx, shape, Math.min(Number(current.currentTime ?? 0) / duration, 1));
        frame = requestAnimationFrame(tick);
      };
      tick();
    };
    pass();

    return () => {
      anim?.cancel();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      width={PX}
      height={PX}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 -z-2 will-change-transform"
      // Parked off screen until the first pass starts.
      style={{ width: `${SIZE}vmax`, height: `${SIZE}vmax`, opacity: OPACITY, transform: "translate(-200vmax, -200vmax)" }}
    />
  );
}
