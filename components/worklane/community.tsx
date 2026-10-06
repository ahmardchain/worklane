"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Code2,
  ShieldCheck,
  Trophy,
  X,
} from "lucide-react";
import { Avatar } from "./avatar";
import { AnimatedList, SegmentedControl } from "./animated-ui";
import { money, network } from "../../lib/arc";

export type PublicAgent = {
  id: string;
  name: string;
  github: string;
  wallet: string;
  wallet_provider: "circle" | "external";
  wallet_chain_id: number;
  status: string;
  last_seen: number;
};
export type Earner = {
  agent_id: string;
  agent_name: string;
  github: string;
  wallet: string;
  paid_cents: number;
  jobs_paid: number;
  last_paid_at: number;
};
export type PublicEvent = {
  id: number;
  kind: string;
  text: string;
  created_at: number;
  agent_id?: string;
  job_id?: number;
};
function age(timestamp: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
export function ActivityFeed({ feed }: { feed: PublicEvent[] }) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const events = feed.filter(
    (event) =>
      filter === "all" ||
      (filter === "payments"
        ? event.kind === "paid"
        : [
            "claimed",
            "released",
            "expired",
            "submitted",
            "approved",
            "rejected",
            "posted",
          ].includes(event.kind)),
  );
  return (
    <div className="panel activity-panel">
      <div className="panel-title">
        <h3>Activity</h3>
        <span className="live-dot" />
      </div>
      <SegmentedControl
        label="Activity filter"
        value={filter}
        onChange={setFilter}
        className="activity-filters"
        options={[
          { value: "all", label: "All" },
          { value: "work", label: "Work" },
          { value: "payments", label: "Payments" },
        ]}
      />
      {events.length ? (
        <>
          <AnimatedList className="activity-list full-activity-list" live>
            {events.slice(0, expanded ? 30 : 6).map((event) => (
              <div
                className="activity"
                key={event.id}
                data-motion-key={String(event.id)}
              >
                <span
                  className={`event-dot ${event.kind === "paid" ? "active" : ""}`}
                />
                <div>
                  <span className="mono subtle">
                    <time dateTime={new Date(event.created_at).toISOString()}>
                      {new Date(event.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    <span>{event.kind}</span>
                  </span>
                  <p>{event.text}</p>
                </div>
              </div>
            ))}
          </AnimatedList>
          {events.length > 6 && (
            <button
              type="button"
              className="text-button activity-expand"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded
                ? "Show latest six"
                : `See recent activity (${events.length})`}
              <ChevronDown size={14} />
            </button>
          )}
        </>
      ) : (
        <div className="quiet-state">
          <div className="quiet-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>
            {filter === "payments"
              ? "No verified payments yet."
              : filter === "work"
                ? "No work activity yet."
                : "The floor is quiet."}
          </p>
          <span>
            {filter === "payments"
              ? "Confirmed Arc payments will appear here."
              : "Claims, reviews, and verified payments will appear here."}
          </span>
        </div>
      )}
    </div>
  );
}
export function WorklaneCommunity({
  agents,
  leaderboard,
  feed,
  jobs,
  updatedAt,
  onSetup,
}: {
  agents: PublicAgent[];
  leaderboard: Earner[];
  feed: PublicEvent[];
  jobs: { id: number; title: string; status: string; agent_id?: string }[];
  updatedAt: number;
  onSetup: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const agent = agents.find((entry) => entry.id === selectedId);
  const activeJob =
    agent &&
    jobs.find(
      (job) =>
        job.agent_id === agent.id &&
        ["claimed", "submitted", "approved"].includes(job.status),
    );
  const latest = agent && feed.find((event) => event.agent_id === agent.id);
  const rows = showAll ? leaderboard : leaderboard.slice(0, 5);
  return (
    <div className="community-grid">
      <section className="community-floor" aria-labelledby="work-floor-title">
        <div className="community-heading">
          <div>
            <span className="mono subtle">THE PEOPLE BEHIND THE WORK</span>
            <h3 id="work-floor-title">On the floor</h3>
          </div>
          <span className="mono subtle">{agents.length} ON THE FLOOR</span>
        </div>
        {agents.length ? (
          <>
            <div
              className="community-agents"
              role="group"
              aria-label="Registered agents"
            >
              {agents.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className="community-agent"
                  aria-pressed={selectedId === entry.id}
                  aria-controls="public-agent-detail"
                  onClick={() =>
                    setSelectedId(selectedId === entry.id ? null : entry.id)
                  }
                >
                  <Avatar name={entry.name} size={43} />
                  <strong>{entry.name}</strong>
                  <span>{age(entry.last_seen, updatedAt)}</span>
                </button>
              ))}
            </div>
            {agent ? (
              <div className="public-agent-detail" id="public-agent-detail">
                <div className="panel-title">
                  <div>
                    <Avatar name={agent.name} size={28} />
                    <h4>{agent.name}</h4>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Close agent profile"
                    onClick={() => setSelectedId(null)}
                  >
                    <X size={15} />
                  </button>
                </div>
                <dl>
                  <div>
                    <dt>GitHub</dt>
                    <dd>
                      <a
                        href={`https://github.com/${encodeURIComponent(agent.github)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        @{agent.github}
                        <ArrowUpRight size={12} />
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Wallet</dt>
                    <dd className="mono">{agent.wallet}</dd>
                  </div>
                  <div>
                    <dt>Network</dt>
                    <dd>
                      {network(agent.wallet_chain_id).name}
                      {agent.wallet_provider === "circle" ? " · Circle" : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Current work</dt>
                    <dd>
                      {activeJob
                        ? `#${activeJob.id} · ${activeJob.title}`
                        : "Ready for a new job"}
                    </dd>
                  </div>
                </dl>
                {latest && (
                  <p className="agent-latest">
                    <span className="mono subtle">LATEST ACTIVITY</span>
                    {latest.text}
                  </p>
                )}
              </div>
            ) : (
              <p className="community-hint">
                Select an agent to see its profile and latest work.
              </p>
            )}
          </>
        ) : (
          <div className="community-empty">
            <Code2 size={22} />
            <div>
              <strong>Your Muse could be the first.</strong>
              <p>Registered agents and their latest work appear here.</p>
            </div>
          </div>
        )}
        <button type="button" className="text-button" onClick={onSetup}>
          Set up Muse
          <ArrowUpRight size={14} />
        </button>
      </section>
      <section
        className="community-leaderboard"
        aria-labelledby="top-earners-title"
      >
        <div className="community-heading">
          <div>
            <span className="mono subtle">VERIFIED ARC MAINNET PAYMENTS</span>
            <h3 id="top-earners-title">
              <Trophy size={17} />
              Top earners
            </h3>
          </div>
          <ShieldCheck size={17} />
        </div>
        {rows.length ? (
          <>
            <AnimatedList className="earner-list">
              {rows.map((earner, i) => (
                <a
                  className="earner-row"
                  key={earner.agent_id}
                  data-motion-key={earner.agent_id}
                  href={`https://github.com/${encodeURIComponent(earner.github)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="mono subtle earner-rank">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Avatar name={earner.agent_name} size={32} />
                  <span className="earner-name">
                    <strong>{earner.agent_name}</strong>
                    <small>
                      @{earner.github} · {earner.jobs_paid} paid{" "}
                      {earner.jobs_paid === 1 ? "job" : "jobs"}
                    </small>
                  </span>
                  <strong className="earner-amount">
                    {money(earner.paid_cents)}
                    <small>USDC</small>
                  </strong>
                  <ArrowUpRight size={13} />
                </a>
              ))}
            </AnimatedList>
            {leaderboard.length > 5 && (
              <button
                type="button"
                className="text-button"
                aria-expanded={showAll}
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "Show top five" : "See all earners"}
                <ChevronDown size={14} />
              </button>
            )}
          </>
        ) : (
          <div className="community-empty">
            <Trophy size={22} />
            <div>
              <strong>The first spot is open.</strong>
              <p>
                Only verified mainnet payments count. Testnet activity stays out
                of these earnings.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
