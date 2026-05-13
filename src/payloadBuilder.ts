import { GitHubContext } from "./githubContext";
import {
  CompareResult,
  PullRequestContext,
  DeploymentContext,
  ChangedFile,
} from "./githubApi";
import { ImpactSummary } from "./classifiers";
import { LlmAnalysis } from "./llm/schema";
import { ActionInputs, EventMode } from "./inputs";

export type EventType = "release" | "pull_request" | "deployment";

export interface ReleasePayload {
  companyId: string;
  provider: "github-actions";
  eventId: string;
  timestamp: string;
  eventType: EventType;
  releaseName: string;
  description: string;
  tags: string[];
  changeType: string;
  version?: string;
  environment: string;
  repository: {
    owner: string;
    name: string;
    url: string;
  };
  commit: {
    sha: string;
    url: string;
  };
  metadata: ReleaseMetadata;
}

export interface ReleaseMetadata {
  schemaVersion: string;
  source: "cartos-release-trigger-action";
  domain: string;
  github: Record<string, string>;
  compare: Partial<CompareResult> | Record<string, never>;
  changedFiles: ChangedFile[];
  changedFilesTruncated: boolean;
  omittedFileCount: number;
  impactSummary: ImpactSummary | Record<string, never>;
  pullRequests: PullRequestContext[];
  release: Record<string, unknown>;
  deployment: Record<string, unknown>;
  llm: LlmAnalysis | Record<string, never>;
  extra: Record<string, unknown>;
}

const SCHEMA_VERSION = "2026-05-13";

function resolveEventType(
  inputs: ActionInputs,
  ctx: GitHubContext
): EventType {
  const mode: EventMode = inputs.eventMode;

  if (mode === "release") return "release";
  if (mode === "deployment") return "deployment";
  if (mode === "workflow_run") return "deployment";
  if (mode === "manual") return "deployment";

  // auto mode
  if (ctx.eventName === "release" && ctx.event?.release) return "release";
  if (
    ctx.eventName === "deployment_status" ||
    ctx.eventName === "deployment"
  ) {
    return "deployment";
  }
  if (ctx.eventName === "pull_request" && ctx.event?.pull_request?.merged) {
    return "pull_request";
  }
  if (ctx.eventName === "push") {
    // If triggered from a workflow that looks like a deploy, use deployment
    const workflowLower = ctx.workflow.toLowerCase();
    if (workflowLower.includes("deploy") || workflowLower.includes("release")) {
      return "deployment";
    }
    return "pull_request";
  }
  return "deployment";
}

export function buildEventId(
  inputs: ActionInputs,
  ctx: GitHubContext,
  eventType: EventType
): string {
  if (inputs.eventId) return inputs.eventId;

  const owner = ctx.owner;
  const repo = ctx.repo;
  const env = inputs.environment;
  const sha = (inputs.compareHead || ctx.sha).slice(0, 12);

  if (eventType === "release") {
    const tag =
      ctx.event?.release?.tag_name ??
      ctx.refName ??
      sha;
    return `release:${owner}/${repo}:${tag}`;
  }

  if (eventType === "pull_request") {
    const prNumber = ctx.event?.pull_request?.number ?? ctx.event?.number ?? "unknown";
    const mergeSha = sha;
    return `pr-merge:${owner}/${repo}:${prNumber}:${mergeSha}`;
  }

  if (ctx.eventName === "workflow_run") {
    return `workflow-run:${owner}/${repo}:${ctx.runId}`;
  }

  return `deployment:${owner}/${repo}:${env}:${sha}`;
}

function buildReleaseName(
  inputs: ActionInputs,
  ctx: GitHubContext,
  eventType: EventType
): string {
  if (inputs.releaseName) return inputs.releaseName;

  const sha = ctx.sha.slice(0, 7);
  const env = inputs.environment;

  if (eventType === "release") {
    const tag = ctx.event?.release?.name ?? ctx.refName ?? sha;
    return `Release ${tag}`;
  }

  if (eventType === "pull_request") {
    const prTitle = ctx.event?.pull_request?.title ?? "";
    if (prTitle) return `PR: ${prTitle}`;
  }

  return `Deploy ${ctx.refName || "main"} ${sha} to ${env}`;
}

function buildDescription(
  inputs: ActionInputs,
  ctx: GitHubContext,
  eventType: EventType
): string {
  if (inputs.description) return inputs.description;

  if (eventType === "release") {
    const body = inputs.includeReleaseNotes
      ? (ctx.event?.release?.body ?? "")
      : "";
    if (body) return body.slice(0, 500);
    return "Release published via GitHub Actions.";
  }

  if (eventType === "pull_request") {
    return "Pull request merged via GitHub Actions.";
  }

  return "Deployment completed successfully from GitHub Actions.";
}

function buildTags(
  inputs: ActionInputs,
  ctx: GitHubContext,
  eventType: EventType
): string[] {
  const base = new Set<string>([
    eventType,
    inputs.environment,
    ...inputs.tags,
  ]);

  if (ctx.refName) base.add(ctx.refName.replace(/[^a-zA-Z0-9._-]/g, "-"));
  if (inputs.changeType !== "unknown") base.add(inputs.changeType);

  return Array.from(base).filter(Boolean);
}

