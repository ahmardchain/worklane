# Code Markets reference research

Inspected read-only on 2026-10-05 using public GitHub resources. The live agents.md URL did not load through web retrieval; the repository's exact `public/agents.md` was available. No external onboarding, installations, registrations, claims, messages, transfers, or repository mutations were performed.

## Verified reference

- Source: https://github.com/paoloanzn/musejob (default branch `master`; inspected tree SHA `829b1d24cb2d44507570ad779336a3fac377375d`).
- Agent onboarding: https://github.com/paoloanzn/musejob/blob/master/public/agents.md (v1.1.0).
- Architecture: https://github.com/paoloanzn/musejob/blob/master/README.md.
- License: https://github.com/paoloanzn/musejob/blob/master/LICENSE — MIT, Copyright (c) 2026 Paolo Anzani. Preserve notice if reusing substantial source. An original implementation using the workflow as a reference avoids tying the product to their branding.

## Model and workflow

This is a company-funded coding job board, not smart-contract escrow. Four roles: worker agents; a master agent holding a company wallet; a human admin; the read-only public. A TypeScript Hono Cloudflare Worker is the sole writer to D1. Cloudflare Access protects admin actions and JWT verification is repeated in the Worker.

State path: `open → claimed → submitted → approved → paid`. Release, expiry, or rejection reopens a job. Claims default to 24 hours; a cron releases expired claims every 10 minutes. Conditional SQL writes and a partial unique index ensure a job has only one claimant and an agent only one active claim. An append-only event ledger is protected by update/delete triggers; helper inserts events only when the previous batch statement changed rows.

Hiring records agent name, owner X handle, GitHub login, and wallet. Keys are 32 random bytes with `cmk_` prefix; only SHA-256 hashes are stored. Every authenticated call reloads agent status so bans apply immediately. Verification uses an owner X tweet containing a server code; one verified agent per X handle. Wallet changes revoke verification. Unverified agents can claim jobs strictly below 500 cents.

Submission validates a canonical GitHub PR URL, target repository, registered author, creation after the claim, and open/merged state. A unique PR URL prevents the same PR serving multiple jobs. Notes are private. Acceptance itself is by master/human review; successful CI or merge is not automatically required by the submission validator.

## API shape

Public reads: `/v1/live`, `/v1/jobs`, `/v1/jobs/:id`, `/v1/events`, `/v1/messages`, `/v1/leaderboard`, `/v1/payouts`, `/v1/stats`, `/v1/meta`, `/v1/skills`.

Worker writes: `POST /v1/hire`, `POST /v1/verify`, `GET /v1/me`, `PUT /v1/me/wallet`, `POST /v1/jobs/:id/claim`, `/release`, `/submit`, `POST /v1/messages`.

Master routes: review submissions, approve/reject, read payouts, report transaction hash. Admin routes: post jobs, reject, ban, reopen, protected by Access.

Source: https://github.com/paoloanzn/musejob/tree/master/src/routes.

## Payment verification

Approval atomically creates a payout snapshot from the job reward and agent's saved wallet, with a 20,000-cent daily cap. Each job and submission may have only one payout; each transaction hash is usable once. The master submits the transfer then reports its hash. Server checks RPC receipt success, configured confirmation count, block timestamp after approval (60-second skew allowance), the correct USDC contract, exact sender, exact recipient, and exactly one matching ERC-20 Transfer event. It stores cents and converts to six-decimal token units using `cents * 10_000`.

Source: https://github.com/paoloanzn/musejob/blob/master/src/checks.ts and https://github.com/paoloanzn/musejob/blob/master/src/routes/master.ts.

## Trust boundaries worth retaining and improving

- Render all external agent strings as text; strict CSP, bounded messages and domain allowlists.
- Immutable versioned skill archives with SHA-256 checks; version header gates compatibility. A header alone does not prove a request actually came from an approved client.
- Use transactionally guarded changes and immutable payment snapshots. Validate actual chain ID for configured RPC providers; derive token configuration from official Arc docs rather than copying Base settings.
- Keep credentials and private notes out of public APIs. Never ask worker agents for private wallet keys.
- Scope GitHub authentication narrowly and bind stable numeric GitHub identity to the owner. The reference hire endpoint verifies only that the entered GitHub account exists, not that the requester controls it.
- Enforce human approval in the application's authorization layer. In the reference, human permission is primarily a master skill instruction; the approve API authenticates the master bearer key without separate human consent evidence.
- Re-read CI and PR state at acceptance. A correct PR URL does not prove code quality or that work satisfies a job.

These are implementation assessments from the source, not claimed features of the live deployment.

## Other GitHub references inspected

- https://github.com/freecodexyz/identity — GitHub account → wallet using Actions OIDC and soulbound UIK. Pins repository ID, workflow/ref, trigger, actor ID, beneficiary audience. Apache-2.0 license confirmed. Useful identity lesson, unnecessary for the initial jobs MVP.
- https://github.com/freecodexyz/market — repository identity and token market/royalty contracts; unrelated to task payouts. Apache-2.0 license confirmed. Its deployment scripts validate expected chain ID before broadcasting.
- https://github.com/freecodexyz/ship — project contributor skills, deterministic GitHub outcome scoring, reproducible monthly reward proposals; explicitly does not execute token transfers. Useful distinction between work evidence, approval and settlement. No root LICENSE file was found in the read performed.
- https://github.com/freecodexyz/fcf — GitHub repository identity and funding tooling; README says Base Sepolia testing. Not needed for the job board.
- https://github.com/freecodexyz/free-code — separate coding CLI. Its README says original Claude Code source is Anthropic property and it originates from a source exposure; no root LICENSE was found. Do not reuse as a project dependency or copy source for this product.

## Suggested original Arc MVP

Repository-scoped coding tasks with defined acceptance criteria and fixed USDC rewards; owner authentication; agent registration; atomic claim/release; validated PR submission; explicit owner review; wallet-authorized Arc USDC payout; independently verified receipt; public jobs/activity/payout board. UI may use the reference's explorable work lifecycle and live activity, with distinct branding and no copied proprietary art. Initial seeded demo data must be labelled; production payout claims must come from real receipts.
