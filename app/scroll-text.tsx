"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { setPageBackground } from "./ambient-light";

// The statement under the hero. The section is tall and the text stays put in the middle
// of the screen while you scroll through it: the letters fill from gray to white in
// reading order, and the page background drifts from the hero's navy through purple to
// pink. Both only follow the scroll position, so they go as fast as you scroll.

// Two sentences, the first on two lines and the second on one, an empty line between.
const BLOCKS = [["Artists of old didn’t have 1% of the tools", "that everyone has access to today,"], ["But their work feels alive, unique."]];
const LINES = BLOCKS.flat();
const FRONT = 14; // letters over which the fill fades from gray to white: its soft edge
// Page background along the way (0 = hero, 1 = end of this section).
const STOPS: [number, number[]][] = [
  [0, [0x12, 0x13, 0x24]], // --background, the hero's navy
  [0.4, [0x1b, 0x15, 0x32]], // purple
  [1, [0x23, 0x15, 0x2d]], // toward pink, only about halfway from the purple
];

const clamp = (x: number) => Math.min(Math.max(x, 0), 1);

function colorAt(q: number) {
  const i = Math.max(STOPS.findIndex(([at]) => at >= q), 1);
  const [a, from] = STOPS[i - 1];
  const [b, to] = STOPS[i];
  const t = (q - a) / (b - a);
  return from.map((c, k) => Math.round(c + (to[k] - c) * t));
}

export default function ScrollText() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const { top, height } = section.getBoundingClientRect();
      const v = innerHeight;
      // Fill: starts as the text comes up near the bottom of the screen, done a little
      // before the section lets go of it.
      section.style.setProperty("--p", String(clamp((0.3 * v - top) / (0.3 * v + 0.85 * (height - v)))));
      // Background: slowly, over the whole way from the top of the page to the end of
      // this section.
      setPageBackground(colorAt(clamp((v - top) / height)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      setPageBackground(STOPS[0][1]);
    };
  }, []);

  let n = 0;
  return (
    <section ref={ref} className="h-[250svh]" style={{ "--span": LINES.join("").length + FRONT, "--front": FRONT } as CSSProperties}>
      <div className="@container sticky top-0 flex h-svh items-center justify-center px-4 md:px-14">
        {/* Lines never wrap; the size keeps the longest (17.9em wide in this font) inside
            the width with a little to spare: 100 / 18.4 = 5.43cqw, at most 60px. */}
        <p className="text-center text-[min(5.43cqw,3.75rem)] leading-[1.15] font-semibold tracking-tight">
          {/* Screen readers get the plain text; the letter-by-letter copy is for the eye. */}
          <span className="sr-only">{LINES.join(" ")}</span>
          <span aria-hidden>
            {BLOCKS.map((lines, b) => (
              // One empty line between the two sentences, on purpose.
              <span key={b} className={b ? "mt-[1lh] block" : "block"}>
                {lines.map((line, l) => (
                  <span key={l} className="block whitespace-nowrap">
                    {[...line].map((ch) => (
                      <span key={n} className="scroll-text-char" style={{ "--i": n++ } as CSSProperties}>
                        {ch}
                      </span>
                    ))}
                  </span>
                ))}
              </span>
            ))}
          </span>
        </p>
      </div>
    </section>
  );
}