export function buildPayload(
  inputs: ActionInputs,
  ctx: GitHubContext,
  compare: CompareResult | null,
  pullRequests: PullRequestContext[],
  deploymentCtx: DeploymentContext | null,
  impactSummary: ImpactSummary | null,
  llmAnalysis: LlmAnalysis | null,
  allChangedFiles: ChangedFile[]
): ReleasePayload {
  const eventType = resolveEventType(inputs, ctx);
  const eventId = buildEventId(inputs, ctx, eventType);
  const releaseName = buildReleaseName(inputs, ctx, eventType);
  const description = buildDescription(inputs, ctx, eventType);
  const tags = buildTags(inputs, ctx, eventType);

  // Truncation
  const maxFiles = inputs.maxChangedFiles;
  let truncated = allChangedFiles.length > maxFiles;
  const omittedFileCount = Math.max(0, allChangedFiles.length - maxFiles);
  let files = allChangedFiles.slice(0, maxFiles);

  // Also enforce max chars
  let totalChars = 0;
  const charsLimitedFiles: ChangedFile[] = [];
  for (const f of files) {
    const chars = JSON.stringify(f).length;
    if (totalChars + chars > inputs.maxFileListChars) {
      truncated = true;
      break;
    }
    charsLimitedFiles.push(f);
    totalChars += chars;
  }
  files = charsLimitedFiles;

  const githubMeta: Record<string, string> = {
    eventName: ctx.eventName,
    repository: ctx.repository,
    runId: ctx.runId,
    runNumber: ctx.runNumber,
    runAttempt: ctx.runAttempt,
    workflow: ctx.workflow,
    actor: ctx.actor,
    ref: ctx.ref,
    refName: ctx.refName,
    sha: ctx.sha,
    serverUrl: ctx.serverUrl,
    apiUrl: ctx.apiUrl,
  };

  const compareMeta: Partial<CompareResult> | Record<string, never> = compare
    ? {
        base: compare.base,
        head: compare.head,
        url: compare.url,
        commits: compare.commits,
        files: compare.files,
        additions: compare.additions,
        deletions: compare.deletions,
        changes: compare.changes,
      }
    : {};

  const releaseData: Record<string, unknown> = {};
  if (ctx.event?.release) {
    const r = ctx.event.release;
    releaseData.tagName = r.tag_name;
    releaseData.name = r.name;
    releaseData.draft = r.draft;
    releaseData.prerelease = r.prerelease;
    releaseData.createdAt = r.created_at;
    releaseData.publishedAt = r.published_at;
    if (inputs.includeReleaseNotes && r.body) {
      releaseData.body = String(r.body).slice(0, 2000);
    }
  }

  const deploymentData: Record<string, unknown> = deploymentCtx
    ? {
        id: deploymentCtx.id,
        environment: deploymentCtx.environment,
        ref: deploymentCtx.ref,
        sha: deploymentCtx.sha,
        state: deploymentCtx.state,
        createdAt: deploymentCtx.createdAt,
        updatedAt: deploymentCtx.updatedAt,
        logUrl: deploymentCtx.logUrl,
      }
    : {};

  let extraMeta: Record<string, unknown> = {};
  if (inputs.metadataJson) {
    try {
      extraMeta = JSON.parse(inputs.metadataJson) as Record<string, unknown>;
    } catch {
      // already validated in inputs.ts
    }
  }

  const metadata: ReleaseMetadata = {
    schemaVersion: SCHEMA_VERSION,
    source: "cartos-release-trigger-action",
    domain: inputs.baseUrl,
    github: githubMeta,
    compare: inputs.includeDiffStats ? compareMeta : {},
    changedFiles: inputs.includeChangedFiles ? files : [],
    changedFilesTruncated: truncated,
    omittedFileCount,
    impactSummary:
      inputs.includePathImpactSummary && impactSummary ? impactSummary : {},
    pullRequests: inputs.includePrContext ? pullRequests : [],
    release: releaseData,
    deployment: inputs.includeDeploymentContext ? deploymentData : {},
    llm: llmAnalysis ?? {},
    extra: extraMeta,
  };

  const payload: ReleasePayload = {
    companyId: inputs.companyId,
    provider: "github-actions",
    eventId,
    timestamp: new Date().toISOString(),
    eventType,
    releaseName,
    description,
    tags,
    changeType: inputs.changeType,
    environment: inputs.environment,
    repository: {
      owner: ctx.owner,
      name: ctx.repo,
      url: `${ctx.serverUrl}/${ctx.repository}`,
    },
    commit: {
      sha: ctx.sha,
      url: `${ctx.serverUrl}/${ctx.repository}/commit/${ctx.sha}`,
    },
    metadata,
  };

  if (inputs.version) {
    payload.version = inputs.version;
  } else if (ctx.event?.release?.tag_name) {
    payload.version = ctx.event.release.tag_name as string;
  }

  return payload;
}
