import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import Image from "next/image";
import AmbientLight from "./ambient-light";
import "./globals.css";
import Loader from "./loader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Benzin, the face of the header SVG's "and Content Marketing" (public/web-header.svg),
// for live text. Subset to Latin from docs/fonts. Have Heart isn't loaded: its words are
// drawn as SVG (app/script-words.ts, made from app/fonts/have-heart-one.woff2).
const benzin = localFont({ src: "./fonts/benzin-semibold.woff2", weight: "600", variable: "--font-benzin" });

export const metadata: Metadata = {
  title: "PB",
  description: "",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${benzin.variable} h-full antialiased overscroll-none`}
    >
      <body className="min-h-full flex flex-col">
        <Loader />
        <AmbientLight />
        <header className="flex h-(--header-h) items-center justify-between px-4 pt-6 md:px-14 md:pt-15">
          <Image src="/logo.png" alt="Point Blank" width={480} height={180} preload className="h-8 w-auto" />
          {/* ponytail: menu does nothing yet, wire it up when there is a menu */}
          <button type="button" aria-label="Menu" className="flex flex-col gap-1.5">
            <span className="h-2 w-8 bg-white" />
            <span className="h-2 w-8 bg-white" />
          </button>
        </header>
        {children}
      </body>
    </html>
  );
}
