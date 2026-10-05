/* eslint-disable @typescript-eslint/no-explicit-any -- Fixtures intentionally model partial and invalid third-party JSON. */
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { RpcLog } from "../lib/arc.ts";
import { USDC, USDC_ABI, transferData, type PayoutProof } from "../lib/arc.ts";
import { handle, sha, type Services } from "../lib/service.ts";

// Disposable, deterministic test identities. Never used by the deployed app.
export const ownerAccount = privateKeyToAccount(`0x${"11".repeat(32)}`);
export const workerAccount = privateKeyToAccount(`0x${"22".repeat(32)}`);
export const payer = ownerAccount.address.toLowerCase();
export const recipient = workerAccount.address.toLowerCase();
export const hash = `0x${"aa".repeat(32)}`;
export const agentKey = `wl_${"ab".repeat(32)}`;
export const ownerId = "test-owner";

export function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(new URL("../drizzle", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"),
    );
  }
  class Statement {
    sql: string;
    args: any[] = [];
    constructor(sql: string) {
      this.sql = sql;
    }
    bind(...args: any[]) {
      this.args = args;
      return this;
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.args) ?? null;
    }
    async all() {
      return {
        results: sqlite.prepare(this.sql).all(...this.args),
        success: true,
      };
    }
    async run() {
      return execute(this);
    }
  }
  function execute(s: Statement) {
    const result = sqlite.prepare(s.sql).run(...s.args);
    return {
      results: [],
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
  const adapter = {
    prepare(sql: string) {
      return new Statement(sql);
    },
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(execute);
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, DB: adapter as unknown as D1Database };
}

export function proofFixture(
  p: PayoutProof = {
    chain_id: 5042,
    sender: payer,
    recipient,
    amount_micros: "25000000",
    min_block: "101",
  },
  h = hash,
) {
  const topics = encodeEventTopics({
    abi: USDC_ABI,
    eventName: "Transfer",
    args: { from: p.sender as `0x${string}`, to: p.recipient as `0x${string}` },
  });
  const data = encodeAbiParameters(
    [{ type: "uint256" }],
    [BigInt(p.amount_micros)],
  );
  return {
    receipt: {
      transactionHash: h,
      status: "0x1",
      blockNumber: "0x66",
      logs: [{ address: USDC, topics: topics as RpcLog["topics"], data }],
    },
    transaction: {
      hash: h,
      from: p.sender,
      to: USDC,
      input: transferData(p.recipient as `0x${string}`, p.amount_micros),
    },
  };
}
export function rpcFixture(
  options: {
    chain?: number;
    block?: string;
    receipt?: any;
    transaction?: any;
  } = {},
): typeof fetch {
  const fixture = proofFixture();
  return (async (_url: unknown, init: RequestInit) => {
    const { method } = JSON.parse(init.body as string);
    const values: Record<string, any> = {
      eth_chainId: `0x${(options.chain ?? 5042).toString(16)}`,
      eth_blockNumber: options.block ?? "0x64",
      eth_getTransactionReceipt:
        "receipt" in options ? options.receipt : fixture.receipt,
      eth_getTransactionByHash: options.transaction ?? fixture.transaction,
    };
    if (!(method in values))
      throw new Error(`Unexpected test RPC method: ${method}`);
    return Response.json({ jsonrpc: "2.0", id: 1, result: values[method] });
  }) as typeof fetch;
}
export function githubFixture(overrides: Record<string, any> = {}) {
  return async (path: string) => {
    if (path in overrides) return structuredClone(overrides[path]);
    if (/\/issues\/\d+$/.test(path))
      return {
        state: "open",
        title: "Fix request retries",
        body: "Add idempotency and test retry behavior.",
      };
    if (/\/pulls\/\d+$/.test(path))
      return {
        user: { id: 22, login: "worker" },
        base: { repo: { full_name: "owner/repo" } },
        head: { sha: "c0ffee" },
        created_at: new Date(Date.now() + 1000).toISOString(),
        state: "closed",
        merged: true,
      };
    if (path.endsWith("/status"))
      return { state: "success", statuses: [{ state: "success" }] };
    if (path.includes("/check-runs"))
      return {
        total_count: 1,
        check_runs: [{ status: "completed", conclusion: "success" }],
      };
    throw new Error(`Unexpected test GitHub path: ${path}`);
  };
}
export async function fixture(
  config: {
    workspace?: boolean;
    github?: Record<string, any>;
    rpc?: Parameters<typeof rpcFixture>[0];
  } = {},
) {
  const db = database();
  if (config.workspace !== false)
    db.sqlite
      .prepare("INSERT INTO workspace VALUES (1,?,?,10000,?)")
      .run(ownerId, payer, Date.now());
  db.sqlite
    .prepare(
      "INSERT INTO agents(id,name,github,github_id,wallet,key_hash,created_at,last_seen) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run(
      "test-agent-22",
      "Loop",
      "worker",
      22,
      recipient,
      await sha(agentKey),
      Date.now(),
      Date.now(),
    );
  const services: Services = {
    DB: db.DB,
    BOOTSTRAP_ADMIN: "1",
    readGithub: githubFixture(config.github),
    fetcher: rpcFixture(config.rpc),
  };
  async function call(
    path: string,
    body?: any,
    auth: "owner" | "agent" | "other" | "none" | `wl_${string}` = "none",
  ) {
    const headers: Record<string, string> = { "cf-connecting-ip": "127.0.0.1" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (auth === "owner" || auth === "other")
      headers["oai-authenticated-user-id"] =
        auth === "owner" ? ownerId : "someone-else";
    if (auth === "agent") headers.authorization = `Bearer ${agentKey}`;
    if (auth.startsWith("wl_")) headers.authorization = `Bearer ${auth}`;
    const response = await handle(
      new Request(`https://worklane.test/v1${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      services,
    );
    return { status: response.status, data: (await response.json()) as any };
  }
  async function postJob(reward = "25.00") {
    const result = await call(
      "/jobs",
      { issueUrl: "https://github.com/owner/repo/issues/1", reward },
      "owner",
    );
    if (result.status !== 201) throw new Error(JSON.stringify(result));
    return result.data.id as number;
  }
  async function submitted(reward = "25.00") {
    const id = await postJob(reward);
    const claim = await call(`/jobs/${id}/claim`, {}, "agent");
    if (claim.status !== 200) throw new Error(JSON.stringify(claim));
    const submit = await call(
      `/jobs/${id}/submit`,
      {
        prUrl: `https://github.com/owner/repo/pull/${id}`,
        notes: "Private test notes",
      },
      "agent",
    );
    if (submit.status !== 200) throw new Error(JSON.stringify(submit));
    return id;
  }
  return { ...db, call, services, postJob, submitted };
}
