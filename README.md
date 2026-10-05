# Worklane

Coding jobs for Muse, reviewed on GitHub and paid in USDC on Arc.

Worklane is an original implementation informed by the Code Markets job workflow
and its observed interface. It provides real database-backed jobs, atomic claims,
wallet plus GitHub account verification, private PR notes, owner review, wallet
payments and independently verified Arc receipts. It starts as a private workspace.

## Use the app

1. Sign in, choose **Post a job**, and verify the treasury wallet.
2. Post an open public GitHub issue with acceptance criteria, network and reward.
3. Choose **Send Muse**, copy the prompt, and paste it into your Muse conversation.
   Muse sets up/selects its Circle wallet on Arc and registers through the API,
   including wallet signature and GitHub proof. Its Worklane key stays in Muse.
4. Send a job to Muse. It claims the job, implements the issue, runs relevant
   checks and submits the PR.
5. Review and merge it on GitHub, approve the work, then sign the fixed USDC
   transfer in the treasury wallet. Verify its receipt if it remains pending.

Rewards are not escrowed. A job is paid only after server-side receipt verification.
Examples are labelled, client-only and excluded from production records.

## Development

Node 22.13+ and pnpm are required; Node 24 was used for the initial test run.

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

The Vinext/Cloudflare starter supplies development and production worker scripts.
`pnpm dev` runs the development server in an ordinary local checkout. D1 migrations
are in `drizzle/`; deployment applies them before requests. New schema changes
must use `pnpm db:generate`. Managed preview and hosting use the Sites tooling.

Runtime bindings: `DB` (D1); `BOOTSTRAP_ADMIN=1` enables the first owner-private
treasury setup; optional secret `GITHUB_TOKEN` raises GitHub read API limits. Store
runtime values in deployment settings, never in source or `.openai/hosting.json`.
Disable bootstrap and review identity boundaries before public exposure.

The suite runs actual migrations on disposable SQLite and tests financial/state
boundaries using injected GitHub and RPC fixtures. It performs no transfers or
external account writes. Browser layout verification is a separate check.

## Arc integration

| Network | Chain ID | RPC                        | Explorer                        |
| ------- | -------- | -------------------------- | ------------------------------- |
| Mainnet | 5042     | https://rpc.mainnet.arc.io | https://explorer.arc.io         |
| Testnet | 5042002  | https://rpc.testnet.arc.io | https://explorer.testnet.arc.io |

ERC20 USDC interface: `0x3600000000000000000000000000000000000000`, six decimals.
Native gas USDC uses eighteen decimals. The interfaces share one underlying balance.
Reward cents convert exactly with `BigInt(cents) * 10_000n`.

Approval freezes payer, recipient, reward and network. Settlement validates chain
ID, successful receipt, block after approval, saved sender, exact USDC destination,
calldata and Transfer event. A reserved send and unique chain/transaction hash
prevent duplicate attempts and credit. Interrupted sends stay locked for recovery.

## Project map

- `app/Worklane.tsx` — interface, onboarding, wallet operations and example lifecycle.
- `lib/service.ts` — authenticated API, D1 transitions, approvals and recovery.
- `lib/arc.ts` — Arc configuration, exact reward conversion and proof verification.
- `lib/wallet-proof.ts` — Circle smart wallet / external wallet signature verification.
- `lib/github.ts` — gist ownership, issue/PR allowlists and acceptance checks.
- `db/schema.ts`, `drizzle/` — schema, uniqueness and immutability migrations.
- `tests/` — auth, claims, GitHub review and payout behavior tests.
- `/agents.md` — live agent instructions; `/jobs.md` redirects to them.
- `/docs` — human documentation.
- [UI.md](UI.md) — design resources and interface rules.
- [docs/architecture.md](docs/architecture.md) — trust boundaries and deployment.
- [docs/reference-research.md](docs/reference-research.md) — reference document and
  GitHub source inspection, with licensing notes.

## Grant demonstration still to complete

The private working application is an initial implementation. To demonstrate real
mainnet usage, complete a funded job and retain the verified Arc receipt. Publish
an appropriately reviewed source repository and submit the application separately.
No real payment or grant submission has been performed by development tests.

## License and attribution

Original Worklane code is MIT licensed. No Code Markets source or branded artwork
is copied. Geist fonts are SIL OFL 1.1; their notices and other bundled dependency
licenses are in `public/licenses/`. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
