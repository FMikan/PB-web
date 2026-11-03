"use client";

import { useEffect, useRef } from "react";
import { setPageBackground } from "./ambient-light";

// The statement under the hero, in Benzin like the header's "and Content Marketing",
// broken and tracked as in the design (docs/ss/image copy 4.png). The text itself stays
// still; scrolling past it only drifts the page background from the hero's navy through
// purple toward pink.

// Page background along the way (0 = this section's top at the bottom of the screen,
// 1 = its bottom there, the end of the page).
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
      setPageBackground(colorAt(clamp((innerHeight - top) / height)));
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

  return (
    // md+: 12svh above the text puts it about 30% as far below the VSL as it used to sit
    // (centered in a screen of its own). Phones: right under the hero, whose bottom holds
    // the scroll hint.
    <section ref={ref} className="@container px-4 py-8 md:px-14 md:py-[12svh]">
      {/* Tracking and leading measured off the design: -0.08em matches both its lines'
          widths to the pixel. lg+: lines never wrap. The first is the widest, about
          20.2em, so 4.1cqw (about 55px on a laptop) fits it with room. Below that they
          wrap, balanced, at 8cqw. Capped at 8cqh / 88px. */}
      <p className="text-center font-display text-[min(8cqw,8cqh,5.5rem)] leading-[0.9] tracking-[-0.08em] lg:text-[min(4.1cqw,8cqh,5.5rem)]">
        <span className="block text-balance lg:whitespace-nowrap">Artists of old didn’t have 1% of the tools</span>
        <span className="block text-balance lg:whitespace-nowrap">
          {/* Normal spacing for the dots, or "..." merges into a bar at this tracking
              (Benzin's own ellipsis glyph is a single dot). */}
          that everyone has access to today<span className="tracking-normal">...</span>
        </span>
      </p>
    </section>
  );
}
