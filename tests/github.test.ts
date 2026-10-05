import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGithubProof, checkPr, githubUrl } from "../lib/github.ts";
import { githubFixture } from "./helpers.ts";

const url = "https://github.com/owner/repo/pull/1";
test("GitHub URLs are allowlisted and canonicalized", () => {
  assert.equal(
    githubUrl("https://github.com/Owner/Repo/issues/2", "issues").repo,
    "owner/repo",
  );
  for (const bad of [
    "https://github.com.evil.test/owner/repo/pull/1",
    "https://github.com/owner/repo/pull/1?token=secret",
    "javascript:alert(1)",
  ])
    assert.throws(() => githubUrl(bad, "pull"));
});
test("wallet challenge must be published by the claimed GitHub account", async () => {
  const gistId = "a".repeat(32),
    message = "Unique wallet verification message";
  const gist = {
    owner: { login: "worker", id: 22 },
    public: true,
    files: { proof: { content: message, truncated: false } },
  };
  const read = githubFixture({ [`/gists/${gistId}`]: gist });
  assert.deepEqual(
    await checkGithubProof(
      "worker",
      `https://gist.github.com/worker/${gistId}`,
      message,
      read,
    ),
    { id: 22, login: "worker" },
  );
  await assert.rejects(
    checkGithubProof(
      "attacker",
      `https://gist.github.com/attacker/${gistId}`,
      message,
      read,
    ),
    /belong/,
  );
  await assert.rejects(
    checkGithubProof(
      "worker",
      `https://gist.github.com/worker/${gistId}`,
      "different nonce",
      read,
    ),
    /complete verification/,
  );
  await assert.rejects(
    checkGithubProof(
      "worker",
      `https://gist.github.com/worker/${gistId}`,
      message,
      githubFixture({ [`/gists/${gistId}`]: { ...gist, public: false } }),
    ),
    /public gist/,
  );
});
test("PR validation binds the stable account ID, repository, and claim time", async () => {
  const read = githubFixture();
  assert.equal(
    (await checkPr(url, "owner/repo", 22, Date.now(), read)).checks,
    "unverified",
  );
  await assert.rejects(checkPr(url, "other/repo", 22, 0, read), /repository/);
  await assert.rejects(
    checkPr(url, "owner/repo", 99, 0, read),
    /verified GitHub/,
  );
  await assert.rejects(
    checkPr(url, "owner/repo", 22, Date.now() + 100000, read),
    /created after/,
  );
  const invalidDate = {
    user: { id: 22 },
    base: { repo: { full_name: "owner/repo" } },
    created_at: "invalid",
    state: "open",
  };
  await assert.rejects(
    checkPr(
      url,
      "owner/repo",
      22,
      0,
      githubFixture({ "/repos/owner/repo/pulls/1": invalidDate }),
    ),
    /created after/,
  );
});
test("acceptance requires merge and rechecks all returned CI results", async () => {
  assert.equal(
    (await checkPr(url, "owner/repo", 22, 0, githubFixture(), true)).checks,
    "passing",
  );
  const path = "/repos/owner/repo/commits/c0ffee/check-runs?per_page=100";
  await assert.rejects(
    checkPr(
      url,
      "owner/repo",
      22,
      0,
      githubFixture({
        [path]: {
          total_count: 1,
          check_runs: [{ status: "completed", conclusion: "failure" }],
        },
      }),
      true,
    ),
    /failing/,
  );
  await assert.rejects(
    checkPr(
      url,
      "owner/repo",
      22,
      0,
      githubFixture({ [path]: { total_count: 101, check_runs: [] } }),
      true,
    ),
    /incomplete/,
  );
  await assert.rejects(
    checkPr(
      url,
      "owner/repo",
      22,
      0,
      githubFixture({
        "/repos/owner/repo/commits/c0ffee/status": {
          state: "pending",
          statuses: [{}],
        },
      }),
      true,
    ),
    /not passing/,
  );
  const pr = await githubFixture()("/repos/owner/repo/pulls/1");
  await assert.rejects(
    checkPr(
      url,
      "owner/repo",
      22,
      0,
      githubFixture({
        "/repos/owner/repo/pulls/1": { ...pr, merged: false, state: "open" },
      }),
      true,
    ),
    /merge/,
  );
});
