import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import Image from "next/image";
import AmbientLight from "./ambient-light";
import "./globals.css";
import Loader from "./loader";
import Menu from "./menu";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Benzin, the sans of the header and the statement, for the menu's links (app/menu.tsx).
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
      <body className="min-h-full flex flex-col pt-(--header-h)">
        <Loader />
        <AmbientLight />
        {/* Only what's in it takes the pointer, so the page under the rest of the bar still does. */}
        <header className="site-header pointer-events-none fixed inset-x-0 top-0 z-50 flex h-(--header-h) items-center justify-between px-4 pt-6 md:px-14 md:pt-15 [&>*]:pointer-events-auto">
          {/* A plain link: next/link does nothing on a second click, with the URL already at #top.
              ponytail: one page for now; with more routes this should lead home, not up this one. */}
          <a href="#top">
            <Image src="/logo.png" alt="Point Blank" width={480} height={180} preload className="h-8 w-auto" />
          </a>
          <Menu />
        </header>
        {children}
      </body>
    </html>
  );
}
