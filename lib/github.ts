export type GitHubPayload = {
  owner?: { login: string; id: number };
  public?: boolean;
  files?: Record<string, { content?: string; truncated?: boolean }>;
  user?: { id: number; login?: string };
  base?: { repo?: { full_name: string } };
  head?: { sha: string };
  created_at?: string;
  state?: string;
  merged?: boolean;
  statuses?: unknown[];
  check_runs?: { status: string; conclusion: string | null }[];
  total_count?: number;
  title?: string;
  body?: string;
  pull_request?: unknown;
};
export type GitHubFetch = (path: string) => Promise<GitHubPayload>;
export function githubFetch(
  token?: string,
  fetcher: typeof fetch = fetch,
): GitHubFetch {
  return async (path) => {
    const response = await fetcher(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Worklane-Arc",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404)
      throw new Error("GitHub could not find this public issue, PR, or gist.");
    if (!response.ok)
      throw new Error(
        "GitHub is temporarily unavailable or rate limited. Please try again.",
      );
    return response.json() as Promise<GitHubPayload>;
  };
}
export function githubUrl(value: unknown, kind: "issues" | "pull") {
  if (typeof value !== "string") throw new Error("Enter a GitHub link.");
  const match = value.match(
    new RegExp(
      `^https://github\\.com/([A-Za-z0-9_-]+)/([A-Za-z0-9_.-]+)/${kind}/([1-9][0-9]*)/?$`,
    ),
  );
  if (!match)
    throw new Error(
      `Use a public github.com repository ${kind === "pull" ? "pull request" : "issue"} URL.`,
    );
  const [, owner, repo, number] = match;
  return {
    repo: `${owner}/${repo}`.toLowerCase(),
    number: Number(number),
    url: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}/${kind}/${number}`,
  };
}
export async function checkGithubProof(
  github: string,
  gistUrl: unknown,
  message: string,
  read: GitHubFetch,
) {
  if (typeof gistUrl !== "string")
    throw new Error("Add your public GitHub verification gist.");
  const match = gistUrl.match(
    /^https:\/\/gist\.github\.com\/([A-Za-z0-9_-]+)\/([a-f0-9]{16,64})\/?$/i,
  );
  if (!match || match[1].toLowerCase() !== github)
    throw new Error("Use a gist owned by the GitHub account you entered.");
  const gist = await read(`/gists/${match[2]}`);
  if (gist.owner?.login?.toLowerCase() !== github || gist.public !== true)
    throw new Error("The public gist must belong to your GitHub account.");
  const found = Object.values(gist.files ?? {}).some(
    (f) => f.content?.trim() === message.trim() && !f.truncated,
  );
  if (!found)
    throw new Error(
      "Paste the complete verification message into a public gist, then try again.",
    );
  if (!gist.owner || !Number.isSafeInteger(gist.owner.id) || gist.owner.id <= 0)
    throw new Error("GitHub did not return a valid account identity.");
  return { id: gist.owner.id as number, login: github };
}
export async function checkPr(
  prUrl: unknown,
  repo: string,
  githubId: number,
  claimedAt: number,
  read: GitHubFetch,
  acceptance = false,
) {
  const parsed = githubUrl(prUrl, "pull");
  if (parsed.repo !== repo)
    throw new Error("The pull request must target this job's repository.");
  const pr = await read(`/repos/${repo}/pulls/${parsed.number}`);
  if (pr.user?.id !== githubId)
    throw new Error(
      "The PR must be authored by the agent's verified GitHub account.",
    );
  const createdAt = Date.parse(pr.created_at ?? "");
  if (
    pr.base?.repo?.full_name?.toLowerCase() !== repo ||
    !Number.isFinite(createdAt) ||
    createdAt < claimedAt
  )
    throw new Error(
      "The PR must be created after claiming this job and target the saved repository.",
    );
  if (pr.state !== "open" && !pr.merged)
    throw new Error("This PR is closed without being merged.");
  if (!acceptance)
    return { url: parsed.url, merged: !!pr.merged, checks: "unverified" };
  if (!pr.merged)
    throw new Error(
      "Review and merge the PR on GitHub before approving its payment.",
    );
  if (!pr.head?.sha)
    throw new Error("GitHub did not return the pull request's commit.");
  const [status, checks] = await Promise.all([
    read(`/repos/${repo}/commits/${pr.head.sha}/status`),
    read(`/repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=100`),
  ]);
  if (status.statuses?.length && status.state !== "success")
    throw new Error(
      "Commit statuses are not passing. Resolve them before approval.",
    );
  const runs = checks.check_runs ?? [];
  if ((checks.total_count ?? runs.length) > runs.length)
    throw new Error(
      "GitHub returned an incomplete check list. The owner must resolve this before approval.",
    );
  if (
    runs.some(
      (run) =>
        run.status !== "completed" ||
        !["success", "neutral", "skipped"].includes(run.conclusion ?? ""),
    )
  )
    throw new Error(
      "GitHub checks are pending or failing. Resolve them before approval.",
    );
  return {
    url: parsed.url,
    merged: true,
    checks: runs.length || status.statuses?.length ? "passing" : "none",
  };
}
