/**
 * Spectrum UI — TiltCard. Adapted for Worklane; Apache-2.0.
 * Upstream: arihantcodes/spectrum-ui/components/spectrumui/tilt-card.tsx
 * Changes: restrained CSS tilt, no glare, no Motion dependency, and frame-batched
 * pointer updates. Mouse-only; reduced motion disables tilt and layer depth.
 * See vendor/SPECTRUM-NOTICE.md.
 */
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useReducedMotion } from "../worklane/animated-ui";

const TiltCardContext = createContext(false);

export function TiltCard({
  children,
  maxTilt = 6,
  className = "",
  containerClassName = "",
}: {
  children: ReactNode;
  maxTilt?: number;
  className?: string;
  containerClassName?: string;
}) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const point = useRef({ x: 0, y: 0 });

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || reduced) return;
    const rect = event.currentTarget.getBoundingClientRect();
    point.current = {
      x: Math.max(
        -1,
        Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2),
      ),
      y: Math.max(
        -1,
        Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2),
      ),
    };
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      surface.current?.style.setProperty(
        "--tilt-x",
        -point.current.y * maxTilt + "deg",
      );
      surface.current?.style.setProperty(
        "--tilt-y",
        point.current.x * maxTilt + "deg",
      );
    });
  }

  function reset() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setHovered(false);
    surface.current?.style.setProperty("--tilt-x", "0deg");
    surface.current?.style.setProperty("--tilt-y", "0deg");
  }

  return (
    <div
      className={"tilt-card " + containerClassName}
      onPointerMove={move}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" && !reduced) setHovered(true);
      }}
      onPointerLeave={reset}
      onPointerCancel={reset}
      data-tilted={hovered && !reduced}
    >
      <div ref={surface} className={"tilt-surface " + className}>
        <TiltCardContext.Provider value={hovered && !reduced}>
          {children}
        </TiltCardContext.Provider>
      </div>
    </div>
  );
}

export function TiltCardItem({
  children,
  depth = 0,
  className = "",
}: {
  children: ReactNode;
  depth?: number;
  className?: string;
}) {
  const hovered = useContext(TiltCardContext);
  return (
    <div
      className={"tilt-layer " + className}
      style={{ "--layer-depth": (hovered ? depth : 0) + "px" } as CSSProperties}
    >
      {children}
    </div>
  );
}
