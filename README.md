# Cartos Release Trigger Action

A GitHub Action that sends a high-context release signal into [Anamap](https://anamaps.com) so Cartos — Anamap's AI release analyst — can run release ownership attribution and impact follow-up.

## What It Does

When a deploy workflow finishes, this action:

1. Collects GitHub workflow and repository context
2. Determines the best release/deploy event identifier
3. Gathers changed-file and compare information via the GitHub API
4. Builds a normalized release payload
5. Optionally enriches the payload with LLM-generated semantic analysis (V2, opt-in)
6. POSTs the payload to Anamap
7. Exposes structured outputs for downstream workflow steps

Cartos then automatically schedules a release investigation 25 hours after receipt across all connected data sources.

## Why It Exists

Cartos needs a precise, structured signal for every production deployment. Without this action, Cartos has no reliable way to know *what* changed, *when* it shipped, and *which surfaces* were affected. This action bridges GitHub deploy pipelines to Anamap's release ownership model.

---

## Quick Start

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Deploy your application
        run: ./deploy.sh

      - name: Notify Cartos
        if: success()
        uses: alex-schlee/anamap-release-trigger@v1
        with:
          company-id: ${{ vars.ANAMAP_COMPANY_ID }}
          trigger-token: ${{ secrets.ANAMAP_RELEASE_TRIGGER_TOKEN }}
```

> **Note:** `fetch-depth: 0` is required to enable the compare API to collect changed-file context.

---

## Required Inputs

| Input | Description |
|-------|-------------|
| `company-id` | Your Anamap company ID (UUID). Store as a repository variable. |
| `trigger-token` | Anamap release trigger token. Store as a repository secret. |

---

## Optional Inputs

### Core

| Input | Default | Description |
|-------|---------|-------------|
| `base-url` | `https://anamaps.com` | Base URL for the Anamap API. |
| `github-token` | `${{ github.token }}` | GitHub token used for API enrichment. |
| `event-mode` | `auto` | How to determine event type. One of: `auto`, `release`, `deployment`, `workflow_run`, `manual`. |
| `environment` | `prod` | Deployment environment name. |
| `change-type` | `unknown` | Type of change: `bug_fix`, `new_feature`, `hotfix`, `chore`, `unknown`. |

### Release Metadata

| Input | Default | Description |
|-------|---------|-------------|
| `release-name` | *(auto)* | Override the human-readable release name. |
| `description` | *(auto)* | Override the release description. |
| `version` | *(auto)* | Semantic version string for this release. |
| `tags` | *(auto)* | Comma-separated list of tags to attach. |
| `event-id` | *(auto)* | Override the deterministic event ID. |

### Compare Range

| Input | Default | Description |
|-------|---------|-------------|
| `compare-base` | *(auto from event)* | Base commit SHA or ref for the compare range. |
| `compare-head` | *(auto from event)* | Head commit SHA or ref for the compare range. |

### Context Collection Flags

| Input | Default | Description |
|-------|---------|-------------|
| `include-release-notes` | `true` | Include release notes when available. |
| `include-changed-files` | `true` | Include changed file inventory. |
| `include-diff-stats` | `true` | Include diff statistics (additions, deletions). |
| `include-pr-context` | `true` | Include associated pull request context. |
| `include-deployment-context` | `true` | Include GitHub deployment context. |
| `include-path-impact-summary` | `true` | Compute path-based impact summary. |

### LLM Enrichment (V2, opt-in)

| Input | Default | Description |
|-------|---------|-------------|
| `include-llm-analysis` | `false` | Enable V2 LLM-assisted semantic analysis. |
| `llm-provider` | `disabled` | LLM provider: `github-models`, `openai`, or `disabled`. |
| `llm-model` | *(provider default)* | Model identifier for the chosen provider. |
| `llm-max-files` | `40` | Max files to include in LLM retrieval context. |
| `llm-max-file-chars` | `12000` | Max characters per file in LLM context. |
| `llm-max-patch-chars` | `40000` | Max total patch characters in LLM context. |

### Payload Limits

| Input | Default | Description |
|-------|---------|-------------|
| `max-changed-files` | `300` | Max changed files in the payload. |
| `max-file-list-chars` | `20000` | Max total characters for the changed file list. |
| `metadata-json` | *(none)* | Extra metadata as a JSON string to merge in. |

### Behavior

| Input | Default | Description |
|-------|---------|-------------|
| `fail-on-duplicate` | `false` | Fail the action if Anamap returns 409 Conflict. |
| `dry-run` | `false` | Build the payload but do not POST it to Anamap. |
| `debug` | `false` | Enable verbose debug logging. |

---

## Outputs

| Output | Description |
|--------|-------------|
| `accepted` | Whether Anamap accepted the release event (`true`/`false`). |
| `status-code` | HTTP status code returned by Anamap. |
| `duplicate` | Whether Anamap reported this as a duplicate event. |
| `question-id` | Anamap question ID created for this release. |
| `investigate-by` | ISO timestamp when Cartos will investigate. |
| `scheduled-run-id` | Anamap scheduled run ID for the deferred investigation. |
| `normalized-event-id` | The deterministic or overridden event ID that was sent. |
| `payload-bytes` | Size in bytes of the JSON payload sent. |
| `request-url` | The full URL the payload was POSTed to. |
| `llm-analysis-included` | Whether LLM-generated analysis was included. |

### Using Outputs

```yaml
- name: Notify Cartos
  id: cartos
  uses: alex-schlee/anamap-release-trigger@v1
  with:
    company-id: ${{ vars.ANAMAP_COMPANY_ID }}
    trigger-token: ${{ secrets.ANAMAP_RELEASE_TRIGGER_TOKEN }}

- name: Log Cartos result
  run: |
    echo "Event ID: ${{ steps.cartos.outputs.normalized-event-id }}"
    echo "Question: ${{ steps.cartos.outputs.question-id }}"
    echo "Investigate by: ${{ steps.cartos.outputs.investigate-by }}"
```

---

## Example Workflows

### Standard Deploy Notification

```yaml
name: Deploy and Notify Cartos

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: prod
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Deploy
        run: ./deploy.sh

      - name: Notify Cartos
        if: success()
        uses: alex-schlee/anamap-release-trigger@v1
        with:
          company-id: ${{ vars.ANAMAP_COMPANY_ID }}
          trigger-token: ${{ secrets.ANAMAP_RELEASE_TRIGGER_TOKEN }}
          environment: prod
          change-type: new_feature
          include-changed-files: true
          include-pr-context: true
```

### Release Event

```yaml
name: Notify Cartos on Release

on:
  release:
    types: [published]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Notify Cartos
        uses: alex-schlee/anamap-release-trigger@v1
        with:
          company-id: ${{ vars.ANAMAP_COMPANY_ID }}
          trigger-token: ${{ secrets.ANAMAP_RELEASE_TRIGGER_TOKEN }}
          event-mode: release
          version: ${{ github.event.release.tag_name }}
          include-release-notes: true
```

### With LLM Analysis (V2)

```yaml
- name: Notify Cartos with LLM
  uses: alex-schlee/anamap-release-trigger@v1
  with:
    company-id: ${{ vars.ANAMAP_COMPANY_ID }}
    trigger-token: ${{ secrets.ANAMAP_RELEASE_TRIGGER_TOKEN }}
    include-llm-analysis: true
    llm-provider: openai
    llm-model: gpt-4o-mini
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

---

## Payload Contract Summary

The action sends a normalized JSON payload to:

```
POST https://anamaps.com/api/public/cartos-release-trigger
```

With header:
```
x-cartos-release-trigger-token: <token>
```

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `companyId` | string | Your Anamap company UUID. |
| `provider` | `"github-actions"` | Fixed value. |
| `eventId` | string | Deterministic event ID. |
| `timestamp` | ISO 8601 | When the action ran. |
| `eventType` | `release` \| `pull_request` \| `deployment` | Normalized event type. |
| `releaseName` | string | Human-readable release name. |
| `description` | string | Release description. |
| `tags` | string[] | Tags for the event. |
| `changeType` | string | Normalized change classification. |
| `version` | string? | Semantic version if available. |
| `environment` | string | Deployment environment. |
| `repository` | object | Owner, name, URL. |
| `commit` | object | SHA and URL. |
| `metadata` | object | Rich context (compare, files, PRs, LLM). |

### Event ID Generation

Event IDs are deterministic so duplicate POSTs are safely de-duped by Anamap:

| Event | Format |
|-------|--------|
| Release | `release:<owner>/<repo>:<tag>` |
| Deployment | `deployment:<owner>/<repo>:<env>:<sha>` |
| Workflow run | `workflow-run:<owner>/<repo>:<run-id>` |
| PR merge | `pr-merge:<owner>/<repo>:<pr-number>:<sha>` |

---

## Duplicate Handling

By default, if Anamap returns `409 Conflict` (duplicate event), the action treats it as non-fatal and logs a warning. This is safe for retries and re-runs.

To fail on duplicates:

```yaml
with:
  fail-on-duplicate: true
```

---

## Dry-Run Mode

When `dry-run: true`, the action:

- Builds the full payload
- Logs a sanitized payload preview
- Sets outputs as if the request was accepted
- Does **not** send any HTTP request

Useful for debugging or validating payload shape before enabling in production:

```yaml
with:
  dry-run: true
  debug: true
```

---

## V2 LLM Mode

When `include-llm-analysis: true`, the action:

1. Ranks changed files by likely importance (routes, pages, API handlers first)
2. Fetches targeted file content at HEAD (capped by `llm-max-file-chars`)
3. Builds a structured retrieval prompt (no raw repo dump)
4. Calls the configured LLM provider
5. Validates the response against the expected JSON schema
6. If validation fails, silently falls back to deterministic V1 metadata

LLM analysis is placed in `metadata.llm`. The top-level `llm-analysis-included` output indicates whether it was included.

**Supported providers:**

| Provider | Input | Required secret |
|----------|-------|-----------------|
| OpenAI | `llm-provider: openai` | `OPENAI_API_KEY` env var |
| GitHub Models | `llm-provider: github-models` | `github-token` with Models access |
| Disabled (default) | `llm-provider: disabled` | *(none)* |

---

## Privacy Notes

- The trigger token is never logged.
- Full workflow context objects are not logged (may contain secrets).
- Payload size is capped.
- LLM enrichment is opt-in and never sends binary files.
- Secrets and env dumps are never forwarded to LLM providers.
- Only file paths and capped content are sent to the LLM.

---

## Versioning Policy

- Immutable release tags: `v1.0.0`, `v1.1.0`, etc.
- Moving major tag: `v1` (always points to the latest v1.x.x release)
- Breaking changes trigger a major version bump and are documented in the release notes.

Use `@v1` for automatic patch/minor updates, or pin to an exact tag for reproducibility.

---

## Development

### Prerequisites

- Node.js 20+
- npm

### Build

```bash
npm install
npm run build
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
```

The compiled `dist/index.js` **must be committed** to the repository for the action to work. After making source changes, run `npm run build` and commit the updated `dist/index.js`.
