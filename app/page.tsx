import { readFileSync } from "node:fs";
import { join } from "node:path";
import ScrollText from "./scroll-text";

export default function Home() {
  // Inlined rather than <img> so CSS can recolor its parts:
  // .experience, .high-end-creation, .content-marketing, .swoosh
  // Read here, not at module level, so dev picks up edits to the file on reload.
  const header = readFileSync(join(process.cwd(), "public/web-header.svg"), "utf8");
  return (
    // Phones: header text full width, right above the VSL, the pair sitting a little above
    // the middle (the free space splits 1:3 above and below). md+: header at the top, the
    // VSL filling what's left under it. Either way the hero is exactly the first screen
    // under the top bar; the scroll text section follows.
    <>
      <main className="grid h-[calc(100svh-var(--header-h))] grid-cols-1 grid-rows-[1fr_auto_auto_3fr] px-4 py-6 md:flex md:flex-col md:px-14 md:pt-5">
        <div
          className="row-start-2 [&>svg]:mx-auto [&>svg]:h-auto [&>svg]:w-full md:[&>svg]:w-1/2"
          dangerouslySetInnerHTML={{ __html: header }}
        />
        {/* md+: fills what's left of the screen and the 16:9 box takes the largest size that
            fits it. The absolute inner layer is the size container: Chrome leaves cqh at 0 on
            a container whose height only comes from flex. Phones: just the box's own 16:9.
            Gap above = 4% of the header SVG's height (md+: 24px, the same as under the box).
            % margins resolve against the width, and the SVG's height is its width * 499/2940
            (its viewBox): full width on phones gives 0.68%, half width on md+ would be 0.34%.
            Phones: the box is then nudged down 8svh with a transform, which leaves the layout
            and so the header's spot as they are. */}
        <div className="relative row-start-3 mt-[0.68%] aspect-video translate-y-[8svh] md:mt-6 md:aspect-auto md:min-h-48 md:flex-1 md:translate-y-0">
          <div className="absolute inset-0 [container-type:size]">
            {/* VSL placeholder. Border uses the loader shine gradient, like "Experience";
                the fill is the same gradient at low opacity over the page background. */}
            <div
              className="vsl-box mx-auto flex aspect-video w-[min(100cqw,100cqh*16/9)] items-center justify-center rounded-3xl border-2 border-transparent"
              style={{
                background:
                  "linear-gradient(232deg, rgb(255 178 198 / 0.14) 20%, rgb(152 139 208 / 0.14) 70%) padding-box, linear-gradient(var(--background), var(--background)) padding-box, linear-gradient(232deg, #ffb2c6 20%, #988bd0 70%) border-box",
              }}
            >
              <span className="text-[clamp(1.5rem,min(5.625cqw,10cqh),6rem)] font-bold italic">VSL</span>
            </div>
          </div>
        </div>
        {/* Phones: a small scroll hint at the bottom of the hero (globals.css .scroll-notice).
            The left padding evens out the letter-spacing after the last letter. */}
        <div aria-hidden className="scroll-notice row-start-4 flex flex-col items-center gap-2 self-end justify-self-center md:hidden">
          <span className="pl-[0.3em] text-xs tracking-[0.3em] text-white/60 uppercase">Scroll</span>
          <span className="scroll-notice-line" />
        </div>
      </main>
      <ScrollText />
      {/* ponytail: room to scroll past the statement while testing its reveal; remove when
          the next section goes here. */}
      <div aria-hidden className="h-[150svh]" />
    </>
  );
}
