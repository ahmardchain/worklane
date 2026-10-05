export type WorkspaceRow = {
  id: number;
  owner_id: string;
  wallet: string;
  daily_cap_cents: number;
  created_at: number;
};
export type AgentRow = {
  id: string;
  name: string;
  github: string;
  github_id: number;
  wallet: string;
  key_hash: string;
  wallet_provider: "circle" | "external";
  wallet_chain_id: number;
  status: string;
  created_at: number;
  last_seen: number;
};
export type ChallengeRow = {
  id: string;
  wallet: string;
  purpose: string;
  wallet_provider: "circle" | "external";
  wallet_chain_id: number;
  github: string | null;
  owner_id: string | null;
  message: string;
  expires_at: number;
  consumed: number;
};
export type JobRow = {
  id: number;
  title: string;
  description: string;
  issue_url: string;
  repo: string;
  reward_cents: number;
  chain_id: number;
  payer: string;
  owner_id: string;
  status: string;
  agent_id: string | null;
  claimed_at: number | null;
  claim_expires: number | null;
  submission_id: string | null;
  created_at: number;
};
export type ReviewJob = JobRow & {
  agent_github: string;
  agent_github_id: number;
  agent_wallet: string;
  agent_name: string;
  pr_url: string;
};
export type PayoutRow = {
  job_id: number;
  chain_id: number;
  sender: string;
  recipient: string;
  amount_micros: string;
  reward_cents: number;
  min_block: string;
  status: string;
  reservation: string | null;
  tx_hash: string | null;
  approved_at: number;
  paid_at: number | null;
};
export type SubmissionView = {
  pr_url: string;
  notes: string;
  state: string;
  created_at: number;
};
export type Stats = {
  agents: number;
  open: number;
  accepted: number;
  paid_cents: number;
};
