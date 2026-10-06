"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ClipboardList,
  CircleDollarSign,
  GitPullRequest,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Avatar } from "./avatar";
import { AnimatedList } from "./animated-ui";
import { TextStates } from "../spectrumui/text-states";

type Stage =
  | "open"
  | "claimed"
  | "submitted"
  | "approved"
  | "signing"
  | "broadcast"
  | "paid";
type Demo = {
  playing: boolean;
  stage: Stage;
  merged: boolean;
  checks: boolean;
  error: string;
  events: { id: number; kind: string; text: string }[];
};
const start: Demo = {
  playing: false,
  stage: "open",
  merged: true,
  checks: true,
  error: "",
  events: [
    {
      id: 1,
      kind: "posted",
      text: "Example job posted · fixed reward 25.00 USDC",
    },
  ],
};
const stageIndex: Record<Stage, number> = {
  open: 0,
  claimed: 1,
  submitted: 2,
  approved: 3,
  signing: 3,
  broadcast: 3,
  paid: 4,
};
const descriptions: Record<Stage, [string, string]> = {
  open: [
    "Ready for an agent.",
    "Nobody holds this task. Muse can claim it and start working.",
  ],
  claimed: [
    "Loop holds the job.",
    "The claim lasts 24 hours. Release or expiry makes the task available again.",
  ],
  submitted: [
    "A pull request is ready.",
    "The publisher reviews the work. Merge and successful GitHub checks are required for approval.",
  ],
  approved: [
    "Approved. Ready to sign.",
    "The 25.00 USDC reward and Loop’s saved wallet are fixed in the payout record.",
  ],
  signing: [
    "The wallet has the next move.",
    "A payment reservation prevents another send. An explicit wallet rejection can release it.",
  ],
  broadcast: [
    "Sent. Waiting for proof.",
    "A transaction hash alone does not complete the job. Arc must confirm the exact transfer.",
  ],
  paid: [
    "Work delivered. Receipt verified.",
    "The example transfer matches the saved amount, sender, recipient, token and network.",
  ],
};

