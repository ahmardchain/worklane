/**
 * Spectrum UI — MorphButton. Adapted for Worklane; Apache-2.0.
 * Upstream: arihantcodes/spectrum-ui/components/spectrumui/morph-button.tsx
 * Changes: CSS state transitions and Lucide icons, existing design tokens,
 * stable sizing, no Motion dependency. Used only for clipboard actions.
 * See vendor/SPECTRUM-NOTICE.md.
 */
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Loader2, X } from "lucide-react";

type State = "idle" | "loading" | "success" | "error";

export function MorphButton({
  children,
  onAction,
  className = "",
  label,
  successLabel = "Copied",
  errorLabel = "Copy unavailable",
}: {
  children: ReactNode;
  onAction: () => Promise<void>;
  className?: string;
  label: string;
  successLabel?: string;
  errorLabel?: string;
}) {
  const [state, setState] = useState<State>("idle");
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (state !== "success" && state !== "error") return;
    const timer = window.setTimeout(() => {
      pending.current = false;
      setState("idle");
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function act() {
    if (pending.current) return;
    pending.current = true;
    setState("loading");
    try {
      await onAction();
      if (mounted.current) setState("success");
    } catch {
      if (mounted.current) setState("error");
    }
  }

  const announcement =
    state === "loading"
      ? "Copying"
      : state === "success"
        ? successLabel
        : state === "error"
          ? errorLabel
          : "";

  return (
    <button
      type="button"
      className={"button morph-button " + className}
      onClick={act}
      data-state={state}
      aria-label={label}
      aria-disabled={state !== "idle" || undefined}
      aria-busy={state === "loading" || undefined}
    >
      <span className="morph-content" key={state} aria-hidden="true">
        {state === "loading" ? (
          <>
            <Loader2 size={16} className="spin" />
            Copying
          </>
        ) : state === "success" ? (
          <>
            <Check size={16} />
            {successLabel}
          </>
        ) : state === "error" ? (
          <>
            <X size={16} />
            {errorLabel}
          </>
        ) : (
          children
        )}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </button>
  );
}
