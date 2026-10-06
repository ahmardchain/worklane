import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const workspace = sqliteTable("workspace", {
  id: integer("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  wallet: text("wallet").notNull(),
  dailyCapCents: integer("daily_cap_cents").notNull().default(10000),
  createdAt: integer("created_at").notNull(),
});
export const challenges = sqliteTable("challenges", {
  id: text("id").primaryKey(),
  wallet: text("wallet").notNull(),
  purpose: text("purpose").notNull(),
  walletProvider: text("wallet_provider").notNull().default("external"),
  walletChainId: integer("wallet_chain_id").notNull().default(5042),
  github: text("github"),
  ownerId: text("owner_id"),
  message: text("message").notNull(),
  expiresAt: integer("expires_at").notNull(),
  consumed: integer("consumed").notNull().default(0),
  publisherNonceHash: text("publisher_nonce_hash"),
});
export const publisherSessions = sqliteTable("publisher_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  ownerId: text("owner_id").notNull(),
  wallet: text("wallet").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    github: text("github").notNull(),
    githubId: integer("github_id").notNull(),
    wallet: text("wallet").notNull(),
    walletProvider: text("wallet_provider").notNull().default("external"),
    walletChainId: integer("wallet_chain_id").notNull().default(5042),
    keyHash: text("key_hash").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    lastSeen: integer("last_seen").notNull(),
  },
  (t) => [
    uniqueIndex("agents_github").on(t.github),
    uniqueIndex("agents_github_id").on(t.githubId),
    uniqueIndex("agents_key_hash").on(t.keyHash),
  ],
);
export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    issueUrl: text("issue_url").notNull(),
    repo: text("repo").notNull(),
    rewardCents: integer("reward_cents").notNull(),
    chainId: integer("chain_id").notNull(),
    payer: text("payer").notNull(),
    ownerId: text("owner_id").notNull(),
    status: text("status").notNull().default("open"),
    agentId: text("agent_id").references(() => agents.id),
    claimedAt: integer("claimed_at"),
    claimExpires: integer("claim_expires"),
    submissionId: text("submission_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("one_active_job_per_agent")
      .on(t.agentId)
      .where(sql`status IN ('claimed','submitted','approved')`),
    index("jobs_status").on(t.status),
  ],
);
export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    prUrl: text("pr_url").notNull(),
    notes: text("notes").notNull(),
    state: text("state").notNull().default("pending"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("one_use_per_pr").on(t.prUrl)],
);
export const payouts = sqliteTable(
  "payouts",
  {
    jobId: integer("job_id")
      .primaryKey()
      .references(() => jobs.id),
    chainId: integer("chain_id").notNull(),
    sender: text("sender").notNull(),
    recipient: text("recipient").notNull(),
    amountMicros: text("amount_micros").notNull(),
    rewardCents: integer("reward_cents").notNull(),
    minBlock: text("min_block").notNull(),
    status: text("status").notNull().default("approved"),
    reservation: text("reservation"),
    txHash: text("tx_hash"),
    approvedAt: integer("approved_at").notNull(),
    paidAt: integer("paid_at"),
  },
  (t) => [uniqueIndex("one_use_per_transaction").on(t.chainId, t.txHash)],
);
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  jobId: integer("job_id"),
  agentId: text("agent_id"),
  createdAt: integer("created_at").notNull(),
});
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
