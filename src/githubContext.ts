import * as github from "@actions/github";

export interface GitHubContext {
  eventName: string;
  repository: string;
  repositoryOwner: string;
  ref: string;
  refName: string;
  refType: string;
  sha: string;
  actor: string;
  workflow: string;
  runId: string;
  runNumber: string;
  runAttempt: string;
  serverUrl: string;
  apiUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: Record<string, any>;
  owner: string;
  repo: string;
}

export function harvestGitHubContext(): GitHubContext {
  const ctx = github.context;

  const repository = process.env.GITHUB_REPOSITORY || ctx.repo.owner + "/" + ctx.repo.repo;
  const parts = repository.split("/");
  const owner = parts[0] ?? ctx.repo.owner;
  const repo = parts[1] ?? ctx.repo.repo;

  return {
    eventName: ctx.eventName || process.env.GITHUB_EVENT_NAME || "",
    repository,
    repositoryOwner: owner,
    ref: ctx.ref || process.env.GITHUB_REF || "",
    refName: process.env.GITHUB_REF_NAME || ctx.ref?.replace(/^refs\/[^/]+\//, "") || "",
    refType: process.env.GITHUB_REF_TYPE || "",
    sha: ctx.sha || process.env.GITHUB_SHA || "",
    actor: ctx.actor || process.env.GITHUB_ACTOR || "",
    workflow: ctx.workflow || process.env.GITHUB_WORKFLOW || "",
    runId: String(ctx.runId || process.env.GITHUB_RUN_ID || ""),
    runNumber: String(ctx.runNumber || process.env.GITHUB_RUN_NUMBER || ""),
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || "1",
    serverUrl: process.env.GITHUB_SERVER_URL || "https://github.com",
    apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
    event: ctx.payload || {},
    owner,
    repo,
  };
}
