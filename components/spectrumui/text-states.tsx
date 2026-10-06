/**
 * Spectrum UI — TextStates. Adapted for Worklane; Apache-2.0.
 * Upstream: arihantcodes/spectrum-ui/components/spectrumui/text-states.tsx
 * Text-swap recipe: Jakub Antalík, transitions.dev.
 * Changes: shared CSS, immediate accessible text, rapid-update cleanup,
 * and immediate reduced-motion updates. See vendor/SPECTRUM-NOTICE.md.
 */
"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useReducedMotion } from "../worklane/animated-ui";

export function TextStates({
  text,
  duration = 120,
  translateY = 4,
  blur = 1,
  className = "",
}: {
  text: string;
  duration?: number;
  translateY?: number;
  blur?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || text === shown) return;
    el.classList.add("is-exit");
    const timer = window.setTimeout(() => setShown(text), duration);
    return () => {
      window.clearTimeout(timer);
      el.classList.remove("is-exit");
    };
  }, [text, shown, duration, reduced]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !el.classList.contains("is-exit")) return;
    el.classList.remove("is-exit");
    el.classList.add("is-enter-start");
    void el.offsetHeight;
    el.classList.remove("is-enter-start");
  }, [shown]);

  return (
    <span className={"text-states " + className}>
      <span
        ref={ref}
        aria-hidden="true"
        className="t-text-swap"
        style={
          {
            "--text-swap-dur": duration + "ms",
            "--text-swap-translate-y": translateY + "px",
            "--text-swap-blur": blur + "px",
          } as CSSProperties
        }
      >
        {reduced ? text : shown}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
