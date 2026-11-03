"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { setPageBackground } from "./ambient-light";
import { SCRIPT_WORDS, type ScriptWord } from "./script-words";

// The statement under the hero, set in the header's three faces: Benzin caps, one Things
// line, and the last two words in Have Heart. The section is tall and pins the text in
// the middle of the screen. The scroll position drives it, so it goes as fast as you
// scroll:
//  1. on the way in, the lines slide together from alternating sides (--e),
//  2. once pinned, the letters fill from gray to white in reading order (--p),
//  3. the page background drifts from the hero's navy through purple toward pink.
// The exception is the handwriting: when the fill reaches "alive," the pen goes down
// (data-pen) and the two words get written in at the pen's own pace, like the swoosh in
// the header, whatever the scroll does meanwhile.

type Part = [text: string, face?: "serif" | "script"];
// Broken where the sentence breaks: one line per clause, the last one split between
// its subject and "feels alive, unique.". Phones can't fit the second line, so there
// lines wrap (balanced); the no-break spaces keep "1% of the tools" in one piece.
const LINES: Part[][] = [
  [["Artists of old"]],
  [["didn’t have 1%\u00a0of\u00a0the\u00a0tools"]],
  [["that everyone has access to today,", "serif"]],
  [["but their work"]],
  [["feels "], ["alive,", "script"], [" "], ["unique.", "script"]],
];
const TEXT = LINES.map((parts) => parts.map(([t]) => t).join("")).join(" ");
// Each part's index of its first letter in reading order (a script word counts as its
// letters, so it takes as long as they would).
let count = 0;
const ROWS = LINES.map((parts) => parts.map(([text, face]) => ({ text, face, i: (count += text.length) - text.length })));
// The pen goes down at the first script word, and writes them one after the other.
const PEN_AT = ROWS.flat().find((part) => part.face === "script")!.i;
const DELAYS = new Map<string, number>();
let pen = 0;
for (const { text, face } of ROWS.flat()) {
  if (face !== "script") continue;
  DELAYS.set(text, pen);
  pen += SCRIPT_WORDS[text].duration + 0.15;
}
const FRONT = 8; // letters over which the fill fades from gray to white: its soft edge
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
      // Entry: from the section's top at the bottom of the screen until it pins, eased out.
      section.style.setProperty("--e", String(1 - (1 - clamp(1 - top / v)) ** 3));
      // Fill: while pinned, done at 80% of the way so the full text holds for a moment.
      const p = clamp(-top / (0.8 * (height - v)));
      section.style.setProperty("--p", String(p));
      const state = p * (count + FRONT) >= PEN_AT ? "down" : "up";
      if (section.dataset.pen !== state) section.dataset.pen = state;
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

  return (
    <section ref={ref} className="h-[300svh]" style={{ "--span": count + FRONT, "--front": FRONT } as CSSProperties}>
      <div className="@container sticky top-0 flex h-svh items-center justify-center overflow-hidden px-4 md:px-14">
        {/* lg+: lines never wrap. The second is the widest, about 19.4em in these faces,
            so 4.5cqw fits it with room to spare. Below that they wrap, and 8cqw keeps
            "Artists of old" (11.1em) on one line. Capped at 8cqh / 88px so the statement
            sits well inside the screen rather than filling it. */}
        <p className="text-center font-display text-[min(8cqw,8cqh,5.5rem)] leading-[0.95] tracking-[-0.02em] uppercase lg:text-[min(4.5cqw,8cqh,5.5rem)]">
          {/* Screen readers get the plain text; the letter-by-letter copy is for the eye. */}
          <span className="sr-only">{TEXT}</span>
          <span aria-hidden>
            {ROWS.map((parts, l) => (
              <span key={l} className="scroll-text-line block text-balance lg:whitespace-nowrap" style={{ "--dir": l % 2 ? -1 : 1 } as CSSProperties}>
                {parts.map(({ text, face, i }) =>
                  face === "script" ? (
                    <span key={i} className="scroll-text-script">
                      <Script id={`script-${i}`} word={SCRIPT_WORDS[text]} delay={DELAYS.get(text)!} />
                    </span>
                  ) : (
                    <span key={i} className={face === "serif" ? "font-serif text-[1.08em] tracking-normal normal-case" : undefined}>
                      {[...text].map((ch, k) => (
                        <span key={k} className="scroll-text-char" style={{ "--i": i + k } as CSSProperties}>
                          {ch}
                        </span>
                      ))}
                    </span>
                  ),
                )}
              </span>
            ))}
          </span>
        </p>
      </div>
    </section>
  );
}

// One handwritten word (scripts/script-words.py): the letters, shown through a mask of pen
// strokes that globals.css draws one after another, like the header's swoosh. Then the
// loader's shine runs across them every 4s, like on "Experience".
function Script({ id, word: { width, glyphs, strokes, duration }, delay }: { id: string; word: ScriptWord; delay: number }) {
  return (
    <svg viewBox={`0 -750 ${width} 1000`} width={`${width / 1000}em`} height="1em" style={{ "--delay": delay } as CSSProperties}>
      <defs>
        <path id={`${id}-glyphs`} d={glyphs} />
        <mask id={`${id}-pen`} maskUnits="userSpaceOnUse" x={-500} y={-1250} width={width + 1000} height={2000}>
          {strokes.map(([d, w, s, t], k) => (
            <path key={k} d={d} pathLength={1} strokeWidth={w} style={{ "--s": s, "--t": t } as CSSProperties} />
          ))}
        </mask>
        <clipPath id={`${id}-clip`}>
          <use href={`#${id}-glyphs`} />
        </clipPath>
        <linearGradient id={`${id}-shine`}>
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g mask={`url(#${id}-pen)`}>
        <use href={`#${id}-glyphs`} fill="#ffb2c6" />
        <g clipPath={`url(#${id}-clip)`}>
          {/* A slanted band, parked left of the word until it runs. */}
          <rect
            className="scroll-text-shine"
            x={-700}
            y={-1000}
            width={320}
            height={1500}
            transform="skewX(-20)"
            fill={`url(#${id}-shine)`}
            style={{ "--travel": `${width + 1400}px`, "--after": delay + duration } as CSSProperties}
          />
        </g>
      </g>
    </svg>
  );
}
