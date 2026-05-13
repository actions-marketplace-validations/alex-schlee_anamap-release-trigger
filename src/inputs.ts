import * as core from "@actions/core";
import { InputValidationError } from "./errors";

export type EventMode =
  | "auto"
  | "release"
  | "deployment"
  | "workflow_run"
  | "manual";
export type ChangeType =
  | "bug_fix"
  | "new_feature"
  | "hotfix"
  | "chore"
  | "unknown";
export type LlmProvider = "github-models" | "openai" | "disabled";

export interface ActionInputs {
  baseUrl: string;
  companyId: string;
  triggerToken: string;
  githubToken: string;
  eventMode: EventMode;
  environment: string;
  changeType: ChangeType;
  releaseName: string;
  description: string;
  version: string;
  tags: string[];
  eventId: string;
  compareBase: string;
  compareHead: string;
  metadataJson: string;
  includeReleaseNotes: boolean;
  includeChangedFiles: boolean;
  includeDiffStats: boolean;
  includePrContext: boolean;
  includeDeploymentContext: boolean;
  includePathImpactSummary: boolean;
  includeLlmAnalysis: boolean;
  llmProvider: LlmProvider;
  llmModel: string;
  llmMaxFiles: number;
  llmMaxFileChars: number;
  llmMaxPatchChars: number;
  maxChangedFiles: number;
  maxFileListChars: number;
  failOnDuplicate: boolean;
  dryRun: boolean;
  debug: boolean;
}

const VALID_EVENT_MODES: EventMode[] = [
  "auto",
  "release",
  "deployment",
  "workflow_run",
  "manual",
];
const VALID_CHANGE_TYPES: ChangeType[] = [
  "bug_fix",
  "new_feature",
  "hotfix",
  "chore",
  "unknown",
];
const VALID_LLM_PROVIDERS: LlmProvider[] = [
  "github-models",
  "openai",
  "disabled",
];

function getPositiveInt(name: string, defaultValue: number): number {
  const raw = core.getInput(name);
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 1) {
    throw new InputValidationError(
      `Input "${name}" must be a positive integer, got: "${raw}"`
    );
  }
  return parsed;
}

function getBoolInput(name: string): boolean {
  return core.getInput(name).toLowerCase() === "true";
}

export function parseInputs(): ActionInputs {
  const companyId = core.getInput("company-id", { required: true }).trim();
  if (!companyId) {
    throw new InputValidationError("Input 'company-id' is required.");
  }

  const triggerToken = core
    .getInput("trigger-token", { required: true })
    .trim();
  if (!triggerToken) {
    throw new InputValidationError("Input 'trigger-token' is required.");
  }

  const baseUrl = (
    core.getInput("base-url") || "https://anamaps.com"
  ).trim();
  try {
    new URL(baseUrl);
  } catch {
    throw new InputValidationError(
      `Input 'base-url' is not a valid URL: "${baseUrl}"`
    );
  }

  const rawEventMode = (core.getInput("event-mode") || "auto").trim();
  if (!VALID_EVENT_MODES.includes(rawEventMode as EventMode)) {
    throw new InputValidationError(
      `Input 'event-mode' must be one of ${VALID_EVENT_MODES.join(", ")}, got: "${rawEventMode}"`
    );
  }

  const rawChangeType = (core.getInput("change-type") || "unknown").trim();
  if (!VALID_CHANGE_TYPES.includes(rawChangeType as ChangeType)) {
    throw new InputValidationError(
      `Input 'change-type' must be one of ${VALID_CHANGE_TYPES.join(", ")}, got: "${rawChangeType}"`
    );
  }

  const rawLlmProvider = (
    core.getInput("llm-provider") || "disabled"
  ).trim();
  if (!VALID_LLM_PROVIDERS.includes(rawLlmProvider as LlmProvider)) {
    throw new InputValidationError(
      `Input 'llm-provider' must be one of ${VALID_LLM_PROVIDERS.join(", ")}, got: "${rawLlmProvider}"`
    );
  }

  const rawTags = core.getInput("tags").trim();
  const tags = rawTags
    ? rawTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const metadataJson = core.getInput("metadata-json").trim();
  if (metadataJson) {
    try {
      JSON.parse(metadataJson);
    } catch {
      throw new InputValidationError(
        "Input 'metadata-json' is not valid JSON."
      );
    }
  }

  return {
    baseUrl,
    companyId,
    triggerToken,
    githubToken: core.getInput("github-token") || process.env.GITHUB_TOKEN || "",
    eventMode: rawEventMode as EventMode,
    environment: (core.getInput("environment") || "prod").trim(),
    changeType: rawChangeType as ChangeType,
    releaseName: core.getInput("release-name").trim(),
    description: core.getInput("description").trim(),
    version: core.getInput("version").trim(),
    tags,
    eventId: core.getInput("event-id").trim(),
    compareBase: core.getInput("compare-base").trim(),
    compareHead: core.getInput("compare-head").trim(),
    metadataJson,
    includeReleaseNotes: getBoolInput("include-release-notes"),
    includeChangedFiles: getBoolInput("include-changed-files"),
    includeDiffStats: getBoolInput("include-diff-stats"),
    includePrContext: getBoolInput("include-pr-context"),
    includeDeploymentContext: getBoolInput("include-deployment-context"),
    includePathImpactSummary: getBoolInput("include-path-impact-summary"),
    includeLlmAnalysis: getBoolInput("include-llm-analysis"),
    llmProvider: rawLlmProvider as LlmProvider,
    llmModel: core.getInput("llm-model").trim(),
    llmMaxFiles: getPositiveInt("llm-max-files", 40),
    llmMaxFileChars: getPositiveInt("llm-max-file-chars", 12000),
    llmMaxPatchChars: getPositiveInt("llm-max-patch-chars", 40000),
    maxChangedFiles: getPositiveInt("max-changed-files", 300),
    maxFileListChars: getPositiveInt("max-file-list-chars", 20000),
    failOnDuplicate: getBoolInput("fail-on-duplicate"),
    dryRun: getBoolInput("dry-run"),
    debug: getBoolInput("debug"),
  };
}
