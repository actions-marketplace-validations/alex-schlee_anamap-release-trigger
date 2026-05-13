import { LlmError } from "../errors";
import { LlmAnalysis, isLlmAnalysis } from "./schema";

export interface LlmProviderConfig {
  provider: "github-models" | "openai" | "disabled";
  model: string;
  apiKey?: string;
}

export async function callLlmProvider(
  config: LlmProviderConfig,
  prompt: string
): Promise<LlmAnalysis> {
  if (config.provider === "disabled") {
    throw new LlmError("LLM provider is disabled.");
  }

  if (config.provider === "openai") {
    return callOpenAI(config.model, config.apiKey ?? "", prompt);
  }

  if (config.provider === "github-models") {
    return callGitHubModels(config.model, config.apiKey ?? "", prompt);
  }

  throw new LlmError(`Unknown LLM provider: ${config.provider}`);
}

async function callOpenAI(
  model: string,
  apiKey: string,
  prompt: string
): Promise<LlmAnalysis> {
  if (!apiKey) {
    throw new LlmError("OpenAI API key is required for provider=openai. Set OPENAI_API_KEY.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a release analyst. Output only valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new LlmError(`OpenAI API error ${response.status}: ${body}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseLlmResponse(content);
}

async function callGitHubModels(
  model: string,
  apiKey: string,
  prompt: string
): Promise<LlmAnalysis> {
  if (!apiKey) {
    throw new LlmError(
      "GitHub token is required for provider=github-models. Pass github-token input."
    );
  }

  const response = await fetch(
    "https://models.inference.ai.azure.com/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a release analyst. Output only valid JSON." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new LlmError(`GitHub Models API error ${response.status}: ${body}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseLlmResponse(content);
}

function parseLlmResponse(content: string): LlmAnalysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new LlmError(`LLM response is not valid JSON: ${content.slice(0, 200)}`);
  }

  if (!isLlmAnalysis(parsed)) {
    throw new LlmError(
      `LLM response does not match expected schema: ${JSON.stringify(parsed).slice(0, 200)}`
    );
  }

  return parsed;
}
