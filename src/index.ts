import * as core from "@actions/core";
import { parseInputs } from "./inputs";
import { harvestGitHubContext } from "./githubContext";
import {
  fetchCompare,
  fetchPullRequestsForCommit,
  fetchDeploymentContext,
} from "./githubApi";
import { buildImpactSummary } from "./classifiers";
import { buildPayload, buildEventId, ReleasePayload } from "./payloadBuilder";
import { runLlmAnalysis } from "./llm/planner";
import { postPayload, TransportResult } from "./transport";
import { setOutputs } from "./outputs";
import {
  InputValidationError,
  HttpError,
  DuplicateEventError,
} from "./errors";

async function run(): Promise<void> {
  try {
    // 1. Parse and validate inputs
    const inputs = parseInputs();

    if (inputs.debug) {
      core.debug("Inputs parsed successfully.");
    }

    // 2. Harvest GitHub context
    const ctx = harvestGitHubContext();

    if (inputs.debug) {
      core.debug(
        `GitHub context: event=${ctx.eventName} repo=${ctx.repository} sha=${ctx.sha.slice(0, 8)}`
      );
    }

    // 3. Resolve compare range
    const compareBase =
      inputs.compareBase ||
      ctx.event?.before ||
      ctx.event?.release?.target_commitish ||
      "";
    const compareHead =
      inputs.compareHead || ctx.sha || "";

    // 4. Fetch GitHub enrichment data in parallel
    const token = inputs.githubToken;

    const [compare, pullRequests, deploymentCtx] = await Promise.all([
      inputs.includeChangedFiles || inputs.includeDiffStats
        ? fetchCompare(
            ctx,
            token,
            compareBase,
            compareHead,
            inputs.maxChangedFiles,
            inputs.maxFileListChars
          )
        : Promise.resolve(null),

      inputs.includePrContext && token
        ? fetchPullRequestsForCommit(ctx, token, ctx.sha)
        : Promise.resolve([]),

      inputs.includeDeploymentContext && token
        ? fetchDeploymentContext(ctx, token)
        : Promise.resolve(null),
    ]);

    // 5. Build changed file list (prefer compare, fall back to PR files)
    const allChangedFiles =
      compare?.changedFiles ??
      pullRequests.flatMap((pr) => pr.files);

    // 6. Compute path-based impact summary
    const impactSummary =
      inputs.includePathImpactSummary && allChangedFiles.length > 0
        ? buildImpactSummary(allChangedFiles.map((f) => f.filename))
        : null;

    // 7. LLM analysis (V2, disabled by default)
    const llmAnalysis = inputs.includeLlmAnalysis
      ? await runLlmAnalysis(ctx, inputs, allChangedFiles)
      : null;

    // 8. Build normalized payload
    const payload: ReleasePayload = buildPayload(
      inputs,
      ctx,
      compare,
      pullRequests,
      deploymentCtx,
      impactSummary,
      llmAnalysis,
      allChangedFiles
    );

    const payloadJson = JSON.stringify(payload, null, 2);
    const payloadBytes = Buffer.byteLength(payloadJson, "utf-8");
    const requestUrl = `${inputs.baseUrl.replace(/\/$/, "")}/api/public/cartos-release-trigger`;

    core.info(`Event ID: ${payload.eventId}`);
    core.info(`Event type: ${payload.eventType}`);
    core.info(`Release name: ${payload.releaseName}`);
    core.info(`Changed files: ${allChangedFiles.length}`);
    core.info(`Payload size: ${payloadBytes} bytes`);

    // 9. Dry-run mode
    if (inputs.dryRun) {
      core.info("DRY RUN — payload will not be sent.");

      // Sanitize: redact token from debug output
      const sanitizedPayload = {
        ...payload,
        // show a snippet so operators can verify shape
        metadata: {
          ...payload.metadata,
          // changedFiles might be large; summarize
          changedFiles: payload.metadata.changedFiles.map((f) => f.filename),
        },
      };
      core.info(`Payload preview:\n${JSON.stringify(sanitizedPayload, null, 2)}`);

      setOutputs(null, payload, payloadBytes, requestUrl, llmAnalysis !== null, true);
      return;
    }

    // 10. POST to Anamap
    let result: TransportResult;
    try {
      result = await postPayload(
        inputs.baseUrl,
        inputs.triggerToken,
        payload,
        inputs.failOnDuplicate
      );
    } catch (err) {
      if (err instanceof DuplicateEventError) {
        core.setFailed(err.message);
        return;
      }
      if (err instanceof HttpError) {
        core.setFailed(
          `Anamap returned ${err.statusCode}: ${err.responseBody.slice(0, 500)}`
        );
        return;
      }
      throw err;
    }

    core.info(
      `Anamap responded: ${result.statusCode} ${result.accepted ? "accepted" : result.duplicate ? "duplicate" : "other"}`
    );

    if (result.duplicate) {
      core.warning(
        `Anamap returned 409 Conflict. This event may have already been processed (eventId=${payload.eventId}). Treating as non-fatal.`
      );
    }

    setOutputs(
      result,
      payload,
      payloadBytes,
      requestUrl,
      llmAnalysis !== null,
      false
    );
  } catch (err) {
    if (err instanceof InputValidationError) {
      core.setFailed(`Input validation error: ${err.message}`);
      return;
    }
    core.setFailed(
      `Unexpected error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

run();
