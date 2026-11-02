import { readFileSync } from "node:fs";
import { join } from "node:path";

export default function Home() {
  // Inlined rather than <img> so CSS can recolor its parts:
  // .experience, .high-end-creation, .content-marketing, .swoosh
  // Read here, not at module level, so dev picks up edits to the file on reload.
  const header = readFileSync(join(process.cwd(), "public/web-header.svg"), "utf8");
  return (
    <main className="flex-1 px-4 pt-6 md:px-14 md:pt-10">
      <div className="[&>svg]:h-auto [&>svg]:mx-auto [&>svg]:w-1/2" dangerouslySetInnerHTML={{ __html: header }} />
    </main>
  );
}
