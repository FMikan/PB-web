"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { setPageBackground } from "./ambient-light";

// The statement under the hero, as in the design (docs/img/Point_Blank_WEB_002.png),
// its red pen marks in the header's gradient with its shine. Scrolling past it drifts
// the page background from the hero's navy through purple toward pink.

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
    // md+: 12svh above the statement puts it about 30% as far below the VSL as the text
    // used to sit (centered in a screen of its own). Phones: right under the hero, whose
    // bottom holds the scroll hint.
    <section ref={ref} className="px-4 py-8 md:px-14 md:py-[12svh]">
      {/* The design, layer by layer (scripts/statement-layers.py): its white text as is,
          and over it the pen marks, filled with the header's gradient and shine
          (globals.css .statement-marks). The design is a 3840px-wide frame where the
          statement takes 3464 / 3840 = 90.21% of the width. Phones keep that share;
          md+ shows it 40% smaller, at 54.13%. Shown at the PNG's own pixels, not
          re-encoded. */}
      <div className="relative mx-auto w-[90.21vw] max-w-full md:w-[54.13vw]">
        <Image
          src="/statement-text.png"
          alt="Artists of old didn’t have 1% of the tools that everyone has access to today..."
          width={3464}
          height={463}
          unoptimized
          className="h-auto w-full"
        />
        {/* The marks' box within the text's, in the design's pixels: x 1471, width 1122,
            against the text's x 188, width 3464; both full height. */}
        <div aria-hidden className="statement-marks absolute top-0 left-[37.04%] h-full w-[32.39%]" />
      </div>
    </section>
  );
}
