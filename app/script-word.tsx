import type { CSSProperties } from "react";
import { SCRIPT_WORDS } from "./script-words";

// A handwritten word from app/script-words.ts (made by scripts/script-words.py): the
// letters, shown through a mask of pen strokes that globals.css draws one after another,
// like the header's swoosh, when an ancestor gets data-pen="down" ("up" hides it again;
// without data-pen it just shows). Then the loader's shine crosses it every 4s, like on
// "Experience". Put it in a .scroll-text-script span for its size and tilt; delay (s)
// lets several words be written one after the other.
//
// Not on the page for now. It wrote "alive, unique." in at the end of the scroll text;
// see git history (b7431d3) for how app/scroll-text.tsx triggered it.
export default function ScriptWord({ id, text, delay = 0 }: { id: string; text: string; delay?: number }) {
  const { width, glyphs, strokes, duration } = SCRIPT_WORDS[text];
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
