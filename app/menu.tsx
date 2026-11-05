"use client";

import Image from "next/image";
import { useRef, type CSSProperties, type MouseEvent } from "react";

// The menu, laid out like the one on rockstargames.com/VI: a panel of big links from the
// right, the pistol from the header large on the left. It works as one: it swings its
// barrel onto the link you're on, a laser sight landing in front of the word, and a click
// fires the logo's round there.
// A native <dialog> gives the focus trap, Esc and the inert page; globals.css (Menu) has
// the animation. Only transforms and opacity move, and nothing runs while it's closed.

// ponytail: placeholder labels; real pages replace these, and the href="#"s with them.
const LINKS = ["Home", "Work", "Services", "Studio", "Contact"];

// Where things are on the pistol, in the pixels of public/pistol.png (the header's logo,
// cropped from docs/img/point_blank_only_pistol_01.png at full size). globals.css has the
// same as percentages (Menu, the weapon).
const PISTOL_W = 1807;
const GRIP = { x: 257, y: 371 }; // what it swings around
const BARREL_Y = 80.5; // the height of the barrel's center line

// The bullet from docs/PB_logo.svg, the dot of its "i".
const ROUND =
  "m224.19,59.71c-.09,3.77-1.1,7.32-2.66,10.73-.24.52-.72,1,.04,1.56.15.11.03.74-.12,1.06-1.05,2.37-2.14,4.73-3.19,7.1-2.1,4.74-4.17,9.5-6.29,14.24-.47,1.05-.75,2.21-2.12,2.73-.48.18-.59,1.36-.83,2.1-.12.37-.02.93-.26,1.13-.25.21-.84.23-1.17.09-3.75-1.59-7.48-3.22-11.21-4.85-.55-.24-1.13-.44-1.61-.79-.33-.24-.74-.74-.68-1.05.07-.4.54-1,.89-1.03,1.08-.11,1.37-.96,1.22-1.59-.5-2.16.54-3.93,1.31-5.72,2.69-6.28,5.48-12.51,8.24-18.75.32-.73.55-1.49,1.63-1.48.27,0,.59-.55.8-.9,1.45-2.39,2.7-4.92,4.38-7.13,1.09-1.44,2.63-2.79,4.27-3.53,3.84-1.74,7.03.62,7.37,5.13.02.32,0,.64,0,.96Z";

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
    aim(); // Off the link, so the pistol leaves from wherever it was pointing.
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
    const spot = link.querySelector(".menu-spot")!.getBoundingClientRect();
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
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    part(".menu-recoil").animate(
      [
        { translate: "0 0", rotate: "0deg", easing: "cubic-bezier(0.1, 0.9, 0.2, 1)" },
        { translate: "-3.5% 0", rotate: "-2.5deg", offset: 0.1, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        { translate: "0 0", rotate: "0deg" },
      ],
      520,
    );
    const range = parseFloat(part<HTMLElement>(".menu-laser").style.scale) * 100;
    if (!range) return; // Phones: no laser to fly along.
    part(".menu-round").animate([{ opacity: 1, translate: "0 0" }, { opacity: 1, translate: `${range}px 0` }], 110);
  };

  const reset = () => {
    const menu = dialog.current!;
    delete menu.dataset.closing;
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
                <li key={label} style={{ "--i": i, "--from-last": LINKS.length - 1 - i } as CSSProperties}>
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
                    <span className="menu-spot" />
                    <span className="menu-word">{label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {pitch}
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
          </div>
        </div>
      </dialog>
    </div>
  );
}
