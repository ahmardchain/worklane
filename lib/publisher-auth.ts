import { isAddress, verifyMessage } from "viem";
import { checkGithubProof, githubFetch } from "./github.ts";
import { network } from "./arc.ts";
import { HttpError, sha, type Services } from "./service.ts";
import type { ChallengeRow, WorkspaceRow } from "./types.ts";

const SESSION = "__Host-worklane-publisher";
const PROOF = "__Host-worklane-proof";
const LOGIN_TTL = 15 * 60_000;
const SESSION_TTL = 24 * 60 * 60_000;

function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function cookie(req: Request, name: string) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}
function setCookie(name: string, value: string, seconds: number) {
  return `${name}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Strict`;
}
function json(data: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return Response.json(data, { status, headers });
}
function policy(svc: Services) {
  const id = Number(svc.OWNER_GITHUB_ID),
    login = svc.OWNER_GITHUB_LOGIN?.toLowerCase();
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !login ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/.test(login)
  ) {
    throw new HttpError(
      503,
      "Publisher identity is not configured for this deployment.",
    );
  }
  return { id, login, ownerId: `github:${id}` };
}

export async function publisherIdentity(
  req: Request,
  svc: Services,
): Promise<string | null> {
  const value = cookie(req, SESSION);
  if (!/^[a-f0-9]{64}$/.test(value) || !svc.DB) return null;
  if (
    req.method === "POST" &&
    req.headers.get("origin") !== new URL(req.url).origin
  )
    return null;
  const owner = policy(svc);
  const session = await svc.DB.prepare(
    "SELECT s.owner_id FROM publisher_sessions s JOIN workspace w ON w.id=1 AND w.owner_id=s.owner_id AND w.wallet=s.wallet WHERE s.token_hash=? AND s.expires_at>? AND s.owner_id=?",
  )
    .bind(await sha(value), Date.now(), owner.ownerId)
    .first<{ owner_id: string }>();
  return session?.owner_id ?? null;
}

export async function handlePublisher(
  req: Request,
  svc: Services,
): Promise<Response> {
  try {
    return await run(req, svc);
  } catch (error) {
    return json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : error instanceof Error && !/D1|SQL|binding/.test(error.message)
              ? error.message
              : "Publisher authentication is temporarily unavailable.",
      },
      error instanceof HttpError ? error.status : 400,
    );
  }
}

