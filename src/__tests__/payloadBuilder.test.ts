import { buildEventId, buildPayload } from "../payloadBuilder";
import { GitHubContext } from "../githubContext";
import { ActionInputs } from "../inputs";

function makeCtx(overrides: Partial<GitHubContext> = {}): GitHubContext {
  return {
    eventName: "workflow_run",
    repository: "owner/repo",
    repositoryOwner: "owner",
    ref: "refs/heads/main",
    refName: "main",
    refType: "branch",
    sha: "abc123def456abc123def456",
    actor: "octocat",
    workflow: "deploy",
    runId: "123456789",
    runNumber: "418",
    runAttempt: "1",
    serverUrl: "https://github.com",
    apiUrl: "https://api.github.com",
    event: {},
    owner: "owner",
    repo: "repo",
    ...overrides,
  };
}

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    baseUrl: "https://anamaps.com",
    companyId: "00000000-0000-0000-0000-000000000000",
    triggerToken: "secret",
    githubToken: "ghtoken",
    eventMode: "auto",
    environment: "prod",
    changeType: "unknown",
    releaseName: "",
    description: "",
    version: "",
    tags: [],
    eventId: "",
    compareBase: "",
    compareHead: "",
    metadataJson: "",
    includeReleaseNotes: true,
    includeChangedFiles: true,
    includeDiffStats: true,
    includePrContext: true,
    includeDeploymentContext: true,
    includePathImpactSummary: true,
    includeLlmAnalysis: false,
    llmProvider: "disabled",
    llmModel: "",
    llmMaxFiles: 40,
    llmMaxFileChars: 12000,
    llmMaxPatchChars: 40000,
    maxChangedFiles: 300,
    maxFileListChars: 20000,
    failOnDuplicate: false,
    dryRun: false,
    debug: false,
    ...overrides,
  };
}

describe("buildEventId", () => {
  it("generates a deployment event ID for push events", () => {
    const ctx = makeCtx({ eventName: "push" });
    const inputs = makeInputs();
    const id = buildEventId(inputs, ctx, "deployment");
    expect(id).toMatch(/^deployment:owner\/repo:prod:/);
  });

  it("generates a workflow-run event ID for workflow_run events", () => {
    const ctx = makeCtx({ eventName: "workflow_run", runId: "123456789" });
    const inputs = makeInputs();
    const id = buildEventId(inputs, ctx, "deployment");
    expect(id).toMatch(/^workflow-run:owner\/repo:123456789/);
  });

  it("generates a release event ID for release events", () => {
    const ctx = makeCtx({
      eventName: "release",
      refName: "v1.2.3",
      event: { release: { tag_name: "v1.2.3" } },
    });
    const inputs = makeInputs();
    const id = buildEventId(inputs, ctx, "release");
    expect(id).toBe("release:owner/repo:v1.2.3");
  });

  it("generates a pr-merge event ID for PR events", () => {
    const ctx = makeCtx({
      eventName: "pull_request",
      event: { pull_request: { number: 42 } },
    });
    const inputs = makeInputs();
    const id = buildEventId(inputs, ctx, "pull_request");
    expect(id).toMatch(/^pr-merge:owner\/repo:42:/);
  });

  it("respects explicit event-id override", () => {
    const ctx = makeCtx();
    const inputs = makeInputs({ eventId: "my-custom-event-id" });
    const id = buildEventId(inputs, ctx, "deployment");
    expect(id).toBe("my-custom-event-id");
  });
});

describe("buildPayload", () => {
  it("sets required top-level fields", () => {
    const ctx = makeCtx();
    const inputs = makeInputs();
    const payload = buildPayload(inputs, ctx, null, [], null, null, null, []);

    expect(payload.companyId).toBe("00000000-0000-0000-0000-000000000000");
    expect(payload.provider).toBe("github-actions");
    expect(payload.eventId).toBeTruthy();
    expect(payload.timestamp).toBeTruthy();
    expect(payload.eventType).toBeTruthy();
    expect(payload.releaseName).toBeTruthy();
    expect(payload.description).toBeTruthy();
    expect(Array.isArray(payload.tags)).toBe(true);
    expect(payload.changeType).toBe("unknown");
    expect(payload.environment).toBe("prod");
    expect(payload.repository.owner).toBe("owner");
    expect(payload.repository.name).toBe("repo");
    expect(payload.commit.sha).toBe(ctx.sha);
  });

  it("sets metadata.schemaVersion", () => {
    const ctx = makeCtx();
    const inputs = makeInputs();
    const payload = buildPayload(inputs, ctx, null, [], null, null, null, []);
    expect(payload.metadata.schemaVersion).toBe("2026-05-13");
    expect(payload.metadata.source).toBe("cartos-release-trigger-action");
  });

  it("truncates changed files when exceeding maxChangedFiles", () => {
    const ctx = makeCtx();
    const inputs = makeInputs({ maxChangedFiles: 2 });
    const files = Array.from({ length: 5 }, (_, i) => ({
      filename: `file${i}.ts`,
      status: "modified",
      additions: 1,
      deletions: 0,
      changes: 1,
    }));
    const payload = buildPayload(inputs, ctx, null, [], null, null, null, files);
    expect(payload.metadata.changedFiles.length).toBeLessThanOrEqual(2);
    expect(payload.metadata.changedFilesTruncated).toBe(true);
  });

  it("includes version from input", () => {
    const ctx = makeCtx();
    const inputs = makeInputs({ version: "v2.0.0" });
    const payload = buildPayload(inputs, ctx, null, [], null, null, null, []);
    expect(payload.version).toBe("v2.0.0");
  });

  it("excludes changed files when includeChangedFiles is false", () => {
    const ctx = makeCtx();
    const inputs = makeInputs({ includeChangedFiles: false });
    const files = [
      { filename: "app/index.ts", status: "modified", additions: 1, deletions: 0, changes: 1 },
    ];
    const payload = buildPayload(inputs, ctx, null, [], null, null, null, files);
    expect(payload.metadata.changedFiles).toHaveLength(0);
  });
});
