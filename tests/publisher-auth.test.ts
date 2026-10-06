import { test } from "node:test";
import assert from "node:assert/strict";
import { handlePublisher, publisherIdentity } from "../lib/publisher-auth.ts";
import { authenticatedStandaloneRequest } from "../lib/standalone-request.ts";
import { handle, type Services } from "../lib/service.ts";
import {
  database,
  ownerAccount,
  workerAccount,
  payer,
  recipient,
  githubFixture,
} from "./helpers.ts";

const origin = "https://worklane.test";
type Payload = {
  message: string;
  challengeId: string;
  wallet: string;
  isOwner: boolean;
  signedIn: boolean;
  needsGithubProof: boolean;
};
async function publisherFixture() {
  const db = database(),
    jar = new Map<string, string>();
  let gistOwner = 77,
    gistMessage: string | undefined;
  const services: Services = {
    DB: db.DB,
    OWNER_GITHUB_ID: "77",
    OWNER_GITHUB_LOGIN: "publisher",
    readGithub: async (path) => {
      if (path.startsWith("/gists/")) {
        const row = db.sqlite
          .prepare(
            "SELECT message FROM challenges WHERE purpose='publisher' ORDER BY rowid DESC LIMIT 1",
          )
          .get();
        return {
          owner: { id: gistOwner, login: "publisher" },
          public: true,
          files: {
            proof: { content: gistMessage ?? (row?.message as string) },
          },
        };
      }
      return githubFixture()(path);
    },
  };
  const cookies = () =>
    [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  async function auth(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await handlePublisher(
      new Request(`${origin}/v1/publisher/${path}`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookies(),
          ...headers,
        },
        body: JSON.stringify(body),
      }),
      services,
    );
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";")[0],
        index = pair.indexOf("="),
        key = pair.slice(0, index),
        content = pair.slice(index + 1);
      if (content) jar.set(key, content);
      else jar.delete(key);
    }
    return {
      response,
      status: response.status,
      data: (await response.json()) as Payload,
    };
  }
  async function prepare(wallet = payer) {
    const result = await auth("challenge", { wallet, chainId: 5042 });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const signature = await ownerAccount.signMessage({
      message: result.data.message,
    });
    return {
      ...result,
      body: {
        challengeId: result.data.challengeId,
        signature,
        gistUrl: `https://gist.github.com/publisher/${"ab".repeat(16)}`,
      },
    };
  }
  async function login() {
    const challenge = await prepare();
    const result = await auth("verify", challenge.body);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return { challenge, result };
  }
  async function app(path: string, body?: unknown, forged = false) {
    const request = new Request(`${origin}/v1${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        origin,
        cookie: cookies(),
        ...(body ? { "content-type": "application/json" } : {}),
        ...(forged ? { "oai-authenticated-user-id": "forged-owner" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const clean = await authenticatedStandaloneRequest(request, services);
    const response = await handle(clean, services);
    return {
      status: response.status,
      data: (await response.json()) as Payload,
    };
  }
  return {
    ...db,
    services,
    jar,
    cookies,
    auth,
    prepare,
    login,
    app,
    setGistOwner: (value: number) => {
      gistOwner = value;
    },
    setGistMessage: (value: string) => {
      gistMessage = value;
    },
  };
}

test("publisher verifies GitHub and wallet, receives a private session, and can post a task", async (t) => {
  const f = await publisherFixture();
  t.after(() => f.sqlite.close());
  const before = await f.app("/me", undefined, true);
  assert.equal(before.data.signedIn, false);
  const { challenge, result } = await f.login();
  assert.equal(challenge.data.needsGithubProof, true);
  assert.ok(
    result.response.headers
      .getSetCookie()
      .some(
        (cookie) =>
          cookie.startsWith("__Host-worklane-publisher=") &&
          cookie.includes("HttpOnly; Secure; SameSite=Strict"),
      ),
  );
  const token = f.jar.get("__Host-worklane-publisher");
  const stored = f.sqlite.prepare("SELECT * FROM publisher_sessions").get();
  assert.notEqual(stored?.token_hash, token);
  const me = await f.app("/me", undefined, true);
  assert.equal(me.data.isOwner, true);
  assert.equal(me.data.wallet, payer);
  const foreign = await authenticatedStandaloneRequest(
    new Request(`${origin}/v1/jobs`, {
      method: "POST",
      headers: {
        cookie: f.cookies(),
        origin: "https://other.test",
        "oai-authenticated-user-id": "github:77",
      },
    }),
    f.services,
  );
  assert.equal(foreign.headers.get("oai-authenticated-user-id"), null);
  const job = await f.app("/jobs", {
    issueUrl: "https://github.com/owner/repo/issues/1",
    reward: "5.00",
    chainId: 5042,
  });
  assert.equal(job.status, 201, JSON.stringify(job.data));
  assert.equal(
    f.sqlite.prepare("SELECT owner_id FROM jobs").get()?.owner_id,
    "github:77",
  );
  assert.equal((await f.auth("logout", {})).status, 200);
  assert.equal((await f.app("/me")).data.signedIn, false);
  assert.equal(
    (
      await f.app("/jobs", {
        issueUrl: "https://github.com/owner/repo/issues/2",
        reward: "5.00",
      })
    ).status,
    401,
  );
});
test("first publisher setup requires the pinned GitHub ID and exact challenge gist", async (t) => {
  const f = await publisherFixture();
  t.after(() => f.sqlite.close());
  const c = await f.prepare();
  f.setGistOwner(88);
  assert.equal((await f.auth("verify", c.body)).status, 403);
  f.setGistOwner(77);
  f.setGistMessage("a different message");
  assert.equal((await f.auth("verify", c.body)).status, 400);
  assert.equal(
    f.sqlite.prepare("SELECT count(*) n FROM workspace").get()?.n,
    0,
  );
  assert.equal(
    f.sqlite.prepare("SELECT count(*) n FROM publisher_sessions").get()?.n,
    0,
  );
});
test("publisher sign-in rejects wrong signatures, foreign browsers, wrong origins, and expired challenges", async (t) => {
  const f = await publisherFixture();
  t.after(() => f.sqlite.close());
  const c = await f.prepare();
  const wrong = await workerAccount.signMessage({ message: c.data.message });
  assert.equal(
    (await f.auth("verify", { ...c.body, signature: wrong })).status,
    401,
  );
  assert.equal((await f.auth("verify", c.body, { cookie: "" })).status, 400);
  assert.equal(
    (await f.auth("verify", c.body, { origin: "https://other.test" })).status,
    403,
  );
  f.sqlite
    .prepare("UPDATE challenges SET expires_at=0 WHERE id=?")
    .run(c.data.challengeId);
  assert.equal((await f.auth("verify", c.body)).status, 400);
  assert.equal(
    f.sqlite.prepare("SELECT count(*) n FROM workspace").get()?.n,
    0,
  );
});
test("returning publisher signs in with its saved wallet; a different wallet cannot replace it", async (t) => {
  const f = await publisherFixture();
  t.after(() => f.sqlite.close());
  await f.login();
  await f.auth("logout", {});
  assert.equal((await f.auth("challenge", { wallet: recipient })).status, 403);
  const c = await f.prepare();
  assert.equal(c.data.needsGithubProof, false);
  assert.equal(
    (
      await f.auth("verify", {
        challengeId: c.body.challengeId,
        signature: c.body.signature,
      })
    ).status,
    200,
  );
  assert.equal((await f.app("/me")).data.isOwner, true);
  assert.equal(
    f.sqlite.prepare("SELECT wallet FROM workspace").get()?.wallet,
    payer,
  );
});
test("publisher challenges are single-use and concurrent verification creates one session", async (t) => {
  const f = await publisherFixture();
  t.after(() => f.sqlite.close());
  const c = await f.prepare();
  const cookie = f.cookies();
  const results = await Promise.all([
    f.auth("verify", c.body, { cookie }),
    f.auth("verify", c.body, { cookie }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    f.sqlite.prepare("SELECT count(*) n FROM workspace").get()?.n,
    1,
  );
  assert.equal(
    f.sqlite.prepare("SELECT count(*) n FROM publisher_sessions").get()?.n,
    1,
  );
  assert.equal((await f.auth("verify", c.body, { cookie })).status, 400);
});
test("publisher sessions expire, logout revokes them, and policy changes invalidate old sessions", async (t) => {
  const f = await publisherFixture();
  t.after(() => f.sqlite.close());
  await f.login();
  const request = () =>
    new Request(`${origin}/v1/me`, { headers: { cookie: f.cookies() } });
  assert.equal(await publisherIdentity(request(), f.services), "github:77");
  assert.equal(
    await publisherIdentity(request(), {
      ...f.services,
      OWNER_GITHUB_ID: "88",
    }),
    null,
  );
  f.sqlite.prepare("UPDATE publisher_sessions SET expires_at=0").run();
  assert.equal(await publisherIdentity(request(), f.services), null);
});
