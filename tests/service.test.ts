import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  agentKey,
  ownerAccount,
  workerAccount,
  hash,
  recipient,
  payer,
  proofFixture,
  rpcFixture,
  githubFixture,
} from "./helpers.ts";

test("owner setup verifies the signature, account binding and one-use nonce", async (t) => {
  const f = await fixture({ workspace: false });
  t.after(() => f.sqlite.close());
  assert.equal((await f.call("/challenge", { wallet: payer })).status, 401);
  const c = (await f.call("/challenge", { wallet: payer }, "owner")).data;
  const signature = await ownerAccount.signMessage({ message: c.message });
  const wrongSignature = await workerAccount.signMessage({
    message: c.message,
  });
  assert.equal(
    (
      await f.call(
        "/workspace",
        { challengeId: c.challengeId, signature: wrongSignature },
        "owner",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        "/workspace",
        { challengeId: c.challengeId, signature },
        "other",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call(
        "/workspace",
        { challengeId: c.challengeId, signature },
        "owner",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await f.call(
        "/workspace",
        { challengeId: c.challengeId, signature },
        "owner",
      )
    ).status,
    409,
  );
  assert.equal(
    f.sqlite.prepare("SELECT count(*) n FROM workspace").get()?.n,
    1,
  );
});
test("agent hire verifies wallet plus GitHub ownership and keeps only the key hash", async (t) => {
  const f = await fixture();
  t.after(() => f.sqlite.close());
  const c = (
    await f.call("/challenge", {
      purpose: "hire",
      wallet: recipient,
      github: "second-worker",
    })
  ).data;
  const signature = await workerAccount.signMessage({ message: c.message });
  const gistId = "b".repeat(32);
  f.services.readGithub = async () => ({
    owner: { login: "second-worker", id: 33 },
    public: true,
    files: { proof: { content: c.message } },
  });
  const body = {
    challengeId: c.challengeId,
    signature,
    name: "Dot",
    gistUrl: `https://gist.github.com/second-worker/${gistId}`,
  };
  const hire = await f.call("/hire", body);
  assert.equal(hire.status, 201);
  assert.match(hire.data.key, /^wl_[a-f0-9]{64}$/);
  const row = f.sqlite.prepare("SELECT * FROM agents WHERE github_id=33").get();
  assert.notEqual(row?.key_hash, hire.data.key);
  assert.equal((await f.call("/hire", body)).status, 400);
  const live = await f.call("/live");
  assert.equal(JSON.stringify(live.data).includes(hire.data.key), false);
  assert.equal(JSON.stringify(live.data).includes("key_hash"), false);
});
test("Circle registration binds wallet, chain and GitHub; signature and gist both remain required", async (t) => {
  const f = await fixture();
  t.after(() => f.sqlite.close());
  const circleWallet = `0x${"34".repeat(20)}`;
  const signature = `0x${"ab".repeat(160)}`;
  const c = (
    await f.call("/challenge", {
      purpose: "hire",
      github: "circle-worker",
      wallet: circleWallet,
      walletProvider: "circle",
      chainId: 5042,
    })
  ).data;
  assert.ok(c.message.includes(`Wallet: ${circleWallet}`));
  assert.ok(c.message.includes("Chain ID: 5042"));
  assert.ok(c.message.includes("GitHub: circle-worker"));
  let accepted = false,
    checks = 0;
  f.services.fetcher = (async (_url: unknown, init: RequestInit) => {
    const { method } = JSON.parse(init.body as string);
    if (method === "eth_chainId") return Response.json({ result: "0x13b2" });
    assert.equal(method, "eth_call");
    checks++;
    return Response.json({ result: accepted ? "0x01" : "0x00" });
  }) as typeof fetch;
  f.services.readGithub = async () => ({
    owner: { login: "circle-worker", id: 33 },
    public: true,
    files: { proof: { content: c.message } },
  });
  const body = {
    challengeId: c.challengeId,
    name: "Circle Worker",
    signature,
    gistUrl: `https://gist.github.com/circle-worker/${"b".repeat(32)}`,
    // These request fields cannot override the issued challenge.
    wallet: payer,
    walletProvider: "external",
    chainId: 5042002,
  };
  assert.equal((await f.call("/hire", { ...body, signature: "" })).status, 400);
  assert.equal((await f.call("/hire", body)).status, 400);
  assert.equal(
    f.sqlite
      .prepare("SELECT consumed FROM challenges WHERE id=?")
      .get(c.challengeId)?.consumed,
    0,
  );
  accepted = true;
  f.services.readGithub = async () => ({
    owner: { login: "someone-else", id: 44 },
    public: true,
    files: { proof: { content: c.message } },
  });
  assert.equal((await f.call("/hire", body)).status, 400);
  f.services.readGithub = async () => ({
    owner: { login: "circle-worker", id: 33 },
    public: true,
    files: { proof: { content: c.message } },
  });
  const hire = await f.call("/hire", body);
  assert.equal(hire.status, 201);
  assert.ok(checks >= 3);
  const row = f.sqlite.prepare("SELECT * FROM agents WHERE github_id=33").get();
  assert.equal(row?.wallet, circleWallet);
  assert.equal(row?.wallet_provider, "circle");
  assert.equal(row?.wallet_chain_id, 5042);
  assert.notEqual(row?.key_hash, hire.data.key);
  assert.equal((await f.call("/hire", body)).status, 400);
  assert.equal(
    (await f.call("/live")).data.agents.find(
      (a: { github: string }) => a.github === "circle-worker",
    ).wallet_chain_id,
    5042,
  );

  f.services.readGithub = githubFixture({
    "/repos/owner/repo/pulls/1": {
      user: { id: 33, login: "circle-worker" },
      base: { repo: { full_name: "owner/repo" } },
      head: { sha: "abc" },
      state: "closed",
      merged: true,
      created_at: new Date(Date.now() + 1000).toISOString(),
    },
  });
  const mainnetJob = await f.postJob();
  const testnetJob = (
    await f.call(
      "/jobs",
      {
        issueUrl: "https://github.com/owner/repo/issues/2",
        reward: "25.00",
        chainId: 5042002,
      },
      "owner",
    )
  ).data.id;
  assert.equal(
    (await f.call(`/jobs/${testnetJob}/claim`, {}, hire.data.key)).status,
    409,
  );
  assert.equal(
    (await f.call(`/jobs/${mainnetJob}/claim`, {}, hire.data.key)).status,
    200,
  );
  assert.equal(
    (
      await f.call(
        `/jobs/${mainnetJob}/submit`,
        {
          prUrl: "https://github.com/owner/repo/pull/1",
          notes: "Verified Circle recipient integration",
        },
        hire.data.key,
      )
    ).status,
    200,
  );
  f.services.fetcher = rpcFixture();
  assert.equal(
    (await f.call(`/jobs/${mainnetJob}/approve`, { reviewed: true }, "owner"))
      .status,
    200,
  );
  const payout = f.sqlite
    .prepare("SELECT * FROM payouts WHERE job_id=?")
    .get(mainnetJob);
  assert.equal(payout?.recipient, circleWallet);
  const receipt = proofFixture({
    chain_id: 5042,
    sender: payer,
    recipient: circleWallet,
    amount_micros: "25000000",
    min_block: "101",
  });
  f.services.fetcher = rpcFixture({ ...receipt, block: "0x66" });
  assert.equal(
    (await f.call(`/payouts/${mainnetJob}/verify`, { txHash: hash }, "owner"))
      .data.paid,
    true,
  );
});

test("Circle challenges reject invalid chains/providers, expiry and publisher-purpose substitution", async (t) => {
  const f = await fixture({ workspace: false });
  t.after(() => f.sqlite.close());
  for (const body of [
    {
      purpose: "hire",
      wallet: recipient,
      github: "worker",
      walletProvider: "circle",
      chainId: 8453,
    },
    {
      purpose: "hire",
      wallet: recipient,
      github: "worker",
      walletProvider: "unknown",
    },
    { purpose: "workspace", wallet: payer, walletProvider: "circle" },
  ])
    assert.equal((await f.call("/challenge", body, "owner")).status, 400);
  const c = (
    await f.call("/challenge", {
      purpose: "hire",
      github: "worker",
      wallet: recipient,
      walletProvider: "circle",
    })
  ).data;
  assert.equal(
    (await f.call("/workspace", { challengeId: c.challengeId }, "owner"))
      .status,
    400,
  );
  f.sqlite
    .prepare("UPDATE challenges SET expires_at=? WHERE id=?")
    .run(Date.now() - 1, c.challengeId);
  assert.equal(
    (
      await f.call("/hire", {
        challengeId: c.challengeId,
        signature: `0x${"ab".repeat(160)}`,
        name: "Expired",
      })
    ).status,
    400,
  );
  assert.equal(
    f.sqlite.prepare("SELECT count(*) n FROM workspace").get()?.n,
    0,
  );
});

test("claims are atomic, one active job per agent, releasable and expirable", async (t) => {
  const f = await fixture();
  t.after(() => f.sqlite.close());
  const id = await f.postJob(),
    second = await f.postJob();
  const claims = await Promise.all([
    f.call(`/jobs/${id}/claim`, {}, "agent"),
    f.call(`/jobs/${id}/claim`, {}, "agent"),
  ]);
  assert.deepEqual(claims.map((c) => c.status).sort(), [200, 409]);
  assert.equal(
    (await f.call(`/jobs/${second}/claim`, {}, "agent")).status,
    409,
  );
  assert.equal((await f.call(`/jobs/${id}/release`, {}, "agent")).status, 200);
  assert.equal(
    (await f.call(`/jobs/${second}/claim`, {}, "agent")).status,
    200,
  );
  f.sqlite
    .prepare("UPDATE jobs SET claim_expires=? WHERE id=?")
    .run(Date.now() - 1, second);
  assert.equal((await f.call(`/jobs/${id}/claim`, {}, "agent")).status, 200);
  assert.equal(
    f.sqlite.prepare("SELECT status FROM jobs WHERE id=?").get(second)?.status,
    "open",
  );
});
test("private submission notes never appear in board reads and review is owner-only", async (t) => {
  const f = await fixture();
  t.after(() => f.sqlite.close());
  const id = await f.submitted();
  for (const path of ["/live", "/jobs", `/jobs/${id}`]) {
    const data = JSON.stringify((await f.call(path)).data);
    assert.equal(data.includes("Private test notes"), false);
    assert.equal(data.includes("owner_id"), false);
    assert.equal(data.includes(agentKey), false);
  }
  assert.equal(
    (await f.call(`/jobs/${id}/review`, undefined, "other")).status,
    403,
  );
  assert.equal(
    (await f.call(`/jobs/${id}/review`, undefined, "owner")).data.submission
      .notes,
    "Private test notes",
  );
  assert.equal(
    (await f.call(`/jobs/${id}/approve`, { reviewed: true }, "agent")).status,
    401,
  );
  assert.equal(
    (await f.call(`/jobs/${id}/approve`, { reviewed: true }, "other")).status,
    403,
  );
  assert.equal(
    (await f.call(`/jobs/${id}/approve`, { reviewed: false }, "owner")).status,
    400,
  );
});
test("human approval creates an immutable payout and enforces the rolling cap", async (t) => {
  const f = await fixture();
  t.after(() => f.sqlite.close());
  const id = await f.submitted("75.00");
  assert.equal(
    (
      await f.call(
        `/jobs/${id}/approve`,
        { reviewed: true, reward: "0.01", recipient: payer },
        "owner",
      )
    ).status,
    200,
  );
  const payout = f.sqlite
    .prepare("SELECT * FROM payouts WHERE job_id=?")
    .get(id);
  assert.equal(payout?.amount_micros, "75000000");
  assert.equal(payout?.recipient, recipient);
  assert.equal(payout?.min_block, "101");
  assert.throws(
    () =>
      f.sqlite
        .prepare("UPDATE payouts SET recipient=? WHERE job_id=?")
        .run(payer, id),
    /immutable/,
  );
  assert.throws(
    () => f.sqlite.prepare("UPDATE jobs SET reward_cents=1 WHERE id=?").run(id),
    /fixed/,
  );
  assert.equal(
    (await f.call(`/jobs/${id}/approve`, { reviewed: true }, "owner")).status,
    409,
  );
  assert.equal((await f.call(`/jobs/${id}/reject`, {}, "owner")).status, 409);
  // A distinct agent's pending work cannot take approvals past the cap.
  f.sqlite
    .prepare(
      "INSERT INTO agents(id,name,github,github_id,wallet,key_hash,status,created_at,last_seen) SELECT 'second-agent','Dot','second',33,wallet,'other-hash',status,created_at,last_seen FROM agents WHERE id='test-agent-22'",
    )
    .run();
  const second = await f.postJob("30.00");
  f.sqlite
    .prepare(
      "INSERT INTO submissions VALUES ('second-sub',?,'second-agent','https://github.com/owner/repo/pull/2','','pending',?)",
    )
    .run(second, Date.now());
  f.sqlite
    .prepare(
      "UPDATE jobs SET status='submitted',agent_id='second-agent',submission_id='second-sub',claimed_at=? WHERE id=?",
    )
    .run(Date.now() - 10000, second);
  f.services.readGithub = async (path) => {
    if (path.includes("/pulls/"))
      return {
        user: { id: 33 },
        base: { repo: { full_name: "owner/repo" } },
        head: { sha: "c0ffee" },
        created_at: new Date().toISOString(),
        merged: true,
        state: "closed",
      };
    return path.includes("check-runs")
      ? { total_count: 0, check_runs: [] }
      : { statuses: [] };
  };
  assert.equal(
    (await f.call(`/jobs/${second}/approve`, { reviewed: true }, "owner"))
      .status,
    409,
  );
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM payouts").get()?.n, 1);
});
test("payment reservation prevents a second send and verified settlement is idempotent", async (t) => {
  const f = await fixture();
  t.after(() => f.sqlite.close());
  const id = await f.submitted();
  await f.call(`/jobs/${id}/approve`, { reviewed: true }, "owner");
  const reserve = await f.call(`/payouts/${id}/reserve`, {}, "owner");
  assert.equal(reserve.status, 200);
  assert.equal(
    (await f.call(`/payouts/${id}/reserve`, {}, "owner")).status,
    409,
  );
  assert.equal(
    (
      await f.call(
        `/payouts/${id}/broadcast`,
        { reservation: "wrong", txHash: hash },
        "owner",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.call(
        `/payouts/${id}/broadcast`,
        { reservation: reserve.data.reservation, txHash: hash },
        "owner",
      )
    ).status,
    200,
  );
  f.services.fetcher = rpcFixture({ receipt: null, block: "0x66" });
  assert.equal(
    (await f.call(`/payouts/${id}/verify`, { txHash: hash }, "owner")).status,
    202,
  );
  assert.equal(
    f.sqlite.prepare("SELECT status FROM jobs WHERE id=?").get(id)?.status,
    "approved",
  );
  const proof = proofFixture();
  f.services.fetcher = rpcFixture({ ...proof, block: "0x66" });
  const results = await Promise.all([
    f.call(`/payouts/${id}/verify`, { txHash: hash }, "owner"),
    f.call(`/payouts/${id}/verify`, { txHash: hash }, "owner"),
  ]);
  assert.equal(
    results.every((r) => r.status === 200 && r.data.paid),
    true,
  );
  assert.equal(
    (await f.call(`/payouts/${id}/verify`, { txHash: hash }, "owner")).data
      .paid,
    true,
  );
  assert.equal(
    f.sqlite.prepare("SELECT count(*) n FROM events WHERE kind='paid'").get()
      ?.n,
    1,
  );
  assert.equal(
    f.sqlite.prepare("SELECT status FROM jobs WHERE id=?").get(id)?.status,
    "paid",
  );
  assert.equal((await f.call("/live")).data.stats.paid_cents, 2500);
});
test("database ledger is append-only and keys revoke immediately", async (t) => {
  const f = await fixture();
  t.after(() => f.sqlite.close());
  const id = await f.postJob();
  assert.throws(
    () => f.sqlite.prepare("DELETE FROM events").run(),
    /append-only/,
  );
  assert.equal(
    (await f.call("/agent/revoke", { agentId: "test-agent-22" }, "owner"))
      .status,
    200,
  );
  assert.equal((await f.call(`/jobs/${id}/claim`, {}, "agent")).status, 401);
});

test("an approval in progress cannot approve a replacement submission", async (t) => {
  const f = await fixture();
  t.after(() => f.sqlite.close());
  const id = await f.submitted();
  const normalRead = f.services.readGithub!;
  let release!: () => void, arrived!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  f.services.readGithub = async (path) => {
    if (path.endsWith("/pulls/1")) {
      arrived();
      await waiting;
    }
    return normalRead(path);
  };
  const approving = f.call(`/jobs/${id}/approve`, { reviewed: true }, "owner");
  await started;
  assert.equal((await f.call(`/jobs/${id}/reject`, {}, "owner")).status, 200);
  assert.equal((await f.call(`/jobs/${id}/claim`, {}, "agent")).status, 200);
  assert.equal(
    (
      await f.call(
        `/jobs/${id}/submit`,
        { prUrl: "https://github.com/owner/repo/pull/2" },
        "agent",
      )
    ).status,
    200,
  );
  release();
  assert.equal((await approving).status, 409);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM payouts").get()?.n, 0);
  assert.equal(
    f.sqlite.prepare("SELECT status FROM jobs WHERE id=?").get(id)?.status,
    "submitted",
  );
});

test("one valid transaction cannot credit two identical approved rewards", async (t) => {
  const f = await fixture();
  t.after(() => f.sqlite.close());
  const first = await f.submitted();
  await f.call(`/jobs/${first}/approve`, { reviewed: true }, "owner");
  f.sqlite
    .prepare(
      "INSERT INTO agents(id,name,github,github_id,wallet,key_hash,status,created_at,last_seen) SELECT 'second-agent','Dot','second',33,wallet,'other-hash',status,created_at,last_seen FROM agents WHERE id='test-agent-22'",
    )
    .run();
  const second = await f.postJob();
  f.sqlite
    .prepare(
      "INSERT INTO submissions VALUES ('second-sub',?,'second-agent','https://github.com/owner/repo/pull/2','','pending',?)",
    )
    .run(second, Date.now());
  f.sqlite
    .prepare(
      "UPDATE jobs SET status='submitted',agent_id='second-agent',submission_id='second-sub',claimed_at=? WHERE id=?",
    )
    .run(Date.now() - 10000, second);
  const normalRead = f.services.readGithub!;
  f.services.readGithub = async (path) => {
    const value = await normalRead(path);
    return path.endsWith("/pulls/2") ? { ...value, user: { id: 33 } } : value;
  };
  assert.equal(
    (await f.call(`/jobs/${second}/approve`, { reviewed: true }, "owner"))
      .status,
    200,
  );
  f.services.fetcher = rpcFixture({ block: "0x66" });
  assert.equal(
    (await f.call(`/payouts/${first}/verify`, { txHash: hash }, "owner")).data
      .paid,
    true,
  );
  assert.equal(
    (await f.call(`/payouts/${second}/verify`, { txHash: hash }, "owner"))
      .status,
    409,
  );
  assert.equal((await f.call("/live")).data.stats.paid_cents, 2500);
  assert.equal(
    f.sqlite.prepare("SELECT status FROM jobs WHERE id=?").get(second)?.status,
    "approved",
  );
});
