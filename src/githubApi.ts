import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHubContext } from "./githubContext";

export interface CompareResult {
  base: string;
  head: string;
  url: string;
  commits: number;
  files: number;
  additions: number;
  deletions: number;
  changes: number;
  changedFiles: ChangedFile[];
  truncated: boolean;
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blobUrl?: string;
}

export interface PullRequestContext {
  number: number;
  title: string;
  body: string;
  labels: string[];
  mergeCommitSha: string;
  mergedAt: string;
  author: string;
  files: ChangedFile[];
}

export interface DeploymentContext {
  id: number;
  environment: string;
  ref: string;
  sha: string;
  state: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  logUrl: string;
}

export async function fetchCompare(
  ctx: GitHubContext,
  token: string,
  base: string,
  head: string,
  maxFiles: number,
  maxListChars: number
): Promise<CompareResult | null> {
  if (!base || !head) return null;

  const octokit = github.getOctokit(token);
  try {
    const response = await octokit.rest.repos.compareCommitsWithBasehead({
      owner: ctx.owner,
      repo: ctx.repo,
      basehead: `${base}...${head}`,
      per_page: 1,
    });

    const data = response.data;
    const allFiles = data.files ?? [];
    let totalChars = 0;
    let truncated = allFiles.length > maxFiles;

    const sliced = allFiles.slice(0, maxFiles);
    const changedFiles: ChangedFile[] = [];
    for (const f of sliced) {
      const entry: ChangedFile = {
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        blobUrl: f.blob_url,
      };
      if (f.patch) {
        const patchEntry = f.patch ?? "";
        totalChars += entry.filename.length + patchEntry.length;
        if (totalChars <= maxListChars) {
          entry.patch = patchEntry;
        } else {
          truncated = true;
        }
      }
      changedFiles.push(entry);
    }

    return {
      base,
      head,
      url: data.permalink_url ?? `${ctx.serverUrl}/${ctx.repository}/compare/${base}...${head}`,
      commits: data.commits?.length ?? 0,
      files: data.files?.length ?? 0,
      additions: data.files?.reduce((s, f) => s + f.additions, 0) ?? 0,
      deletions: data.files?.reduce((s, f) => s + f.deletions, 0) ?? 0,
      changes: data.files?.reduce((s, f) => s + f.changes, 0) ?? 0,
      changedFiles,
      truncated,
    };
  } catch (err) {
    core.warning(`Compare API failed: ${(err as Error).message}`);
    return null;
  }
}

export async function fetchPullRequestsForCommit(
  ctx: GitHubContext,
  token: string,
  sha: string
): Promise<PullRequestContext[]> {
  const octokit = github.getOctokit(token);
  try {
    const response =
      await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        owner: ctx.owner,
        repo: ctx.repo,
        commit_sha: sha,
      });

    const merged = response.data.filter((pr) => pr.merged_at != null);
    const results: PullRequestContext[] = [];

    for (const pr of merged.slice(0, 3)) {
      const files = await fetchPullRequestFiles(ctx, token, pr.number);
      results.push({
        number: pr.number,
        title: pr.title,
        body: pr.body ?? "",
        labels: pr.labels.map((l) => l.name),
        mergeCommitSha: pr.merge_commit_sha ?? sha,
        mergedAt: pr.merged_at ?? "",
        author: pr.user?.login ?? "",
        files,
      });
    }

    return results;
  } catch (err) {
    core.warning(`PR lookup failed: ${(err as Error).message}`);
    return [];
  }
}

async function fetchPullRequestFiles(
  ctx: GitHubContext,
  token: string,
  prNumber: number
): Promise<ChangedFile[]> {
  const octokit = github.getOctokit(token);
  try {
    const response = await octokit.rest.pulls.listFiles({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: prNumber,
      per_page: 100,
    });
    return response.data.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch,
      blobUrl: f.blob_url,
    }));
  } catch (err) {
    core.warning(`PR files API failed for PR #${prNumber}: ${(err as Error).message}`);
    return [];
  }
}

export async function fetchDeploymentContext(
  ctx: GitHubContext,
  token: string
): Promise<DeploymentContext | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deploymentPayload = ctx.event?.deployment as Record<string, any> | undefined;
  if (!deploymentPayload) return null;

  const octokit = github.getOctokit(token);
  try {
    const deploymentId = deploymentPayload.id as number;
    const statuses = await octokit.rest.repos.listDeploymentStatuses({
      owner: ctx.owner,
      repo: ctx.repo,
      deployment_id: deploymentId,
      per_page: 1,
    });

    const latestStatus = statuses.data[0];
    return {
      id: deploymentId,
      environment: deploymentPayload.environment as string ?? "",
      ref: deploymentPayload.ref as string ?? "",
      sha: deploymentPayload.sha as string ?? ctx.sha,
      state: latestStatus?.state ?? "unknown",
      description: latestStatus?.description ?? "",
      createdAt: deploymentPayload.created_at as string ?? "",
      updatedAt: latestStatus?.updated_at ?? "",
      url: deploymentPayload.url as string ?? "",
      logUrl: latestStatus?.log_url ?? "",
    };
  } catch (err) {
    core.warning(`Deployment context fetch failed: ${(err as Error).message}`);
    return null;
  }
}

export async function fetchFileContent(
  ctx: GitHubContext,
  token: string,
  path: string,
  ref: string,
  maxChars: number
): Promise<string | null> {
  const octokit = github.getOctokit(token);
  try {
    const response = await octokit.rest.repos.getContent({
      owner: ctx.owner,
      repo: ctx.repo,
      path,
      ref,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = response.data as any;
    if (data.type === "file" && data.content) {
      const decoded = Buffer.from(data.content, "base64").toString("utf-8");
      return decoded.slice(0, maxChars);
    }
    return null;
  } catch {
    return null;
  }
}
