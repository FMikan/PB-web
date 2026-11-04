"use client";

import { useEffect, useRef, useState } from "react";
import type { Brush } from "./brush-scene";
import { bristlePath, colorPeriod, paintAt, trail, type Trail } from "./brush-path";

// A paint brush under the statement that paints a line down the page as you scroll, like
// a seismograph's pen: for a screen of scrolling it holds its place on the screen
// (sticky) and sways from side to side, and the page moving up under it carries the line
// away. Brush and line (app/brush-path.ts) are drawn together on one WebGL canvas
// (app/brush-scene.ts), the line up to the brush's head.
//
// The hand: the brush's lean follows the line's (so the head's edge stays on the stroke);
// moving sideways it swings in depth and turns about its own length, so the flat head
// shows its face and then its edge; scrolling faster drags the handle further up off the
// page. Every one of those is a spring that overshoots a little, so the brush follows
// through when you stop; on top, it breathes and trembles, so it is never quite still.
//
// Before and after its screen it rides with the page, lifted off it. With reduced
// motion, or without WebGL, there is no brush and the whole line simply shows.

const TIP = 0.55; // where the tip holds on the screen, down from its top
const GAP = 0.07; // between the statement above and where the line starts (screens)
const DEG = Math.PI / 180;

const clamp = (x: number, a: number, b: number) => Math.min(Math.max(x, a), b);

// A damped spring: x chases target; zeta < 1 overshoots.
function spring(k: number, zeta: number) {
  const s = { x: NaN, v: 0 };
  return (target: number, dt: number) => {
    if (Number.isNaN(s.x)) s.x = target;
    s.v += (k * (target - s.x) - 2 * Math.sqrt(k) * zeta * s.v) * dt;
    s.x += s.v * dt;
    return s.x;
  };
}

