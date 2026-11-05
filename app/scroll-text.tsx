"use client";

import Image from "next/image";
import { useEffect, useRef, type CSSProperties } from "react";
import { setPageBackground } from "./ambient-light";
import { STATEMENT, type Mark } from "./statement";
import { STORY } from "./story";

// The statement under the hero, as in the design (docs/img/Point_Blank_WEB_002.png),
// its red pen marks recolored pink. It comes in once, when it shows up on screen (not
// following the scroll): the two lines rise into place one after the other, then a pen
// writes "1%" and circles "has", like the swoosh in the header. Then the story carries on
// under it (app/story.ts) in two more beats, each once it's on screen and the one before
// is a third through: an arrow is drawn down to the next line, and a third through the arrow
// that line comes in the same way. Scrolling past drifts
// the page background from the hero's navy through purple toward pink, and on to a
// midnight dark blue as the orbit slider below comes in.

// Page background along the way (0 = this section's top at the bottom of the screen,
// 1 = its bottom there, 2 = the slider below it filling the screen).
const STOPS: [number, number[]][] = [
  [0, [0x12, 0x13, 0x24]], // --background, the hero's navy
  [0.4, [0x1b, 0x15, 0x32]], // purple
  [1, [0x23, 0x15, 0x2d]], // toward pink, only about halfway from the purple
  [2, [0x07, 0x0b, 0x26]], // midnight dark blue
];

const clamp = (x: number) => Math.min(Math.max(x, 0), 1);

function colorAt(q: number) {
  const i = Math.max(STOPS.findIndex(([at]) => at >= q), 1);
  const [a, from] = STOPS[i - 1];
  const [b, to] = STOPS[i];
  const t = (q - a) / (b - a);
  return from.map((c, k) => Math.round(c + (to[k] - c) * t));
}

// The next thing starts when this one is this far through (scripts/story-layers.py has the same).
const HANDOFF = 1 / 3;

