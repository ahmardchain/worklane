/**
 * Spectrum UI — Event Badge interaction adapted for Worklane; Apache-2.0.
 * Reference: arihantcodes/spectrum-ui/app/registry/badge/badgedemo.tsx
 * Changes: native DOM/CSS 3D and a damped spring replace the WebGL renderer,
 * Rapier joints and external Vercel assets. The suspended, draggable badge keeps
 * readable HTML, touch scrolling, keyboard input and reduced-motion support.
 * See vendor/SPECTRUM-NOTICE.md.
 */
"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useReducedMotion } from "../worklane/animated-ui";

type Motion = {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  angularVelocity: number;
};
const resting = (): Motion => ({
  x: 0,
  y: 0,
  angle: 0,
  vx: 0,
  vy: 0,
  angularVelocity: 0,
});
const clamp = (value: number, limit: number) =>
  Math.max(-limit, Math.min(limit, value));

export function EventBadge({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const hintId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const strap = useRef<SVGPathElement>(null);
  const stitching = useRef<SVGPathElement>(null);
  const animation = useRef<number | null>(null);
  const motion = useRef(resting());
  const visible = useRef(true);
  const drag = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    offsetX: number;
    offsetY: number;
    time: number;
    moved: number;
  } | null>(null);
  const clickMoved = useRef(false);
  const grip = useRef<HTMLButtonElement>(null);

  const draw = useCallback(() => {
    const surface = card.current;
    const stage = frame.current;
    if (!surface || !stage) return;
    const { x, y, angle } = motion.current;
    surface.style.setProperty("--badge-x", x.toFixed(2) + "px");
    surface.style.setProperty("--badge-y", y.toFixed(2) + "px");
    surface.style.setProperty("--badge-angle", angle.toFixed(2) + "deg");
    surface.style.setProperty("--badge-turn", clamp(x * 0.09, 8) + "deg");
    surface.style.setProperty("--badge-pitch", clamp(-y * 0.055, 6) + "deg");
    const center = stage.clientWidth / 2;
    const hookX = center + x;
    const hookY = surface.offsetTop + y + 5;
    const path = `M ${center} 3 C ${center} ${hookY * 0.42}, ${hookX} ${hookY * 0.64}, ${hookX} ${hookY}`;
    strap.current?.setAttribute("d", path);
    stitching.current?.setAttribute("d", path);
    stage.dataset.displacement = Math.hypot(x, y).toFixed(2);
  }, []);

  const cancel = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    const pointerId = drag.current?.pointerId;
    drag.current = null;
    if (pointerId !== undefined && grip.current?.hasPointerCapture(pointerId))
      grip.current.releasePointerCapture(pointerId);
    motion.current = resting();
    if (frame.current) frame.current.dataset.motion = "idle";
    draw();
  }, [cancel, draw]);

  const settle = useCallback(() => {
    cancel();
    if (reduced || !visible.current || document.hidden) {
      reset();
      return;
    }
    if (frame.current) frame.current.dataset.motion = "settling";
    let last = 0;
    function tick(now: number) {
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      const m = motion.current;
      m.vx += (-95 * m.x - 11 * m.vx) * dt;
      m.vy += (-120 * m.y - 14 * m.vy) * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      // The card trails its suspension point as the strap pulls it home.
      const angleTarget = clamp(-m.x * 0.14 - m.vx * 0.014, 11);
      m.angularVelocity +=
        (90 * (angleTarget - m.angle) - 12 * m.angularVelocity) * dt;
      m.angle += m.angularVelocity * dt;
      draw();
      if (
        Math.abs(m.x) + Math.abs(m.y) + Math.abs(m.angle) < 0.12 &&
        Math.abs(m.vx) + Math.abs(m.vy) + Math.abs(m.angularVelocity) < 0.3
      ) {
        reset();
        return;
      }
      animation.current = requestAnimationFrame(tick);
    }
    animation.current = requestAnimationFrame(tick);
  }, [cancel, draw, reduced, reset]);

  useEffect(() => {
    reset();
    const stage = frame.current;
    if (!stage) return;
    const resize = new ResizeObserver(reset);
    resize.observe(stage);
    if (card.current) resize.observe(card.current);
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      if (!entry.isIntersecting) reset();
    });
    observer.observe(stage);
    const visibilityChanged = () => {
      if (document.hidden) reset();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      cancel();
      resize.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [cancel, reduced, reset]);

  function begin(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || drag.current) return;
    cancel();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      offsetX: motion.current.x,
      offsetY: motion.current.y,
      time: event.timeStamp,
      moved: 0,
    };
    clickMoved.current = false;
    if (frame.current) frame.current.dataset.motion = "dragging";
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const held = drag.current;
    const stage = frame.current;
    const surface = card.current;
    if (!held || held.pointerId !== event.pointerId || !stage || !surface)
      return;
    const m = motion.current;
    const distanceX = event.clientX - held.originX;
    const distanceY = event.clientY - held.originY;
    const limit = Math.max(
      12,
      (stage.clientWidth - surface.offsetWidth) / 2 - 12,
    );
    const x = clamp(held.offsetX + distanceX, limit);
    const y = Math.max(-28, Math.min(65, held.offsetY + distanceY));
    const dt = Math.max(1 / 120, (event.timeStamp - held.time) / 1000);
    m.vx = clamp((x - m.x) / dt, 240);
    m.vy = clamp((y - m.y) / dt, 240);
    m.x = x;
    m.y = y;
    m.angle = reduced ? 0 : clamp(-x * 0.15, 9);
    m.angularVelocity = 0;
    held.time = event.timeStamp;
    held.moved = Math.max(held.moved, Math.hypot(distanceX, distanceY));
    clickMoved.current = held.moved > 5;
    if (animation.current === null)
      animation.current = requestAnimationFrame(() => {
        animation.current = null;
        draw();
      });
  }

  function release(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    settle();
  }

  function nudge(x: number, y: number) {
    if (reduced) return;
    motion.current.vx = clamp(motion.current.vx + x, 300);
    motion.current.vy = clamp(motion.current.vy + y, 220);
    settle();
  }

  function keydown(event: KeyboardEvent<HTMLButtonElement>) {
    const nudges: Record<string, [number, number]> = {
      ArrowLeft: [-170, 0],
      ArrowRight: [170, 0],
      ArrowUp: [0, -100],
      ArrowDown: [0, 140],
    };
    if (event.key === "Escape" || event.key === "Home") {
      event.preventDefault();
      reset();
    } else if (nudges[event.key]) {
      event.preventDefault();
      nudge(...nudges[event.key]);
    }
  }

  return (
    <div className="event-badge">
      <div
        ref={frame}
        className="event-badge-stage"
        data-motion="idle"
        data-reduced-motion={reduced}
      >
        <svg className="badge-lanyard" aria-hidden="true">
          <path ref={strap} className="badge-strap" />
          <path ref={stitching} className="badge-stitching" />
        </svg>
        <span className="badge-anchor" aria-hidden="true" />
        <div ref={card} className="badge-body">
          <span className="badge-clip" aria-hidden="true" />
          {children}
          <button
            ref={grip}
            type="button"
            className="badge-grip"
            aria-label="Animate the example agent ID card"
            aria-describedby={hintId}
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={release}
            onPointerCancel={release}
            onLostPointerCapture={release}
            onKeyDown={keydown}
            onClick={(event) => {
              if (event.detail === 0 || !clickMoved.current) nudge(190, -70);
              clickMoved.current = false;
            }}
          />
        </div>
      </div>
      <p id={hintId} className="badge-hint">
        {reduced ? (
          "Example agent ID · reduced motion"
        ) : (
          <>
            <span aria-hidden="true">Drag the ID · release to swing</span>
            <span className="sr-only">
              Drag the card, use arrow keys, or press Enter to swing it. Press
              Escape to reset. On touch screens, drag sideways; swipe vertically
              to scroll.
            </span>
          </>
        )}
      </p>
    </div>
  );
}
