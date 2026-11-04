"use client";

import Image from "next/image";
import { useRef, type CSSProperties, type MouseEvent } from "react";

// The menu, laid out like the one on rockstargames.com/VI: a panel of big links from the
// right, the pistol from the header large on the left. It works as one: it swings its
// barrel onto the link you're on, a laser sight landing in front of the word, and a click
// fires the logo's round there, with a splash at the muzzle, leaving a bullet hole until
// the menu closes.
// A native <dialog> gives the focus trap, Esc and the inert page; globals.css (Menu) has
// the animation. Only transforms and opacity move, and nothing runs while it's closed.

// ponytail: placeholder labels; real pages replace these, and the href="#"s with them.
const LINKS = ["Home", "Work", "Services", "Studio", "Contact"];
const SOCIALS = ["Instagram", "TikTok", "YouTube"];

// Where things are on the pistol, in the pixels of public/pistol.png (the header's logo,
// cropped from docs/img/point_blank_only_pistol_01.png at full size). globals.css has the
// same as percentages (Menu, the weapon).
const PISTOL_W = 1807;
const GRIP = { x: 257, y: 371 }; // what it swings around
const BARREL_Y = 80.5; // the height of the barrel's center line

// The bullet from docs/PB_logo.svg, the dot of its "i".
const ROUND =
  "m224.19,59.71c-.09,3.77-1.1,7.32-2.66,10.73-.24.52-.72,1,.04,1.56.15.11.03.74-.12,1.06-1.05,2.37-2.14,4.73-3.19,7.1-2.1,4.74-4.17,9.5-6.29,14.24-.47,1.05-.75,2.21-2.12,2.73-.48.18-.59,1.36-.83,2.1-.12.37-.02.93-.26,1.13-.25.21-.84.23-1.17.09-3.75-1.59-7.48-3.22-11.21-4.85-.55-.24-1.13-.44-1.61-.79-.33-.24-.74-.74-.68-1.05.07-.4.54-1,.89-1.03,1.08-.11,1.37-.96,1.22-1.59-.5-2.16.54-3.93,1.31-5.72,2.69-6.28,5.48-12.51,8.24-18.75.32-.73.55-1.49,1.63-1.48.27,0,.59-.55.8-.9,1.45-2.39,2.7-4.92,4.38-7.13,1.09-1.44,2.63-2.79,4.27-3.53,3.84-1.74,7.03.62,7.37,5.13.02.32,0,.64,0,.96Z";

const stay = (e: MouseEvent) => e.preventDefault(); // ponytail: placeholder links go nowhere

const pitch = (
  <p className="menu-pitch menu-late">
    High End Creation
    <br />
    and Content Marketing
  </p>
);

// However long its transitions take; with reduced motion there's nothing to wait for.
const settled = (el: Element) => Promise.allSettled(el.getAnimations({ subtree: true }).map((a) => a.finished));

