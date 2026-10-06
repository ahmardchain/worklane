"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const query = "(prefers-reduced-motion: reduce)";
let motionMedia: MediaQueryList | undefined;
const motionSubscribers = new Set<() => void>();
const media = () => (motionMedia ??= window.matchMedia(query));
const motionChanged = () => motionSubscribers.forEach((callback) => callback());
function subscribeMotion(callback: () => void) {
  motionSubscribers.add(callback);
  if (motionSubscribers.size === 1)
    media().addEventListener("change", motionChanged);
  return () => {
    motionSubscribers.delete(callback);
    if (!motionSubscribers.size)
      media().removeEventListener("change", motionChanged);
  };
}
const readMotion = () => media().matches;
const serverMotion = () => false;

export function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
}

type Option = { value: string; label: ReactNode };
export function SegmentedControl({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    function measure() {
      const selected = el.querySelector<HTMLButtonElement>(
        '[aria-pressed="true"]',
      );
      if (!selected) return;
      el.style.setProperty("--selection-x", selected.offsetLeft + "px");
      el.style.setProperty("--selection-y", selected.offsetTop + "px");
      el.style.setProperty("--selection-width", selected.offsetWidth + "px");
      el.style.setProperty("--selection-height", selected.offsetHeight + "px");
      el.dataset.measured = "true";
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.querySelectorAll("button").forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [value]);

  return (
    <div
      ref={ref}
      className={"segmented-control " + className}
      role="group"
      aria-label={label}
    >
      <span className="selection-rail" aria-hidden="true" />
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const direction =
              event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowLeft"
                  ? -1
                  : 0;
            if (!direction && event.key !== "Home" && event.key !== "End")
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : (index + direction + options.length) % options.length;
            onChange(options[next].value);
            ref.current
              ?.querySelectorAll<HTMLButtonElement>("button")
              [next]?.focus();
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Disclosure({
  open,
  id,
  children,
}: {
  open: boolean;
  id: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="job-disclosure"
      data-open={open}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="disclosure-content">{children}</div>
    </div>
  );
}

export function AnimatedList({
  children,
  className = "",
  live = false,
}: {
  children: ReactNode;
  className?: string;
  live?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const animations = useRef(new Map<HTMLElement, Animation>());
  const reduced = useReducedMotion();

  useEffect(
    () => () => {
      animations.current.forEach((animation) => animation.cancel());
    },
    [],
  );

  useLayoutEffect(() => {
    const el = ref.current!;
    const next = new Map<string, number>();
    const active = new Set<HTMLElement>();
    if (reduced) animations.current.forEach((animation) => animation.cancel());
    el.querySelectorAll<HTMLElement>("[data-motion-key]").forEach((row) => {
      active.add(row);
      const key = row.dataset.motionKey!;
      const top = row.offsetTop;
      const before = positions.current.get(key);
      next.set(key, top);
      if (reduced || typeof row.animate !== "function") return;
      if (before === undefined || before !== top) {
        animations.current.get(row)?.cancel();
        animations.current.set(
          row,
          row.animate(
            [
              {
                opacity: before === undefined ? 0 : 1,
                transform:
                  "translateY(" +
                  (before === undefined ? 6 : before - top) +
                  "px)",
              },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          ),
        );
      }
    });
    animations.current.forEach((animation, row) => {
      if (!active.has(row)) {
        animation.cancel();
        animations.current.delete(row);
      }
    });
    positions.current = next;
  }, [children, reduced]);

  return (
    <div
      ref={ref}
      className={"motion-list " + className}
      aria-live={live ? "polite" : undefined}
    >
      {children}
    </div>
  );
}
