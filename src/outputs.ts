import * as core from "@actions/core";
import { TransportResult } from "./transport";
import { ReleasePayload } from "./payloadBuilder";

export function setOutputs(
  result: TransportResult | null,
  payload: ReleasePayload,
  payloadBytes: number,
  requestUrl: string,
  llmAnalysisIncluded: boolean,
  dryRun: boolean
): void {
  const accepted = dryRun ? true : (result?.accepted ?? false);

  core.setOutput("accepted", String(accepted));
  core.setOutput("status-code", String(result?.statusCode ?? ""));
  core.setOutput("duplicate", String(result?.duplicate ?? false));
  core.setOutput("question-id", result?.questionId ?? "");
  core.setOutput("investigate-by", result?.investigateBy ?? "");
  core.setOutput("scheduled-run-id", result?.scheduledRunId ?? "");
  core.setOutput("normalized-event-id", payload.eventId);
  core.setOutput("payload-bytes", String(payloadBytes));
  core.setOutput("request-url", requestUrl);
  core.setOutput("llm-analysis-included", String(llmAnalysisIncluded));
}
