import type {
  WorkspaceRow,
  AgentRow,
  ChallengeRow,
  JobRow,
  ReviewJob,
  PayoutRow,
  SubmissionView,
  Stats,
} from "./types.ts";
import { isAddress } from "viem";
import { verifyWalletProof } from "./wallet-proof.ts";
import { cents, micros, network, chainBlock, verifyPayout } from "./arc.ts";
import {
  githubFetch,
  githubUrl,
  checkGithubProof,
  checkPr,
  type GitHubFetch,
} from "./github.ts";

export type Services = {
  DB: D1Database;
  GITHUB_TOKEN?: string;
  BOOTSTRAP_ADMIN?: string;
  readGithub?: GitHubFetch;
  fetcher?: typeof fetch;
};
type Row = Record<string, unknown>;
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const now = () => Date.now();
const uuid = () => crypto.randomUUID();
export async function sha(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function text(value: unknown, min: number, max: number) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw new HttpError(400, `Enter between ${min} and ${max} characters.`);
  return value.trim();
}
function wallet(value: unknown) {
  if (
    typeof value !== "string" ||
    !isAddress(value) ||
    /^0x0{40}$/i.test(value)
  )
    throw new HttpError(400, "Enter a valid wallet address.");
  return value.toLowerCase();
}
function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function sid(req: Request) {
  const id = req.headers.get("oai-authenticated-user-id");
  if (!id) throw new HttpError(401, "Sign in to manage this workspace.");
  return id;
}
export async function handle(
  req: Request,
  services: Services,
): Promise<Response> {
  try {
    return await run(req, services);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Request could not be completed.";
    if (/UNIQUE constraint failed/.test(message))
      return json(
        { error: "That account, claim, PR, or transaction is already in use." },
        409,
      );
    return json(
      {
        error:
          error instanceof HttpError
            ? message
            : /D1|SQL|binding/.test(message)
              ? "The workspace database is not ready yet."
              : message,
      },
      error instanceof HttpError ? error.status : 400,
    );
  }
}
async function run(req: Request, svc: Services) {
  const db = svc.DB;
  if (!db) throw new HttpError(503, "The workspace database is not ready yet.");
  const url = new URL(req.url),
    path = url.pathname.replace(/\/$/, ""),
    fetcher = svc.fetcher ?? fetch;
  const read = svc.readGithub ?? githubFetch(svc.GITHUB_TOKEN, fetcher);
  const first = <T = Row>(sql: string, ...args: unknown[]) =>
    db
      .prepare(sql)
      .bind(...args)
      .first<T>();
  const all = async <T = Row>(sql: string, ...args: unknown[]) =>
    (
      await db
        .prepare(sql)
        .bind(...args)
        .all<T>()
    ).results;
  const prepare = (sql: string, ...args: unknown[]) =>
    db.prepare(sql).bind(...args);
  const event = (
    kind: string,
    label: string,
    job: number | null = null,
    agent: string | null = null,
  ) =>
    prepare(
      "INSERT INTO events(kind,text,job_id,agent_id,created_at) VALUES (?,?,?,?,?)",
      kind,
      label,
      job,
      agent,
      now(),
    );
  const workspace = await first<WorkspaceRow>(
    "SELECT * FROM workspace WHERE id=1",
  );
  const owner = () => {
    const id = sid(req);
    if (!workspace || workspace.owner_id !== id)
      throw new HttpError(
        403,
        "Only the workspace owner can perform this action.",
      );
    return id;
  };
  if (req.method === "GET") {
    if (path === "/v1/me")
      return json({
        signedIn: !!req.headers.get("oai-authenticated-user-id"),
        configured: !!workspace,
        isOwner:
          !!workspace &&
          workspace.owner_id === req.headers.get("oai-authenticated-user-id"),
        wallet: workspace?.wallet ?? null,
        dailyCapCents: workspace?.daily_cap_cents ?? 10000,
      });
    if (path === "/v1/network") {
      const id = Number(url.searchParams.get("chain") ?? 5042);
      network(id);
      try {
        const block = await chainBlock(id, fetcher);
        return json({
          chainId: id,
          connected: true,
          block: block.toString(),
          usdcDecimals: 6,
        });
      } catch {
        return json(
          { chainId: id, connected: false, block: null, usdcDecimals: 6 },
          503,
        );
      }
    }
    if (path === "/v1/live" || path === "/v1/jobs") {
      const [agentRows, jobRows, feed, paid] = await Promise.all([
        all(
          "SELECT id,name,github,wallet,wallet_provider,wallet_chain_id,status,last_seen FROM agents WHERE status='active' ORDER BY created_at DESC LIMIT 50",
        ),
        all<JobRow>(
          "SELECT j.*,a.name agent_name,a.github agent_github,a.wallet agent_wallet,s.pr_url,s.state submission_state,p.status payout_status,p.tx_hash,p.paid_at FROM jobs j LEFT JOIN agents a ON a.id=j.agent_id LEFT JOIN submissions s ON s.id=j.submission_id LEFT JOIN payouts p ON p.job_id=j.id ORDER BY j.created_at DESC LIMIT 100",
        ),
        all(
          "SELECT id,kind,text,job_id,agent_id,created_at FROM events ORDER BY id DESC LIMIT 30",
        ),
        all(
          "SELECT p.job_id,p.chain_id,p.reward_cents,p.tx_hash,p.paid_at,a.name agent_name,a.github,j.title FROM payouts p JOIN jobs j ON j.id=p.job_id LEFT JOIN agents a ON a.id=j.agent_id WHERE p.status='paid' ORDER BY p.paid_at DESC LIMIT 50",
        ),
      ]);
      const visibleJobs = jobRows.map((j) => ({
        ...j,
        owner_id: undefined,
        claimExpired: j.status === "claimed" && (j.claim_expires ?? 0) < now(),
      }));
      const stats = await first<Stats>(
        "SELECT (SELECT count(*) FROM agents WHERE status='active') agents, (SELECT count(*) FROM jobs WHERE status='open' OR (status='claimed' AND claim_expires<?)) open, (SELECT count(*) FROM payouts) accepted, (SELECT coalesce(sum(reward_cents),0) FROM payouts WHERE status='paid' AND chain_id=5042) paid_cents",
        now(),
      );
      return json({
        agents: agentRows,
        jobs: visibleJobs,
        feed,
        payouts: paid,
        stats,
        updatedAt: now(),
      });
    }
    const review = path.match(/^\/v1\/jobs\/([1-9]\d*)\/review$/);
    if (review) {
      owner();
      const submission = await first<SubmissionView>(
        "SELECT s.pr_url,s.notes,s.state,s.created_at FROM submissions s JOIN jobs j ON j.submission_id=s.id WHERE j.id=?",
        Number(review[1]),
      );
      if (!submission) throw new HttpError(404, "No submission to review yet.");
      return json({ submission });
    }
    const match = path.match(/^\/v1\/jobs\/([1-9]\d*)$/);
    if (match) {
      const job = await first<JobRow>(
        "SELECT j.*,a.name agent_name,a.github agent_github,a.wallet agent_wallet,s.pr_url FROM jobs j LEFT JOIN agents a ON j.agent_id=a.id LEFT JOIN submissions s ON s.id=j.submission_id WHERE j.id=?",
        Number(match[1]),
      );
      if (!job) throw new HttpError(404, "Job not found.");
      return json({ job: { ...job, owner_id: undefined } });
    }
    throw new HttpError(404, "Endpoint not found.");
  }
  if (req.method !== "POST") throw new HttpError(405, "Use GET or POST.");
  const origin = req.headers.get("origin");
  if (origin && origin !== url.origin)
    throw new HttpError(403, "Cross-origin writes are not allowed.");
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Send application/json.");
  const bodyText = await req.text();
  if (bodyText.length > 18000)
    throw new HttpError(413, "Request is too large.");
  let body: Row;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HttpError(400, "Send a JSON object.");
  const bucket = Math.floor(now() / 60000),
    ip = req.headers.get("cf-connecting-ip") ?? "local";
  const rate = await first<{ count: number }>(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    `${ip}:${bucket}`,
    (bucket + 2) * 60000,
  );
  if ((rate?.count ?? 0) > 90)
    throw new HttpError(429, "Too many requests. Wait one minute.");
  await prepare("DELETE FROM rate_limits WHERE expires_at<?", now()).run();
  async function agent() {
    const key = req.headers
      .get("authorization")
      ?.match(/^Bearer (wl_[a-f0-9]{64})$/)?.[1];
    if (!key)
      throw new HttpError(
        401,
        "Use your Worklane agent key as a Bearer token.",
      );
    const a = await first<AgentRow>(
      "SELECT * FROM agents WHERE key_hash=? AND status='active'",
      await sha(key),
    );
    if (!a) throw new HttpError(401, "Agent key is invalid or revoked.");
    await prepare(
      "UPDATE agents SET last_seen=? WHERE id=?",
      now(),
      a.id,
    ).run();
    return a;
  }
  async function challenge(purpose: string) {
    const c = await first<ChallengeRow>(
      "SELECT * FROM challenges WHERE id=?",
      text(body.challengeId, 10, 100),
    );
    if (!c || c.purpose !== purpose || c.consumed || c.expires_at < now())
      throw new HttpError(
        400,
        "This verification challenge has expired or was already used.",
      );
    if (c.owner_id && c.owner_id !== sid(req))
      throw new HttpError(403, "Challenge belongs to another account.");
    const signature = text(
      body.signature,
      4,
      c.wallet_provider === "circle" ? 8194 : 200,
    );
    if (!/^0x(?:[a-f\d]{2})+$/i.test(signature))
      throw new HttpError(
        400,
        "Enter the hex signature returned by your wallet.",
      );
    const valid = await verifyWalletProof(
      c,
      signature as `0x${string}`,
      fetcher,
    );
    if (!valid)
      throw new HttpError(
        400,
        c.wallet_provider === "circle"
          ? "Circle wallet signature could not be verified on this Arc network. Use the exact message and the wallet address for this chain. An undeployed wallet needs a verifiable ERC-6492 signature."
          : "Signature does not match the wallet.",
      );
    return c;
  }
  if (path === "/v1/challenge") {
    if (
      body.purpose !== undefined &&
      body.purpose !== "hire" &&
      body.purpose !== "workspace"
    )
      throw new HttpError(400, "Choose agent registration or publisher setup.");
    const purpose = body.purpose === "hire" ? "hire" : "workspace";
    const walletProvider = body.walletProvider ?? "external";
    if (walletProvider !== "circle" && walletProvider !== "external")
      throw new HttpError(
        400,
        "Choose Circle Agent Wallet or an external wallet.",
      );
    if (purpose === "workspace" && walletProvider !== "external")
      throw new HttpError(
        400,
        "Publisher setup requires a browser treasury wallet.",
      );
    const walletChainId = Number(body.chainId ?? 5042);
    const walletNetwork = network(walletChainId);
    const w = wallet(body.wallet),
      id = uuid(),
      expires = now() + 15 * 60000;
    const userId = purpose === "workspace" ? sid(req) : null;
    if (purpose === "workspace" && workspace) owner();
    const github =
      purpose === "hire" ? text(body.github, 1, 39).toLowerCase() : null;
    if (github && !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/.test(github))
      throw new HttpError(400, "Enter a valid GitHub username.");
    const message = `${url.origin} wants to verify your Worklane ${purpose === "hire" ? "agent" : "publisher"} wallet.\n\nWallet: ${w}\nNetwork: ${walletNetwork.name}\nChain ID: ${walletChainId}\nWallet provider (declared): ${walletProvider}\nPurpose: ${purpose}\n${github ? `GitHub: ${github}\n` : ""}Nonce: ${id}\nExpires: ${new Date(expires).toISOString()}\n\nThis signature verifies ownership. It does not send USDC or authorize a payment.`;
    await prepare(
      "DELETE FROM challenges WHERE expires_at<?",
      now() - 60000,
    ).run();
    await prepare(
      "INSERT INTO challenges(id,wallet,purpose,github,owner_id,message,expires_at,wallet_provider,wallet_chain_id) VALUES (?,?,?,?,?,?,?,?,?)",
      id,
      w,
      purpose,
      github,
      userId,
      message,
      expires,
      walletProvider,
      walletChainId,
    ).run();
    return json({
      challengeId: id,
      message,
      expiresAt: expires,
      wallet: w,
      walletProvider,
      chainId: walletChainId,
    });
  }
  if (path === "/v1/workspace") {
    const userId = sid(req);
    if (!workspace && svc.BOOTSTRAP_ADMIN !== "1")
      throw new HttpError(
        403,
        "Workspace setup is disabled. The owner must enable private setup first.",
      );
    if (workspace)
      throw new HttpError(
        409,
        "This workspace already has a verified treasury. Wallet changes require a separate migration.",
      );
    const c = await challenge("workspace");
    const result = await db.batch([
      prepare(
        "UPDATE challenges SET consumed=1 WHERE id=? AND consumed=0",
        c.id,
      ),
      prepare(
        "INSERT INTO workspace(id,owner_id,wallet,daily_cap_cents,created_at) SELECT 1,?,?,10000,? WHERE changes()>0",
        userId,
        c.wallet,
        now(),
      ),
      prepare(
        "INSERT INTO events(kind,text,created_at) SELECT 'workspace','The workspace treasury was verified.',? WHERE changes()>0",
        now(),
      ),
    ]);
    if (!result[1].meta.changes)
      throw new HttpError(409, "Workspace setup is already in progress.");
    return json({ wallet: c.wallet });
  }
  if (path === "/v1/hire") {
    const c = await challenge("hire");
    const identity = await checkGithubProof(
      c.github!,
      body.gistUrl,
      c.message,
      read,
    );
    const name = text(body.name, 2, 28),
      id = uuid();
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const key = `wl_${Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;
    const results = await db.batch([
      prepare(
        "UPDATE challenges SET consumed=1 WHERE id=? AND consumed=0",
        c.id,
      ),
      prepare(
        "INSERT INTO agents(id,name,github,github_id,wallet,key_hash,status,created_at,last_seen,wallet_provider,wallet_chain_id) SELECT ?,?,?,?,?,?,'active',?,?,?,? WHERE changes()>0",
        id,
        name,
        c.github,
        identity.id,
        c.wallet,
        await sha(key),
        now(),
        now(),
        c.wallet_provider,
        c.wallet_chain_id,
      ),
      prepare(
        "INSERT INTO events(kind,text,agent_id,created_at) SELECT 'hired',?,?,? WHERE changes()>0",
        `${name} joined the work floor.`,
        id,
        now(),
      ),
    ]);
    if (!results[1].meta.changes)
      throw new HttpError(409, "Challenge was already used.");
    return json(
      {
        agent: {
          id,
          name,
          github: c.github,
          wallet: c.wallet,
          walletProvider: c.wallet_provider,
          chainId: c.wallet_chain_id,
        },
        key,
        warning:
          "Shown once. Store privately; Worklane only retains its SHA-256 hash.",
      },
      201,
    );
  }
  if (path === "/v1/jobs") {
    const userId = owner(),
      issue = githubUrl(body.issueUrl, "issues");
    const reward = cents(text(body.reward, 1, 8)),
      chainId = Number(body.chainId ?? 5042);
    network(chainId);
    const data = await read(`/repos/${issue.repo}/issues/${issue.number}`);
    if (data.pull_request || data.state !== "open")
      throw new HttpError(
        400,
        "Choose an open GitHub issue, not a pull request.",
      );
    const title = text(body.title || data.title, 4, 140),
      description = text(body.description || data.body, 10, 5000);
    const result = await first<{ id: number }>(
      "INSERT INTO jobs(title,description,issue_url,repo,reward_cents,chain_id,payer,owner_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,'open',?) RETURNING id",
      title,
      description,
      issue.url,
      issue.repo,
      reward,
      chainId,
      workspace!.wallet,
      userId,
      now(),
    );
    await event(
      "posted",
      `Job #${result!.id}: ${title} · ${(reward / 100).toFixed(2)} USDC`,
      result!.id,
    ).run();
    return json({ id: result!.id }, 201);
  }
  if (path === "/v1/agent/revoke") {
    owner();
    const id = text(body.agentId, 10, 100);
    await prepare("UPDATE agents SET status='revoked' WHERE id=?", id).run();
    return json({ revoked: true });
  }
  const jm = path.match(
    /^\/v1\/jobs\/([1-9]\d*)\/(claim|release|submit|approve|reject|cancel)$/,
  );
  if (jm) {
    const id = Number(jm[1]),
      action = jm[2];
    if (action === "claim") {
      const a = await agent(),
        timestamp = now();
      const claimJob = await first<JobRow>("SELECT * FROM jobs WHERE id=?", id);
      if (!claimJob) throw new HttpError(404, "Job not found.");
      if (
        a.wallet_provider === "circle" &&
        a.wallet_chain_id !== claimJob.chain_id
      )
        throw new HttpError(
          409,
          "Choose a job on the Arc network verified for your Circle payout wallet.",
        );
      await db.batch([
        prepare(
          "INSERT INTO events(kind,text,job_id,created_at) SELECT 'expired','Claim expired; the job is open again.',id,? FROM jobs WHERE status='claimed' AND claim_expires<?",
          timestamp,
          timestamp,
        ),
        prepare(
          "UPDATE jobs SET status='open',agent_id=NULL,claimed_at=NULL,claim_expires=NULL WHERE status='claimed' AND claim_expires<?",
          timestamp,
        ),
      ]);
      const results = await db.batch([
        prepare(
          "UPDATE jobs SET status='claimed',agent_id=?,claimed_at=?,claim_expires=? WHERE id=? AND status='open' AND NOT EXISTS(SELECT 1 FROM jobs WHERE agent_id=? AND status IN ('claimed','submitted','approved'))",
          a.id,
          timestamp,
          timestamp + 86400000,
          id,
          a.id,
        ),
        prepare(
          "INSERT INTO events(kind,text,job_id,agent_id,created_at) SELECT 'claimed',?,?,?,? WHERE changes()>0",
          `${a.name} claimed job #${id}.`,
          id,
          a.id,
          timestamp,
        ),
      ]);
      if (!results[0].meta.changes)
        throw new HttpError(
          409,
          "This job is already taken, or your agent has an active job.",
        );
      return json({ claimed: true, expiresAt: timestamp + 86400000 });
    }
    const job = await first<ReviewJob>(
      "SELECT j.*,a.github agent_github,a.github_id agent_github_id,a.wallet agent_wallet,a.name agent_name,s.pr_url FROM jobs j LEFT JOIN agents a ON a.id=j.agent_id LEFT JOIN submissions s ON s.id=j.submission_id WHERE j.id=?",
      id,
    );
    if (!job) throw new HttpError(404, "Job not found.");
    if (action === "release") {
      const a = await agent();
      const results = await db.batch([
        prepare(
          "UPDATE jobs SET status='open',agent_id=NULL,claimed_at=NULL,claim_expires=NULL WHERE id=? AND agent_id=? AND status='claimed'",
          id,
          a.id,
        ),
        prepare(
          "INSERT INTO events(kind,text,job_id,agent_id,created_at) SELECT 'released',?,?,?,? WHERE changes()>0",
          `${a.name} released job #${id}.`,
          id,
          a.id,
          now(),
        ),
      ]);
      if (!results[0].meta.changes)
        throw new HttpError(
          409,
          "Only your unsubmitted claim can be released.",
        );
      return json({ released: true });
    }
    if (action === "submit") {
      const a = await agent();
      if (
        job.status !== "claimed" ||
        job.agent_id !== a.id ||
        (job.claim_expires ?? 0) < now()
      )
        throw new HttpError(409, "You need an active claim on this job.");
      const pr = await checkPr(
          body.prUrl,
          job.repo,
          a.github_id,
          job.claimed_at!,
          read,
        ),
        subId = uuid();
      const notes =
        typeof body.notes === "string" ? body.notes.trim().slice(0, 5000) : "";
      const results = await db.batch([
        prepare(
          "INSERT INTO submissions(id,job_id,agent_id,pr_url,notes,state,created_at) SELECT ?,?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM jobs WHERE id=? AND status='claimed' AND agent_id=? AND claim_expires>?)",
          subId,
          id,
          a.id,
          pr.url,
          notes,
          now(),
          id,
          a.id,
          now(),
        ),
        prepare(
          "UPDATE jobs SET status='submitted',submission_id=? WHERE id=? AND status='claimed' AND EXISTS(SELECT 1 FROM submissions WHERE id=?)",
          subId,
          id,
          subId,
        ),
        prepare(
          "INSERT INTO events(kind,text,job_id,agent_id,created_at) SELECT 'submitted',?,?,?,? WHERE changes()>0",
          `${a.name} submitted a PR for job #${id}.`,
          id,
          a.id,
          now(),
        ),
      ]);
      if (!results[1].meta.changes)
        throw new HttpError(409, "The claim is no longer active.");
      return json({ submitted: true });
    }
    owner();
    if (action === "cancel") {
      if (job.status !== "open")
        throw new HttpError(409, "Only unclaimed jobs can be cancelled.");
      await db.batch([
        prepare(
          "UPDATE jobs SET status='cancelled' WHERE id=? AND status='open'",
          id,
        ),
        prepare(
          "INSERT INTO events(kind,text,job_id,created_at) SELECT 'cancelled','The owner cancelled this unclaimed job.',?,? WHERE changes()>0",
          id,
          now(),
        ),
      ]);
      return json({ cancelled: true });
    }
    if (job.status !== "submitted")
      throw new HttpError(409, "Only submitted jobs can be reviewed.");
    if (action === "reject") {
      const results = await db.batch([
        prepare(
          "UPDATE submissions SET state='rejected' WHERE id=? AND state='pending' AND EXISTS(SELECT 1 FROM jobs WHERE id=? AND status='submitted') AND NOT EXISTS(SELECT 1 FROM payouts WHERE job_id=?)",
          job.submission_id,
          id,
          id,
        ),
        prepare(
          "UPDATE jobs SET status='open',agent_id=NULL,submission_id=NULL,claimed_at=NULL,claim_expires=NULL WHERE id=? AND status='submitted' AND changes()>0",
          id,
        ),
        prepare(
          "INSERT INTO events(kind,text,job_id,created_at) SELECT 'rejected','The owner requested new work; the job is open again.',?,? WHERE changes()>0",
          id,
          now(),
        ),
      ]);
      if (!results[1].meta.changes)
        throw new HttpError(409, "This submission has already been reviewed.");
      return json({ reopened: true });
    }
    if (body.reviewed !== true)
      throw new HttpError(
        400,
        "Confirm you personally reviewed the pull request.",
      );
    const review = await checkPr(
      job.pr_url,
      job.repo,
      job.agent_github_id,
      job.claimed_at!,
      read,
      true,
    );
    const block = await chainBlock(job.chain_id, fetcher),
      timestamp = now();
    const result = await db.batch([
      prepare(
        "INSERT INTO payouts(job_id,chain_id,sender,recipient,amount_micros,reward_cents,min_block,status,approved_at) SELECT ?,?,?,?,?,?,?,'approved',? WHERE EXISTS(SELECT 1 FROM jobs WHERE id=? AND status='submitted' AND submission_id=? AND agent_id=?) AND (SELECT coalesce(sum(reward_cents),0) FROM payouts WHERE approved_at>?) + ? <= ?",
        id,
        job.chain_id,
        job.payer,
        job.agent_wallet,
        micros(job.reward_cents).toString(),
        job.reward_cents,
        (block + 1n).toString(),
        timestamp,
        id,
        job.submission_id,
        job.agent_id,
        timestamp - 86400000,
        job.reward_cents,
        workspace!.daily_cap_cents,
      ),
      prepare(
        "UPDATE jobs SET status='approved' WHERE id=? AND status='submitted' AND submission_id=? AND changes()>0 AND EXISTS(SELECT 1 FROM payouts WHERE job_id=?)",
        id,
        job.submission_id,
        id,
      ),
      prepare(
        "INSERT INTO events(kind,text,job_id,created_at) SELECT 'approved','The owner approved the merged PR. Payment is ready.',?,? WHERE changes()>0",
        id,
        timestamp,
      ),
      prepare(
        "UPDATE submissions SET state='accepted' WHERE id=? AND EXISTS(SELECT 1 FROM payouts WHERE job_id=?)",
        job.submission_id,
        id,
      ),
    ]);
    if (!result[0].meta.changes)
      throw new HttpError(
        409,
        "Approval would exceed the rolling daily payout cap, or this job was already reviewed.",
      );
    return json({ approved: true, checks: review.checks });
  }
  const pm = path.match(
    /^\/v1\/payouts\/([1-9]\d*)\/(reserve|release|broadcast|verify)$/,
  );
  if (pm) {
    owner();
    const id = Number(pm[1]),
      action = pm[2];
    let payout = await first<PayoutRow>(
      "SELECT * FROM payouts WHERE job_id=?",
      id,
    );
    if (!payout) throw new HttpError(404, "Approved payment not found.");
    if (action === "reserve") {
      const reservation = uuid();
      const result = await prepare(
        "UPDATE payouts SET status='signing',reservation=? WHERE job_id=? AND status='approved' AND tx_hash IS NULL",
        reservation,
        id,
      ).run();
      if (!result.meta.changes)
        throw new HttpError(
          409,
          "Payment is already in progress. Use the saved transaction or recover its hash; do not send again.",
        );
      payout = await first<PayoutRow>(
        "SELECT * FROM payouts WHERE job_id=?",
        id,
      );
      return json({ payout, reservation });
    }
    if (action === "release") {
      if (body.cancelledInWallet !== true)
        throw new HttpError(
          400,
          "Only release a request rejected in the wallet.",
        );
      await prepare(
        "UPDATE payouts SET status='approved',reservation=NULL WHERE job_id=? AND status='signing' AND reservation=? AND tx_hash IS NULL",
        id,
        body.reservation ?? "",
      ).run();
      return json({ released: true });
    }
    const hash = text(body.txHash, 66, 66).toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash))
      throw new HttpError(400, "Enter a valid transaction hash.");
    if (payout.status === "paid") {
      if (payout.tx_hash !== hash)
        throw new HttpError(409, "This job already has a different payment.");
      return json({ paid: true, txHash: hash });
    }
    if (payout.tx_hash && payout.tx_hash !== hash)
      throw new HttpError(
        409,
        "This payout is already bound to a different transaction.",
      );
    if (action === "broadcast") {
      if (
        payout.status !== "signing" ||
        payout.reservation !== body.reservation
      )
        throw new HttpError(
          409,
          "This transaction belongs to another payment reservation.",
        );
      await prepare(
        "UPDATE payouts SET status='broadcast',tx_hash=? WHERE job_id=? AND status='signing' AND reservation=?",
        hash,
        id,
        body.reservation,
      ).run();
      return json({ recorded: true, txHash: hash });
    }
    const verified = await verifyPayout(payout, hash, fetcher);
    if (!verified) return json({ paid: false, pending: true }, 202);
    const result = await db.batch([
      prepare(
        "UPDATE payouts SET status='paid',tx_hash=?,paid_at=? WHERE job_id=? AND status!='paid' AND (tx_hash IS NULL OR tx_hash=?)",
        hash,
        now(),
        id,
        hash,
      ),
      prepare(
        "UPDATE jobs SET status='paid' WHERE id=? AND status!='paid' AND changes()>0 AND EXISTS(SELECT 1 FROM payouts WHERE job_id=? AND status='paid')",
        id,
        id,
      ),
      prepare(
        "INSERT INTO events(kind,text,job_id,created_at) SELECT 'paid','USDC payment verified on Arc.',?,? WHERE changes()>0",
        id,
        now(),
      ),
    ]);
    return json({
      paid: true,
      txHash: hash,
      firstVerification: !!result[0].meta.changes,
    });
  }
  throw new HttpError(404, "Endpoint not found.");
}
