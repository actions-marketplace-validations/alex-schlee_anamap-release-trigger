import { ChangedFile } from "../githubApi";

export interface LlmPromptContext {
  repository: string;
  compareBase: string;
  compareHead: string;
  changedFiles: ChangedFile[];
  fileContents: Array<{ path: string; content: string }>;
  impactAreas: string[];
}

export function buildLlmPrompt(ctx: LlmPromptContext): string {
  const fileList = ctx.changedFiles
    .map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
    .join("\n");

  const contentSections = ctx.fileContents
    .map(
      (fc) =>
        `### ${fc.path}\n\`\`\`\n${fc.content}\n\`\`\``
    )
    .join("\n\n");

  return `You are a release analyst. Analyze the following deployment context and produce a structured JSON release brief.

IMPORTANT RULES:
- Use ONLY the supplied context. Do not invent behavior not supported by the evidence.
- Separate observed code changes from inferred impact.
- Output ONLY valid JSON matching the schema below. No markdown, no explanation outside the JSON.
- Mark confidence as "low" when the evidence is weak.
- Identify likely analytics surfaces, customer-facing surfaces, and deployment risks.

SCHEMA:
{
  "summary": "Short release brief in plain English.",
  "userFacingChanges": ["string"],
  "analyticsImplications": ["string"],
  "deploymentImplications": ["string"],
  "likelySurfaces": ["string"],
  "riskFlags": ["string"],
  "confidence": "high" | "medium" | "low",
  "evidence": [{ "file": "string", "reason": "string" }]
}

REPOSITORY: ${ctx.repository}
COMPARE: ${ctx.compareBase}...${ctx.compareHead}
IMPACT AREAS: ${ctx.impactAreas.join(", ") || "unknown"}

CHANGED FILES:
${fileList}

${contentSections ? `FILE CONTENTS:\n${contentSections}` : ""}

Respond with only the JSON object.`;
}
