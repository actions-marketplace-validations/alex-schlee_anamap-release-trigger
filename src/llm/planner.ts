import * as core from "@actions/core";
import { GitHubContext } from "../githubContext";
import { ChangedFile, fetchFileContent } from "../githubApi";
import { classifyPaths } from "../classifiers";
import { ActionInputs } from "../inputs";
import { buildLlmPrompt } from "./prompt";
import { callLlmProvider } from "./providers";
import { LlmAnalysis } from "./schema";

interface RankedFile {
  file: ChangedFile;
  tier: number;
}

function rankFiles(files: ChangedFile[]): RankedFile[] {
  return files
    .map((f) => ({
      file: f,
      tier: getTier(f.filename),
    }))
    .sort((a, b) => a.tier - b.tier);
}

function getTier(filename: string): number {
  if (
    /\.(vue|tsx?|jsx?)$/.test(filename) &&
    /(pages|routes|api|controllers|handlers|deploy|infra|migrations?)/.test(filename)
  ) {
    return 1;
  }
  if (/(shared|utils|helpers|packages|index\.)/.test(filename)) {
    return 2;
  }
  return 3;
}

function isBinaryFile(filename: string): boolean {
  return /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip|tar|gz|lock)$/i.test(
    filename
  );
}

export async function runLlmAnalysis(
  ctx: GitHubContext,
  inputs: ActionInputs,
  changedFiles: ChangedFile[]
): Promise<LlmAnalysis | null> {
  if (!inputs.includeLlmAnalysis || inputs.llmProvider === "disabled") {
    return null;
  }

  const ranked = rankFiles(changedFiles.filter((f) => !isBinaryFile(f.filename)));
  const topFiles = ranked.slice(0, inputs.llmMaxFiles);

  const fileContents: Array<{ path: string; content: string }> = [];
  let totalPatchChars = 0;

  for (const rf of topFiles) {
    if (totalPatchChars >= inputs.llmMaxPatchChars) break;
    if (!inputs.githubToken) continue;

    const content = await fetchFileContent(
      ctx,
      inputs.githubToken,
      rf.file.filename,
      ctx.sha,
      inputs.llmMaxFileChars
    );

    if (content) {
      const remaining = inputs.llmMaxPatchChars - totalPatchChars;
      const capped = content.slice(0, Math.min(inputs.llmMaxFileChars, remaining));
      fileContents.push({ path: rf.file.filename, content: capped });
      totalPatchChars += capped.length;
    }
  }

  const impactAreas = classifyPaths(topFiles.map((rf) => rf.file.filename));

  const apiKey =
    inputs.llmProvider === "openai"
      ? process.env.OPENAI_API_KEY ?? ""
      : inputs.githubToken;

  const prompt = buildLlmPrompt({
    repository: ctx.repository,
    compareBase: inputs.compareBase || ctx.sha,
    compareHead: ctx.sha,
    changedFiles: topFiles.map((rf) => rf.file),
    fileContents,
    impactAreas,
  });

  try {
    const result = await callLlmProvider(
      { provider: inputs.llmProvider, model: inputs.llmModel, apiKey },
      prompt
    );
    return result;
  } catch (err) {
    core.warning(`LLM analysis failed and will be skipped: ${(err as Error).message}`);
    return null;
  }
}