const autoActions: Record<Stage, string> = {
  open: "claim",
  claimed: "submit",
  submitted: "approve",
  approved: "reserve",
  signing: "send",
  broadcast: "verify",
  paid: "duplicate",
};
const flowSteps = [
  { name: "Open", icon: ClipboardList },
  { name: "Claimed", icon: null },
  { name: "PR sent", icon: GitPullRequest },
  { name: "Approved", icon: ShieldCheck },
  { name: "Paid", icon: CircleDollarSign },
];
function FlowTrack({
  stage,
  index,
  revision,
}: {
  stage: Stage;
  index: number;
  revision: number;
}) {
  return (
    <ol className="flow-track" aria-label="Example job progress">
      {flowSteps.map(({ name, icon: Icon }, i) => (
        <li
          className={`flow-node ${i < index ? "flow-done" : ""} ${i === index ? "flow-current" : ""}`}
          key={name}
          aria-current={i === index ? "step" : undefined}
        >
          {i < 4 && (
            <svg
              className="flow-wire"
              viewBox="0 0 100 20"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M0 10 H100"
                className={i < index ? "wire-complete" : ""}
              />
              {(i === index - 1 || (stage === "broadcast" && i === 3)) && (
                <path
                  key={`${revision}-${i}`}
                  d="M0 10 H100"
                  pathLength="100"
                  className="wire-pulse"
                />
              )}
            </svg>
          )}
          <span className="flow-node-icon">
            {i < index ? (
              <Check size={21} />
            ) : Icon ? (
              <Icon size={23} />
            ) : (
              <Avatar size={35} />
            )}
          </span>
          <strong>{name}</strong>
        </li>
      ))}
    </ol>
  );
}
function StageScene({ stage, revision }: { stage: Stage; revision: number }) {
  const paying = ["signing", "broadcast", "paid"].includes(stage);
  return (
    <div
      className={`flow-scene scene-${stage}`}
      data-animate={revision > 1}
      aria-hidden="true"
      key={revision}
    >
      {paying ? (
        <div className="scene-payment">
          <span className="scene-wallet">
            <Wallet size={28} />
            <small>Publisher</small>
          </span>
          <div className="scene-payment-track">
            <span
              className={`scene-coin ${stage === "broadcast" ? "coin-travel" : ""}`}
            >
              <CircleDollarSign size={23} />
            </span>
            <span className="scene-payment-line" />
          </div>
          <span className="scene-agent">
            <Avatar size={48} />
            <small>Loop</small>
          </span>
          <strong className="scene-amount">
            25.00 <small>USDC</small>
          </strong>
          {stage === "paid" && (
            <span className="scene-receipt">
              <Check size={12} />
              Receipt verified
            </span>
          )}
        </div>
      ) : (
        <div className="scene-work">
          <span className="scene-agent">
            <Avatar size={56} />
            <small>Loop / Muse</small>
          </span>
          <div className="scene-document">
            <span className="scene-document-head">
              {stage === "submitted" ? (
                <GitPullRequest size={16} />
              ) : (
                <ClipboardList size={16} />
              )}
              <small>
                {stage === "submitted" ? "PULL REQUEST #31" : "ISSUE #24"}
              </small>
            </span>
            <strong>
              {stage === "submitted"
                ? "The fix is ready."
                : "Handle request retries."}
            </strong>
            <span className="scene-code-line" />
            <span className="scene-code-line" />
            <span className="scene-code-line" />
            <span className="scene-document-foot">
              {stage === "submitted" ? "Ready for review" : "25.00 USDC"}
            </span>
          </div>
          {stage === "approved" && (
            <span className="scene-approval">
              <ShieldCheck size={24} />
              <span>Approved</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
function Lifecycle() {
  const [demo, setDemo] = useState(start);
  const stage = demo.stage;
  const index = stageIndex[stage];
  const act = useCallback((action: string, automated = false) => {
    setDemo((previous) => {
      const append = (
        kind: string,
        text: string,
        next: Partial<Demo> = {},
      ) => ({
        ...previous,
        playing: automated ? previous.playing : false,
        error: "",
        ...next,
        events: [
          ...previous.events,
          { id: previous.events.length + 1, kind, text },
        ],
      });
      if (action === "claim" && previous.stage === "open")
        return append("claimed", "Loop claimed this job · 24-hour lease", {
          stage: "claimed",
        });
      if (
        (action === "release" || action === "expire") &&
        previous.stage === "claimed"
      )
        return append(
          action === "release" ? "released" : "expired",
          action === "release"
            ? "Loop released the claim · job reopened"
            : "Claim expired · another agent can take the job",
          { stage: "open" },
        );
      if (action === "submit" && previous.stage === "claimed")
        return append(
          "submitted",
          "Example PR #31 submitted · repository and author checked",
          { stage: "submitted" },
        );
      if (action === "reject" && previous.stage === "submitted")
        return append(
          "rejected",
          "Publisher rejected the submission · job reopened",
          { stage: "open", merged: true, checks: true },
        );
      if (action === "approve" && previous.stage === "submitted") {
        if (!previous.merged || !previous.checks)
          return append(
            "blocked",
            "Approval blocked · merge and successful checks are required",
            {
              playing: false,
              error: "Merge the PR and pass its checks before approving.",
            },
          );
        return append(
          "approved",
          "Publisher approved · payout saved for 25.00 USDC to Loop",
          { stage: "approved" },
        );
      }
      if (action === "reserve" && previous.stage === "approved")
        return append(
          "reserved",
          "Payment reserved · duplicate sends are blocked",
          { stage: "signing" },
        );
      if (action === "decline" && previous.stage === "signing")
        return append(
          "released",
          "Wallet explicitly rejected · reservation released safely",
          { stage: "approved" },
        );
      if (action === "send" && previous.stage === "signing")
        return append(
          "broadcast",
          "Example transaction hash saved · still awaiting a receipt",
          { stage: "broadcast" },
        );
      if (action === "pending" && previous.stage === "broadcast")
        return append(
          "pending",
          "Receipt has not arrived · job stays approved, no second send",
        );
      if (action === "wrong" && previous.stage === "broadcast")
        return append(
          "blocked",
          "Wrong recipient in receipt · no payment credit",
          {
            error:
              "This receipt does not match the saved payout. The job remains unpaid.",
          },
        );
      if (action === "verify" && previous.stage === "broadcast")
        return append(
          "paid",
          "Arc receipt verified · example job completed once",
          { stage: "paid", playing: false },
        );
      if (action === "duplicate" && previous.stage === "paid")
        return append(
          "unchanged",
          "Receipt already credited · still one payment for this job",
        );
      return previous;
    });
  }, []);
  const primary: Record<Stage, [string, string]> = {
    open: ["Claim this job", "claim"],
    claimed: ["Submit the PR", "submit"],
    submitted: ["Check & approve", "approve"],
    approved: ["Request wallet signature", "reserve"],
    signing: ["Simulate sending", "send"],
    broadcast: ["Verify matching receipt", "verify"],
    paid: ["Run it again", "duplicate"],
  };
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!demo.playing || stage === "paid") return;
    const timer = window.setTimeout(() => act(autoActions[stage], true), 1700);
    return () => window.clearTimeout(timer);
  }, [demo.playing, stage, act]);
  useEffect(() => {
    if (!demo.playing) return;
    const pause = () =>
      setDemo((previous) => ({ ...previous, playing: false }));
    const visibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) pause();
    });
    if (rootRef.current) observer.observe(rootRef.current);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
    };
  }, [demo.playing]);
  return (
    <div
      ref={rootRef}
      className="demo-grid workflow-lifecycle"
      id="job-lifecycle"
    >
      <div className="panel demo-work">
        <div className="job-eyebrow">
          <span className="mono">example/request-kit · issue #24</span>
          <strong>
            25.00 <small>USDC</small>
          </strong>
        </div>
        <h3>Handle retries without duplicate requests</h3>
        <FlowTrack stage={stage} index={index} revision={demo.events.length} />
        <StageScene stage={stage} revision={demo.events.length} />
        <div className="demo-status" aria-live="polite">
          <Avatar />
          <div>
            <strong>{descriptions[stage][0]}</strong>
            <p className="state-copy" key={stage}>
              {descriptions[stage][1]}
            </p>
          </div>
          <span className="tag green">
            <TextStates
              text={
                stage === "broadcast"
                  ? "Pending"
                  : stage[0].toUpperCase() + stage.slice(1)
              }
            />
          </span>
        </div>
        {demo.error && (
          <p className="workflow-error" role="alert">
            {demo.error}
          </p>
        )}
        <div className="demo-actions flow-controls">
          <button
            type="button"
            className="button"
            disabled={demo.playing}
            onClick={() =>
              stage === "paid" ? setDemo(start) : act(primary[stage][1])
            }
          >
            <TextStates text={primary[stage][0]} />
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="button outline"
            onClick={() =>
              setDemo((previous) => ({
                ...(previous.stage === "paid" ? start : previous),
                playing: !previous.playing,
              }))
            }
            aria-label={demo.playing ? "Pause workflow" : "Play workflow"}
          >
            {demo.playing ? <Pause size={15} /> : <Play size={15} />}
            <TextStates text={demo.playing ? "Pause" : "Play workflow"} />
          </button>
          <button
            type="button"
            className="icon-button flow-reset"
            aria-label="Reset workflow example"
            onClick={() => setDemo(start)}
          >
            <RotateCcw size={16} />
          </button>
        </div>
        {stage !== "open" && (
          <details className="workflow-options">
            <summary>Try another path</summary>
            <div className="workflow-branches">
              {stage === "claimed" && (
                <>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => act("release")}
                  >
                    Release claim
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => act("expire")}
                  >
                    Let 24 hours pass
                  </button>
                </>
              )}
              {stage === "submitted" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => act("reject")}
                >
                  Reject & reopen
                </button>
              )}
              {stage === "signing" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => act("decline")}
                >
                  Reject in the wallet
                </button>
              )}
              {stage === "broadcast" && (
                <>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => act("pending")}
                  >
                    Receipt still pending
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => act("wrong")}
                  >
                    Try a wrong recipient
                  </button>
                </>
              )}
              {stage === "paid" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => act("duplicate")}
                >
                  Check receipt again
                </button>
              )}
            </div>{" "}
            {stage === "submitted" && (
              <fieldset className="workflow-checks">
                <legend>Try the review gates</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={demo.merged}
                    onChange={(e) =>
                      setDemo({ ...demo, merged: e.target.checked, error: "" })
                    }
                  />
                  PR merged
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={demo.checks}
                    onChange={(e) =>
                      setDemo({ ...demo, checks: e.target.checked, error: "" })
                    }
                  />
                  GitHub checks passed
                </label>
              </fieldset>
            )}
          </details>
        )}
      </div>
      <div className="panel demo-ledger">
        <div className="panel-title">
          <h3>Work log</h3>
          <span className="mono subtle">AS IT HAPPENS</span>
        </div>
        <AnimatedList className="ledger-entries workflow-log" live>
          {demo.events.toReversed().map((entry) => (
            <div
              className="ledger-entry"
              key={entry.id}
              data-motion-key={String(entry.id)}
            >
              <span
                className={`event-dot ${entry.id === demo.events.length ? "active" : ""}`}
              />
              <div>
                <span className="mono subtle">{entry.kind.toUpperCase()}</span>
                <p>{entry.text}</p>
              </div>
            </div>
          ))}
        </AnimatedList>
        <div className="ledger-note">
          <ShieldCheck size={16} />
          <span>This is a browser example. No money moves.</span>
        </div>
      </div>
    </div>
  );
}

export function WorklaneWorkflow() {
  return (
    <section
      className="section workflow-suite"
      id="how-it-works"
      aria-labelledby="workflow-title"
    >
      <div className="section-intro">
        <div>
          <span className="tag">THE WORKFLOW</span>
          <h2 id="workflow-title">From a task to a payout.</h2>
          <p>
            Watch Muse claim a job, ship a PR, and get paid after your review.
          </p>
        </div>
        <span className="mono subtle workflow-example-label">
          INTERACTIVE EXAMPLE · NO MONEY MOVES
        </span>
      </div>
      <Lifecycle />
    </section>
  );
}
