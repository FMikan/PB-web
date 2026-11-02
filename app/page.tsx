import { readFileSync } from "node:fs";
import { join } from "node:path";

export default function Home() {
  // Inlined rather than <img> so CSS can recolor its parts:
  // .experience, .high-end-creation, .content-marketing, .swoosh
  // Read here, not at module level, so dev picks up edits to the file on reload.
  const header = readFileSync(join(process.cwd(), "public/web-header.svg"), "utf8");
  return (
    <main className="flex flex-1 flex-col px-4 py-6 md:px-14 md:pt-5">
      <div className="[&>svg]:h-auto [&>svg]:mx-auto [&>svg]:w-1/2" dangerouslySetInnerHTML={{ __html: header }} />
      {/* Fills what's left of the screen; the 16:9 box takes the largest size that fits it.
          The absolute inner layer is the size container: Chrome leaves cqh at 0 on a
          container whose height only comes from flex. */}
      {/* Phones: gap = 4% of the header SVG's height. % margins resolve against the width:
          SVG height = 50% of width * 499/2940 (its viewBox), so 4% of it = 0.34% of width.
          md+: 24px, the same as the gap under the box (py-6). */}
      <div className="relative mt-[0.34%] min-h-48 flex-1 md:mt-6">
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
    </main>
  );
}