export default function BrushTrace() {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [line, setLine] = useState<{ trail: Trail; W: number; V: number } | null>(null);
  // No brush: reduced motion, or no WebGL. Then the line shows whole, as an SVG.
  const [still, setStill] = useState(false);
  // The same, for the animation loop: it reads the current line every frame, so a resize
  // swaps the line under it without starting the brush (and its WebGL) over.
  const current = useRef(line);
  const brush = useRef<Brush | null>(null);

  // The line, for this screen's size.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const size = () => {
      const W = el.clientWidth;
      const V = el.clientHeight;
      if (current.current?.W === W && current.current.V === V) return;
      current.current = { trail: trail(W, V), W, V };
      setLine(current.current);
      brush.current?.resize(W, 1.5 * V);
      brush.current?.setLine(current.current.trail, TIP * V, colorPeriod(V));
    };
    size();
    setStill(matchMedia("(prefers-reduced-motion: reduce)").matches);
    const watch = new ResizeObserver(size);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  // The brush and its line. Checks the preference itself rather than waiting for
  // `still`, so it never starts at all with reduced motion.
  useEffect(() => {
    if (still || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = section.current!;
    let loading = false;
    let gone = false;
    let frame = 0;
    let last = 0;
    let prevX = NaN;
    let prevD = NaN;
    let sideways = 0; // the tip's sideways speed, px/s, smoothed
    let scrolling = 0; // the page's speed, px/s, smoothed
    const lean = spring(70, 0.45);
    const yaw = spring(40, 0.4);
    const twist = spring(50, 0.4);
    const pitch = spring(60, 0.5);

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const b = brush.current;
      if (!b || !current.current) return;
      const { trail: t, V } = current.current;
      const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
      last = now;
      const top = el.getBoundingClientRect().top;
      const d = clamp(-top, 0, t.length);
      const x = t.x(d);
      const target = t.lean(d);
      const ease = Math.min(1, dt * 8);
      sideways += ((Number.isNaN(prevX) ? 0 : (x - prevX) / dt) - sideways) * ease;
      scrolling += ((Number.isNaN(prevD) ? 0 : Math.abs(d - prevD) / dt) - scrolling) * ease;
      prevX = x;
      prevD = d;
      const s = now / 1000;
      const p = t.pressure(d);
      // Lifted off the page as it comes in and once it's done.
      const hover = Math.max(clamp(top / (0.35 * V), 0, 1), clamp((-top - t.length) / (0.35 * V), 0, 1));
      const turn = (2 * Math.PI * d) / V;
      b.render(
        {
          x,
          y: TIP * V,
          head: t.head,
          lean: lean(target, dt) + (1.2 * Math.sin(1.1 * s + 0.5) + 0.5 * Math.sin(2.9 * s)) * DEG,
          yaw: yaw(clamp(sideways * 0.0006, -0.55, 0.55) + 0.12 * Math.sin(turn / 1.1), dt) + 2 * Math.sin(0.6 * s + 1) * DEG,
          twist: twist(0.35 * Math.sin(turn / 0.9 + 1) + clamp(sideways * 0.0003, -0.3, 0.3), dt) + 3 * Math.sin(0.7 * s + 2) * DEG,
          pitch:
            pitch((40 - 12 * p + 14 * hover) * DEG + clamp(scrolling * 0.00015, 0, 0.25), dt) +
            (2 * Math.sin(0.9 * s) + 0.6 * Math.sin(2.3 * s + 1)) * DEG,
          lift: 40 * hover + 3 * (1 - p),
          bend: clamp(-sideways * 0.00003, -0.014, 0.014),
          splay: 0.18 * p,
          paint: paintAt(d, V),
        },
        // The line, cut at the head's edge: its normal toward the body, (sin, cos) of the
        // line's own lean, the one its bristles were laid along.
        { d, nx: Math.sin(target), ny: Math.cos(target) },
      );
    };

    // Runs only while the section is near; loads three.js and the model the first time.
    const near = new IntersectionObserver(
      ([entry]) => {
        cancelAnimationFrame(frame);
        if (!entry.isIntersecting) return;
        last = 0;
        frame = requestAnimationFrame(tick);
        if (brush.current || loading) return;
        loading = true;
        import("./brush-scene")
          .then(({ createBrush }) => createBrush(canvas.current!))
          .then((b) => {
            if (gone) return b.dispose();
            const { trail: t, W, V } = current.current!;
            b.resize(W, 1.5 * V);
            b.setLine(t, TIP * V, colorPeriod(V));
            brush.current = b;
          })
          .catch(() => !gone && setStill(true)); // no WebGL: the still line instead
      },
      { rootMargin: "100% 0px" },
    );
    near.observe(el);
    return () => {
      gone = true;
      near.disconnect();
      cancelAnimationFrame(frame);
      brush.current?.dispose();
      brush.current = null;
    };
  }, [still]);

  return (
    // TIP down from its top + the line's screen + the rest of the last screen: the sticky
    // stage holds for exactly the line's screen. Pulled up so the line starts GAP under
    // the statement.
    <section
      ref={section}
      aria-hidden
      className="pointer-events-none relative h-[200svh]"
      style={{ marginTop: `-${(TIP - GAP) * 100}svh` }}
    >
      {still && line && (
        <svg
          width={line.W}
          height={line.trail.length}
          viewBox={`0 0 ${line.W} ${line.trail.length}`}
          className="absolute left-0 overflow-visible"
          style={{ top: `${TIP * 100}svh` }}
        >
          <defs>
            {/* Pink to violet and back, over and over down the line. */}
            <linearGradient id="trail-paint" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={colorPeriod(line.V)} spreadMethod="reflect">
              <stop offset="0" stopColor="#ffb2c6" />
              <stop offset="1" stopColor="#988bd0" />
            </linearGradient>
          </defs>
          {line.trail.bristles.map((b, i) => (
            <path key={i} d={bristlePath(b)} fill="url(#trail-paint)" fillOpacity={b.opacity} />
          ))}
        </svg>
      )}
      {/* The stage holds the canvas, which reaches half a screen below it so the brush's
          handle is never cut while the stage scrolls away. */}
      <div ref={stage} className="sticky top-0 h-svh">
        {!still && <canvas ref={canvas} className="absolute top-0 left-0 h-[150svh] w-full" />}
      </div>
    </section>
  );
}
