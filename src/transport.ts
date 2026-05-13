import * as core from "@actions/core";
import { HttpError, DuplicateEventError } from "./errors";
import { ReleasePayload } from "./payloadBuilder";

export interface TransportResult {
  statusCode: number;
  accepted: boolean;
  duplicate: boolean;
  questionId: string;
  investigateBy: string;
  scheduledRunId: string;
  responseBody: string;
}

export async function postPayload(
  baseUrl: string,
  token: string,
  payload: ReleasePayload,
  failOnDuplicate: boolean
): Promise<TransportResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/public/cartos-release-trigger`;
  const bodyJson = JSON.stringify(payload);

  core.debug(`POST ${url} (${bodyJson.length} bytes)`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cartos-release-trigger-token": token,
    },
    body: bodyJson,
  });

  const responseText = await response.text();
  const statusCode = response.status;

  core.debug(`Response ${statusCode}: ${responseText.slice(0, 200)}`);

  if (statusCode === 409) {
    if (failOnDuplicate) {
      throw new DuplicateEventError();
    }
    return {
      statusCode,
      accepted: false,
      duplicate: true,
      questionId: "",
      investigateBy: "",
      scheduledRunId: "",
      responseBody: responseText,
    };
  }

  if (statusCode >= 400) {
    throw new HttpError(statusCode, responseText);
  }

  let questionId = "";
  let investigateBy = "";
  let scheduledRunId = "";

  if (responseText) {
    try {
      const parsed = JSON.parse(responseText) as Record<string, unknown>;
      questionId = String(parsed.questionId ?? parsed.question_id ?? "");
      investigateBy = String(parsed.investigateBy ?? parsed.investigate_by ?? "");
      scheduledRunId = String(
        parsed.scheduledRunId ?? parsed.scheduled_run_id ?? ""
      );
    } catch {
      // non-JSON response body is fine
    }
  }

  return {
    statusCode,
    accepted: statusCode === 202,
    duplicate: false,
    questionId,
    investigateBy,
    scheduledRunId,
    responseBody: responseText,
  };
}
