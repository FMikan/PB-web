"use client";

import { useEffect, useRef, useState } from "react";

const CYCLE = 2150; // ms, one glint; matches the .loader animations in globals.css
const MIN_CYCLES = 2;

export default function Loader() {
  const logo = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let timer = 0;
    // Once the page has loaded, show at least MIN_CYCLES glints and let the
    // current one finish, then fade out.
    const done = () => {
      const t = Number(logo.current?.getAnimations()[0]?.currentTime ?? 0);
      const wait = Math.max(MIN_CYCLES * CYCLE - t, CYCLE - (t % CYCLE));
      timer = window.setTimeout(() => setLeaving(true), wait);
    };
    if (document.readyState === "complete") done();
    else window.addEventListener("load", done, { once: true });
    return () => {
      window.removeEventListener("load", done);
      clearTimeout(timer);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      className="loader"
      data-leaving={leaving || undefined}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget) setGone(true);
      }}
      aria-hidden
    >
      <noscript>
        <style>{".loader{display:none}"}</style>
      </noscript>
      <div ref={logo} className="loader-logo" />
    </div>
  );
}