// The pen starts while the second line is still landing, and writes the marks one
// right after the other, quicker than the speed they were generated at.
const PEN_PACE = 0.65;
const PEN_AT: number[] = [];
let pen = 0.3;
for (const mark of STATEMENT.marks) {
  PEN_AT.push(pen);
  pen += mark.duration * PEN_PACE + 0.05;
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
      const below = section.nextElementSibling!.getBoundingClientRect();
      setPageBackground(colorAt(clamp((innerHeight - top) / height) + clamp((innerHeight - below.top) / innerHeight)));
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

  // Reveal (globals.css): each beat armed, then in, once it's reached, the one before is far
  // enough through, and the loader is gone (it holds them hidden, so they'd all start together
  // after it). Reached is most of it on screen, or already scrolled past, as on a reload further
  // down the page; one that's gone by doesn't hold up the next.
  useEffect(() => {
    const section = ref.current;
    if (!section || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const beats = [...section.querySelectorAll<HTMLElement>("[data-beat]")];
    const nextAt = [pen * HANDOFF, ...STORY.beats.map((beat) => beat.next)];
    beats.forEach((beat) => (beat.dataset.reveal = "armed"));
    const wait = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    const reached = (beat: HTMLElement) => {
      const { top, height } = beat.getBoundingClientRect();
      return "loaded" in document.documentElement.dataset && top + height * 0.85 <= innerHeight;
    };
    let stopped = false;
    (async () => {
      for (const [k, beat] of beats.entries()) {
        while (!reached(beat)) {
          await wait(0.05);
          if (stopped) return;
        }
        beat.dataset.reveal = "in";
        if (beat.getBoundingClientRect().bottom > 0) await wait(nextAt[k]);
        if (stopped) return;
      }
    })();
    return () => {
      stopped = true;
    };
  }, []);

  const { width: W, height: H, lines, marks } = STATEMENT;
  type Box = { x: number; y: number; width: number; height: number };
  const at = (l: Box, within: { width: number; height: number } = STATEMENT) => ({
    left: `${(100 * l.x) / within.width}%`,
    top: `${(100 * l.y) / within.height}%`,
    width: `${(100 * l.width) / within.width}%`,
  });
  return (
    // md+: 12svh above the statement puts it about 30% as far below the VSL as the text
    // used to sit (centered in a screen of its own). Phones: right under the hero, whose
    // bottom holds the scroll hint. The bottom padding is the gap above the orbit slider.
    <section ref={ref} className="px-4 pt-8 pb-32 md:px-14 md:pt-[12svh] md:pb-[20svh]">
      <p className="sr-only">
        Artists of old didn’t have 1% of the tools that everyone has access to today... But their work feels... alive! &amp; unique
      </p>
      {/* The design, layer by layer (scripts/statement-layers.py, app/statement.ts): its
          white text a line at a time, as is, and over it the two pen marks, recolored.
          The design is a 3840px-wide frame where the statement takes 3464 / 3840 =
          90.21% of the width. Phones keep that share; md+ shows it 40% smaller, at
          54.13%. Shown at the PNGs' own pixels, not re-encoded. */}
      {/* translate: what's drawn sits 34.5 / 3464 left of the box's middle in the design. */}
      <div
        data-beat
        aria-hidden
        className="relative mx-auto w-[90.21vw] max-w-full translate-x-[0.996%] md:w-[54.13vw]"
        style={{ aspectRatio: `${W} / ${H}` }}
      >
        {lines.map((line, k) => (
          <Image
            key={line.src}
            src={line.src}
            alt=""
            width={line.width}
            height={line.height}
            unoptimized
            className="statement-line absolute h-auto"
            style={{ ...at(line), "--delay": `${k * 0.08}s` } as CSSProperties}
          />
        ))}
        {marks.map((mark, k) => (
          <PenMark key={mark.src} mark={mark} delay={PEN_AT[k]} pace={PEN_PACE} style={{ ...at(mark), height: `${(100 * mark.height) / H}%` }} />
        ))}
      </div>
      {/* The story, hanging right under the statement at its scale (scripts/story-layers.py).
          The first arrow starts a touch above this box, under the statement's last word. */}
      <div
        aria-hidden
        className="relative mx-auto w-[90.21vw] max-w-full md:w-[54.13vw]"
        style={{ aspectRatio: `${STORY.width} / ${STORY.height}` }}
      >
        {STORY.beats.map((beat) => (
          <div
            key={beat.layers[0].src}
            data-beat
            className="absolute"
            style={{ ...at(beat, STORY), height: `${(100 * beat.height) / STORY.height}%` }}
          >
            {beat.layers.map((layer) =>
              "strokes" in layer ? (
                <PenMark
                  key={layer.src}
                  mark={layer}
                  delay={layer.at}
                  style={{ ...at(layer, beat), height: `${(100 * layer.height) / beat.height}%` }}
                />
              ) : (
                <Image
                  key={layer.src}
                  src={layer.src}
                  alt=""
                  width={layer.width}
                  height={layer.height}
                  unoptimized
                  className="statement-line absolute h-auto"
                  style={{ ...at(layer, beat), "--delay": `${layer.at}s` } as CSSProperties}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// One of the design's pen marks: its shape (the PNG, as a mask) filled with a light pink
// gradient, light to deep along the header's 232deg, both ends at about 5:1 or more
// against the page background; shown through the pen's strokes (globals.css .pen).
function PenMark({ mark, delay, pace = 1, style }: { mark: Omit<Mark, "duration">; delay: number; pace?: number; style: CSSProperties }) {
  const id = mark.src.slice(1, -4);
  return (
    <svg className="absolute overflow-visible" style={style} viewBox={`0 0 ${mark.width} ${mark.height}`}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0.1" stopColor="#ffb8d4" />
          <stop offset="0.9" stopColor="#e2509c" />
        </linearGradient>
        <mask id={`${id}-shape`}>
          <image href={mark.src} width={mark.width} height={mark.height} />
        </mask>
        <mask
          id={`${id}-pen`}
          className="pen"
          maskUnits="userSpaceOnUse"
          x={-50}
          y={-50}
          width={mark.width + 100}
          height={mark.height + 100}
          style={{ "--delay": delay } as CSSProperties}
        >
          {mark.strokes.map(([d, w, s, t], k) => (
            <path key={k} d={d} pathLength={1} strokeWidth={w} style={{ "--s": s * pace, "--t": t * pace } as CSSProperties} />
          ))}
        </mask>
      </defs>
      <g mask={`url(#${id}-pen)`}>
        <rect width={mark.width} height={mark.height} fill={`url(#${id}-fill)`} mask={`url(#${id}-shape)`} />
      </g>
    </svg>
  );
}