async function run(req: Request, svc: Services) {
  if (!svc.DB)
    throw new HttpError(503, "The workspace database is not ready yet.");
  const url = new URL(req.url),
    db = svc.DB,
    owner = policy(svc);
  if (req.method !== "POST")
    throw new HttpError(405, "Use POST for publisher authentication.");
  if (req.headers.get("origin") !== url.origin)
    throw new HttpError(403, "Sign in from this Worklane domain.");
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Send application/json.");
  const bodyText = await req.text();
  if (bodyText.length > 5000) throw new HttpError(413, "Request is too large.");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HttpError(400, "Send a JSON object.");
  const now = Date.now(),
    bucket = Math.floor(now / 60000);
  const rate = await db
    .prepare(
      "INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(
      `publisher:${req.headers.get("cf-connecting-ip") ?? "local"}:${bucket}`,
      (bucket + 2) * 60000,
    )
    .first<{ count: number }>();
  if ((rate?.count ?? 0) > 15)
    throw new HttpError(429, "Too many sign-in attempts. Wait one minute.");
  await db
    .prepare("DELETE FROM publisher_sessions WHERE expires_at<?")
    .bind(now)
    .run();
  await db
    .prepare("DELETE FROM rate_limits WHERE expires_at<?")
    .bind(now)
    .run();
  const path = url.pathname.replace(/\/$/, "");
  if (path === "/v1/publisher/logout") {
    const value = cookie(req, SESSION);
    if (/^[a-f0-9]{64}$/.test(value))
      await db
        .prepare("DELETE FROM publisher_sessions WHERE token_hash=?")
        .bind(await sha(value))
        .run();
    return json({ signedIn: false }, 200, [
      setCookie(SESSION, "", 0),
      setCookie(PROOF, "", 0),
    ]);
  }
  const workspace = await db
    .prepare("SELECT * FROM workspace WHERE id=1")
    .first<WorkspaceRow>();
  if (workspace && workspace.owner_id !== owner.ownerId)
    throw new HttpError(
      403,
      "This workspace belongs to another identity. Its owner must review the migration.",
    );
  if (path === "/v1/publisher/challenge") {
    if (
      typeof body.wallet !== "string" ||
      !isAddress(body.wallet) ||
      /^0x0{40}$/i.test(body.wallet)
    )
      throw new HttpError(400, "Choose a valid publisher wallet.");
    const wallet = body.wallet.toLowerCase(),
      chainId = Number(body.chainId ?? 5042),
      net = network(chainId);
    if (workspace && workspace.wallet !== wallet)
      throw new HttpError(
        403,
        "Use the verified treasury wallet for this workspace.",
      );
    const id = crypto.randomUUID(),
      expires = now + LOGIN_TTL,
      proofToken = token();
    const message = `${url.origin} wants to sign you in to Worklane as publisher.\n\nGitHub: ${owner.login}\nGitHub ID: ${owner.id}\nWallet: ${wallet}\nNetwork: ${net.name}\nChain ID: ${chainId}\nPurpose: publisher sign-in\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\n\nThis signature verifies ownership. It does not send USDC or authorize a payment.`;
    await db
      .prepare("DELETE FROM challenges WHERE expires_at<?")
      .bind(now - 60000)
      .run();
    await db
      .prepare(
        "INSERT INTO challenges(id,wallet,purpose,github,owner_id,message,expires_at,wallet_provider,wallet_chain_id,publisher_nonce_hash) VALUES (?,?,'publisher',?,?,?,?,'external',?,?)",
      )
      .bind(
        id,
        wallet,
        owner.login,
        owner.ownerId,
        message,
        expires,
        chainId,
        await sha(proofToken),
      )
      .run();
    return json(
      {
        challengeId: id,
        message,
        expiresAt: expires,
        wallet,
        needsGithubProof: !workspace,
        github: owner.login,
      },
      200,
      [setCookie(PROOF, proofToken, LOGIN_TTL / 1000)],
    );
  }
  if (path !== "/v1/publisher/verify")
    throw new HttpError(404, "Publisher endpoint not found.");
  if (typeof body.challengeId !== "string" || body.challengeId.length > 100)
    throw new HttpError(400, "Start publisher sign-in again.");
  const c = await db
    .prepare("SELECT * FROM challenges WHERE id=?")
    .bind(body.challengeId)
    .first<ChallengeRow & { publisher_nonce_hash: string | null }>();
  const proofToken = cookie(req, PROOF);
  if (
    !c ||
    c.purpose !== "publisher" ||
    c.consumed ||
    c.expires_at <= now ||
    c.owner_id !== owner.ownerId ||
    c.github !== owner.login ||
    !c.message.startsWith(
      `${url.origin} wants to sign you in to Worklane as publisher.\n`,
    ) ||
    !/^[a-f0-9]{64}$/.test(proofToken) ||
    (await sha(proofToken)) !== c.publisher_nonce_hash
  ) {
    throw new HttpError(
      400,
      "This sign-in challenge expired or belongs to another browser. Start again.",
    );
  }
  if (
    typeof body.signature !== "string" ||
    !/^0x[a-f0-9]{130}$/i.test(body.signature)
  )
    throw new HttpError(
      400,
      "Approve the sign-in message in your publisher wallet.",
    );
  let valid = false;
  try {
    valid = await verifyMessage({
      address: c.wallet as `0x${string}`,
      message: c.message,
      signature: body.signature as `0x${string}`,
    });
  } catch {}
  if (!valid)
    throw new HttpError(
      401,
      "The signature does not match the publisher wallet.",
    );
  if (workspace && workspace.wallet !== c.wallet)
    throw new HttpError(403, "Use the workspace treasury wallet.");
  if (!workspace) {
    const identity = await checkGithubProof(
      owner.login,
      body.gistUrl,
      c.message,
      svc.readGithub ?? githubFetch(svc.GITHUB_TOKEN, svc.fetcher ?? fetch),
    );
    if (identity.id !== owner.id)
      throw new HttpError(
        403,
        "Only the configured GitHub owner can create this workspace.",
      );
  }
  const session = token(),
    statements = [
      db
        .prepare(
          "UPDATE challenges SET consumed=1 WHERE id=? AND purpose='publisher' AND consumed=0 AND expires_at>?",
        )
        .bind(c.id, Date.now()),
    ];
  if (!workspace)
    statements.push(
      db
        .prepare(
          "INSERT INTO workspace(id,owner_id,wallet,daily_cap_cents,created_at) SELECT 1,?,?,10000,? WHERE changes()>0 AND NOT EXISTS(SELECT 1 FROM workspace WHERE id=1)",
        )
        .bind(owner.ownerId, c.wallet, now),
    );
  const sessionIndex = statements.length;
  statements.push(
    db
      .prepare(
        "INSERT INTO publisher_sessions(token_hash,owner_id,wallet,expires_at,created_at) SELECT ?,?,?,?,? WHERE changes()>0 AND EXISTS(SELECT 1 FROM workspace WHERE id=1 AND owner_id=? AND wallet=?)",
      )
      .bind(
        await sha(session),
        owner.ownerId,
        c.wallet,
        now + SESSION_TTL,
        now,
        owner.ownerId,
        c.wallet,
      ),
  );
  if (!workspace)
    statements.push(
      db
        .prepare(
          "INSERT INTO events(kind,text,created_at) SELECT 'workspace','The publisher and treasury were verified.',? WHERE changes()>0",
        )
        .bind(now),
    );
  const result = await db.batch(statements);
  if (!result[sessionIndex].meta.changes)
    throw new HttpError(
      409,
      "This sign-in was already used, or setup changed. Start again.",
    );
  const previous = cookie(req, SESSION);
  if (/^[a-f0-9]{64}$/.test(previous))
    await db
      .prepare("DELETE FROM publisher_sessions WHERE token_hash=?")
      .bind(await sha(previous))
      .run();
  return json({ signedIn: true, configured: true, wallet: c.wallet }, 200, [
    setCookie(SESSION, session, SESSION_TTL / 1000),
    setCookie(PROOF, "", 0),
  ]);
}