export default function Menu() {
  const dialog = useRef<HTMLDialogElement>(null);
  const part = <T extends HTMLElement | SVGElement>(selector: string) => dialog.current!.querySelector<T>(selector)!;

  const open = () => {
    const menu = dialog.current!;
    menu.showModal();
    // A link aimed at while the panel was still sliding in was measured mid-way.
    settled(menu).then(() => {
      const aimed = menu.querySelector<HTMLElement>("[data-aim]");
      if (aimed) aim(aimed);
    });
  };

  const close = () => {
    const menu = dialog.current!;
    menu.dataset.closing = "";
    settled(menu).then(() => menu.close());
  };

  const aim = (link?: HTMLElement) => {
    const menu = dialog.current!;
    const gun = part<HTMLElement>(".menu-gun");
    const laser = part<HTMLElement>(".menu-laser");
    menu.querySelector<HTMLElement>("[data-aim]")?.removeAttribute("data-aim");
    if (!link || !matchMedia("(min-width: 48rem) and (hover: hover)").matches) {
      gun.style.rotate = laser.style.scale = "";
      return;
    }
    link.dataset.aim = "";
    // Swing around the grip until the barrel's line, which runs above the grip, goes
    // through the spot the round lands on. The laser runs along it from the muzzle to there.
    const logo = part<HTMLElement>(".menu-mount").getBoundingClientRect();
    const spot = link.querySelector(".menu-hole")!.getBoundingClientRect();
    const unit = logo.width / PISTOL_W;
    const dx = spot.x + spot.width / 2 - (logo.x + GRIP.x * unit);
    const dy = spot.y + spot.height / 2 - (logo.y + GRIP.y * unit);
    const reach = Math.hypot(dx, dy);
    const above = (GRIP.y - BARREL_Y) * unit;
    gun.style.rotate = `${Math.atan2(dy, dx) + Math.asin(above / reach)}rad`;
    laser.style.scale = `${(Math.sqrt(reach * reach - above * above) - (PISTOL_W - GRIP.x) * unit) / 100} 1`;
  };

  const fire = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault(); // ponytail: placeholder links; a real one navigates once the round lands
    const link = e.currentTarget;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      link.dataset.hit = "";
      return;
    }
    part(".menu-recoil").animate(
      [
        { translate: "0 0", rotate: "0deg", easing: "cubic-bezier(0.1, 0.9, 0.2, 1)" },
        { translate: "-3.5% 0", rotate: "-2.5deg", offset: 0.1, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        { translate: "0 0", rotate: "0deg" },
      ],
      520,
    );
    const land = () => {
      link.dataset.hit = "";
      link.querySelector(".menu-word")!.animate([{ translate: "3.25rem 0", offset: 0.2, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }], 380);
    };
    // The splash as the round leaves: the flash is gone first, then the ring, the sparks
    // last. Ring and sparks burst out on the first half, then drift and fade on the second.
    const burst = "cubic-bezier(0.16, 1, 0.3, 1)";
    part(".menu-flash").animate([{ opacity: 1, scale: "0.4" }, { opacity: 1, scale: "1", offset: 0.35 }, { opacity: 0, scale: "1.1" }], 130);
    part(".menu-ring").animate(
      [{ opacity: 0.9, scale: "0.15", easing: burst }, { opacity: 0.6, scale: "0.85", offset: 0.5 }, { opacity: 0, scale: "1" }],
      340,
    );
    part(".menu-sparks").animate(
      [{ opacity: 1, scale: "0.3", easing: burst }, { opacity: 1, scale: "0.9", offset: 0.5 }, { opacity: 0, scale: "1" }],
      460,
    );
    const range = parseFloat(part<HTMLElement>(".menu-laser").style.scale) * 100;
    if (!range) return land(); // Phones: no laser to fly along, just the hit.
    part(".menu-round").animate([{ opacity: 1, translate: "0 0" }, { opacity: 1, translate: `${range}px 0` }], 110).onfinish = land;
  };

  const reset = () => {
    const menu = dialog.current!;
    delete menu.dataset.closing;
    menu.querySelectorAll("[data-hit]").forEach((el) => el.removeAttribute("data-hit"));
    aim();
  };

  return (
    <div>
      {/* The negative margin keeps the larger tap target out of the header's layout. */}
      <button
        type="button"
        aria-label="Open menu"
        aria-haspopup="dialog"
        className="menu-burger -m-3 flex flex-col gap-1.5 p-3"
        onClick={open}
      >
        <span className="h-2 w-8 bg-white" />
        <span className="h-2 w-8 bg-white" />
      </button>

      <dialog
        ref={dialog}
        aria-label="Menu"
        className="menu"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={reset}
      >
        {/* First in the DOM so it takes the focus on open; sits right where the burger is. */}
        <button type="button" aria-label="Close menu" className="menu-close" onClick={close}>
          <span />
          <span />
        </button>

        <div className="menu-panel">
          <nav aria-label="Main" className="my-auto">
            <ul>
              {LINKS.map((label, i) => (
                <li key={label} className="overflow-clip" style={{ "--i": i } as CSSProperties}>
                  <a
                    href="#"
                    className="menu-link"
                    aria-current={i === 0 ? "page" : undefined}
                    onPointerEnter={(e) => e.pointerType === "mouse" && aim(e.currentTarget)}
                    onPointerLeave={() => aim()}
                    onFocus={(e) => e.currentTarget.matches(":focus-visible") && aim(e.currentTarget)}
                    onBlur={() => aim()}
                    onClick={fire}
                  >
                    <svg className="menu-hole" viewBox="-16 -16 32 32" aria-hidden>
                      <path d="M-3-3-14-8M3-4 7-15M4 1 15 5M1 4 4 14M-3 3-10 12M-4 0-15 0" />
                      <circle r="4.5" />
                    </svg>
                    <span className="menu-word">{label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {pitch}
          <ul className="menu-socials menu-late">
            {SOCIALS.map((label) => (
              <li key={label}>
                <a href="#" onClick={stay}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="menu-stage" onClick={(e) => e.target === e.currentTarget && close()}>
          {pitch}
        </div>

        <div className="menu-mount">
          <div className="menu-gun">
            <div className="menu-recoil">
              <Image src="/pistol.png" alt="Point Blank" width={1807} height={676} unoptimized loading="eager" draggable={false} className="h-auto w-full" />
              <span className="menu-laser" />
              {/* Turned from its tilt in the logo to point down the barrel. */}
              <svg className="menu-round" viewBox="-24 -24 48 48" aria-hidden>
                <path transform="rotate(65.86) translate(-209.15 -76.85)" d={ROUND} />
              </svg>
            </div>
            {/* Off the recoil so the splash stays where the shot left, not with the kick. */}
            <svg className="menu-splash menu-ring" viewBox="-100 -100 200 200" aria-hidden>
              <ellipse cx="14" rx="42" ry="74" />
            </svg>
            <svg className="menu-splash menu-sparks" viewBox="-100 -100 200 200" aria-hidden>
              <path fill="#fff" d="M14.1 -31.1L21.2 -58.3L9.2 -32.8ZM30.6 -25.9L60.4 -58.4L27 -29.7ZM42 -13.3L85.9 -33L40.1 -18.2ZM49.6 6.9L99.6 8.7L50 1.8ZM36.2 21.4L78.4 40L38.6 16.8ZM21.1 29.2L50.1 59.8L25.1 25.9ZM6.9 31.4L17 55.5L11.8 29.8Z" />
              <path d="M38.8 -63.7a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0ZM82 -52.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0ZM80.6 -13.1a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0ZM90.4 26.7a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0 -5.6 0ZM71.1 59.2a2 2 0 1 0 4 0a2 2 0 1 0 -4 0ZM31.2 63.6a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z" />
            </svg>
            <svg className="menu-splash menu-flash" viewBox="-100 -100 200 200" aria-hidden>
              <path d="M-6 0 8-10 6-34 24-12 62 0 24 12 6 34 8 10Z" />
              <path fill="#fff" d="M-3 0 5-6 4-18 14-7 36 0 14 7 4 18 5 6Z" />
            </svg>
          </div>
        </div>
      </dialog>
    </div>
  );
}
