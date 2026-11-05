"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

// The 3D slider of docs/reference_comp/and2es-3d-slider (styles in globals.css), with its tilt
// and smoothing, but 8 round logos that always face the screen, going around a ring. The page's
// scroll turns it: the section is a tall track with the ring pinned on screen and one snap stop
// per logo, so scrolling scrubs the ring, and wherever it's let go the browser's own scroll
// snap settles it with a logo in the middle. Nothing is triggered. The loop rests off screen.
// Under it, small and still, the fallen four, in gray. Every logo of the ring glows a little,
// the front one fully with the mouse on it; the fallen ones only faintly, pointed at
// (globals.css, the glows from scripts/logo-avatars.py).

// In the order they come to the middle.
const LOGOS = ["samurai", "snake", "helmet", "parrot", "book", "triangle", "cake", "bolt"];
const ANGLE_BETWEEN_LOGOS = 360 / LOGOS.length;
const FALLEN = ["spartan", "hacker", "star", "whiskey"];
// All in logo widths, so the ring looks the same at any screen size. A real ring, so one logo
// in the middle puts two more on each side, and the rest behind them, without placing any.
const RADIUS_X = 2.85;
const RADIUS_Z = 1.3;
const PERSPECTIVE = 3.5;
// Equal angles would bunch the logos at the ellipse's narrow ends. This much of sin(2 * angle)
// taken off the angle spaces them evenly along its length.
const EVEN_OUT = (RADIUS_X ** 2 - RADIUS_Z ** 2) / (RADIUS_X ** 2 + RADIUS_Z ** 2) / 4;
// Its front is at the screen's own depth, full size, and it turns around its own middle: the
// front leans toward the mouse and the back away from it.
const RING_MIDDLE = -RADIUS_Z;
// Degrees, seen from a little above even with the mouse in the middle, so it reads as a ring.
const LOOK_DOWN = -10;
// How fast a logo darkens going back, per unit of scale lost.
const DIMMING = 1.2;
const SMOOTHING = 0.05;
const MAX_TILT = 30;

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

export default function OrbitSlider() {
  const sliderRef = useRef<HTMLElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const slider = sliderRef.current;
    const view = viewRef.current;
    const stage = stageRef.current;
    const orbit = orbitRef.current;
    if (!slider || !view || !stage || !orbit) return;

    const logos = orbit.querySelectorAll<HTMLElement>(".panel");
    let currentRotation = 0;
    let targetTiltX = 0;
    let targetTiltY = 0;
    let currentTiltX = 0;
    let currentTiltY = 0;
    let frame = 0;
    let pointer: { x: number; y: number } | undefined;

    const listeners = new AbortController();
    const on = { passive: true, signal: listeners.signal };
    slider.addEventListener(
      "mousemove",
      (e) => {
        targetTiltY = (e.clientX / window.innerWidth - 0.5) * MAX_TILT;
        targetTiltX = -(e.clientY / window.innerHeight - 0.5) * MAX_TILT;
      },
      on,
    );
    // Where the mouse is, for the middle logo: in 3D the browser won't tell it it's hovered.
    slider.addEventListener("pointermove", (e) => (pointer = e.pointerType === "mouse" ? { x: e.clientX, y: e.clientY } : undefined), on);
    slider.addEventListener("pointerleave", () => (pointer = undefined), on);
    slider.addEventListener(
      "mouseleave",
      () => {
        targetTiltX = 0;
        targetTiltY = 0;
      },
      on,
    );

    let lit: HTMLElement | undefined;
    const place = () => {
      const tiltX = LOOK_DOWN + currentTiltX;
      stage.style.transform = `rotateX(${tiltX}deg) rotateY(${currentTiltY}deg)`;
      let nearest = 0;
      let nearestDepth = -Infinity;
      logos.forEach((logo, i) => {
        const angle = ((i * ANGLE_BETWEEN_LOGOS + currentRotation) * Math.PI) / 180;
        const along = angle - EVEN_OUT * Math.sin(2 * angle);
        const depth = RING_MIDDLE + RADIUS_Z * Math.cos(along);
        if (depth > nearestDepth) [nearest, nearestDepth] = [i, depth];
        // Undoing the stage's tilt keeps it square on to the screen, so it stays a true circle.
        logo.style.transform =
          `translate3d(${RADIUS_X * Math.sin(along) * 100}%, 0, calc(var(--logo) * ${depth})) ` +
          `rotateY(${-currentTiltY}deg) rotateX(${-tiltX}deg)`;
        const scale = PERSPECTIVE / (PERSPECTIVE - depth);
        logo.style.filter = `brightness(${1 - (1 - scale) * DIMMING})`;
      });
      // The front one, in the middle, lights up with the mouse on it (globals.css).
      let over: HTMLElement | undefined;
      if (pointer) {
        const r = logos[nearest].getBoundingClientRect();
        const inside = Math.hypot(pointer.x - r.left - r.width / 2, pointer.y - r.top - r.height / 2) <= r.width / 2;
        if (inside) over = logos[nearest];
      }
      if (over !== lit) {
        lit?.removeAttribute("data-lit");
        over?.setAttribute("data-lit", "");
        lit = over;
      }
    };
    place();

    const animate = () => {
      const { top, height } = slider.getBoundingClientRect();
      const scrolled = Math.min(Math.max(-top / (height - view.clientHeight), 0), 1);
      const targetRotation = -ANGLE_BETWEEN_LOGOS * (LOGOS.length - 1) * scrolled;
      currentRotation = lerp(currentRotation, targetRotation, SMOOTHING);
      currentTiltX = lerp(currentTiltX, targetTiltX, SMOOTHING);
      currentTiltY = lerp(currentTiltY, targetTiltY, SMOOTHING);
      place();
      frame = requestAnimationFrame(animate);
    };

    const onScreen = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (entry.isIntersecting) frame = requestAnimationFrame(animate);
    });
    onScreen.observe(slider);

    return () => {
      listeners.abort();
      onScreen.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={sliderRef} className="slider">
      <div ref={viewRef} className="slider-view" style={{ perspective: `calc(var(--logo) * ${PERSPECTIVE})` }}>
        <div ref={stageRef} className="stage" style={{ transformOrigin: `50% 50% calc(var(--logo) * ${RING_MIDDLE})` }}>
          <div ref={orbitRef} className="orbit">
            {LOGOS.map((logo) => (
              <div key={logo} className="panel">
                <Image src={`/logos/${logo}.png`} alt="" fill sizes="18vw" />
                <Image src={`/logos/glow/${logo}.png`} alt="" width={384} height={272} unoptimized className="glow" />
              </div>
            ))}
          </div>
        </div>
        <div className="fallen">
          {FALLEN.map((logo) => (
            <div key={logo} className="fallen-logo">
              <Image src={`/logos/fallen/${logo}.png`} alt="" fill sizes="(min-width: 64rem) 5rem, 3rem" />
              <Image src={`/logos/fallen/glow/${logo}.png`} alt="" width={384} height={272} unoptimized className="glow" />
            </div>
          ))}
        </div>
      </div>
      {LOGOS.map((logo) => (
        <div key={logo} className="slider-stop" />
      ))}
    </section>
  );
}
