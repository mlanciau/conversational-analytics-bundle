---
name: conversational-analytics-app
description: >-
  Use this skill when the user requests to create, deploy, or manage a conversational analytics application featuring a backend on Google Cloud Run and a web frontend.
type: Agent Skill
title: Conversational Analytics App Guide
resource: file:///Users/mlanciau/New_Repo/conversational-analytics-bundle/skills/conversational-analytics-app
tags: [cloud-run, conversational-ai, jetski, python, frontend]
timestamp: 2026-09-11T00:00:00Z
---

# Conversational Analytics Application Guide

This skill provides instructions and best practices for building a conversational analytics application with a backend deployed on Google Cloud Run and a frontend. The AI service to use is the **Conversational Analytics API**: `geminidataanalytics.googleapis.com` ([overview](https://docs.cloud.google.com/gemini/data-agents/conversational-analytics-api/overview)).

## 0. Requirements Gathering & Scaffolding Preferences

Before writing any code, ask the user to clarify:

- **Tech stack**
  1. Frontend framework: React + Vite, Next.js, Streamlit, or other?
  2. Backend language/framework: Python (FastAPI/Flask) or Node.js (Express)?
  3. Authentication: Google Cloud IAP, Firebase Auth, or public/unauthenticated?
  4. GCP project ID and region.
- **Data agent context**
  1. Primary data source: BigQuery, Looker, or Looker Studio (full agent API, with visualizations) — or AlloyDB, Spanner, or Cloud SQL (the separate `QueryData` method, beta, **no visualization support**)? This choice changes the implementation path, so confirm it before scaffolding — see §2.6.
  2. Specific tables, views, or Looker explores the agent should connect to.
  3. Business definitions and **golden queries** the agent should know (see §2), plus whether a semantic layer (LookML, or structured YAML metadata for BigQuery-only) already exists — semantic layers meaningfully improve query accuracy and are worth building if the agent will run non-trivial queries.
  4. Default behaviors/filters the agent must always apply (e.g. "filter to the most recent quarter").
- **Persistence model**: does the app need a reusable `DataAgent` resource (context published once, referenced by ID), or is stateless inline context per request sufficient? This affects whether `DataAgentServiceClient` is needed in addition to `DataChatServiceClient` (see §2).
- **Scaffolding location**: ask whether generated files should go into a `bundle/` directory (untracked by git) or elsewhere. Do not scaffold into the root workspace without confirming the location first.

## 1. Architecture Overview

- **Backend:** A containerized service (Python/FastAPI or Flask, or Node.js/Express) exposing a REST API that wraps the Conversational Analytics API and streams responses back to the frontend.
- **Frontend:** A web app (React, Next.js, or Streamlit) providing the chat UI and rendering the agent's text, generated SQL, tables, and charts.
- **Deployment:** The backend runs on Google Cloud Run for serverless autoscaling; the frontend can be static-hosted (Firebase Hosting, Cloud Storage + CDN) or served by the same container.
- **Data agent:** Either a **persistent `DataAgent`** resource (context authored once via `DataAgentServiceClient`, then referenced by ID on every chat call) or **stateless inline context** (the full `Context` object sent on every `chat()` call). Prefer a persistent agent when context (golden queries, business definitions) is stable and reused across users; use inline context for quick prototypes or per-user/per-session customization.
- **Conversation state (independent choice from the above):** chats can be **stateful** — Cloud manages turn history in a persistent `Conversation` resource, referenced across requests — or **stateless** — the client resends prior turns with every request. See §2.5.

## 2. Data Agent Context (BigQuery, Looker & Other Sources)

Use the `google-cloud-geminidataanalytics` Python package (`from google.cloud import geminidataanalytics`).

### 2.1 BigQuery data sources

```python
from google.cloud import geminidataanalytics

bigquery_table_reference = geminidataanalytics.BigQueryTableReference()
bigquery_table_reference.project_id = "PROJECT_ID"
bigquery_table_reference.dataset_id = "DATASET_ID"
bigquery_table_reference.table_id = "TABLE_ID"

datasource_references = geminidataanalytics.DatasourceReferences()
datasource_references.bq.table_references = [bigquery_table_reference]
```

Golden queries for BigQuery use `example_queries` on the `Context`:

```python
example_query = geminidataanalytics.ExampleQuery()
example_query.natural_language_question = "Who are our top 10 customers by revenue?"
example_query.sql_query = "SELECT customer_id, SUM(revenue) ... ORDER BY 2 DESC LIMIT 10"
```

### 2.2 Looker data sources

```python
looker_explore_reference = geminidataanalytics.LookerExploreReference()
looker_explore_reference.looker_instance_uri = LOOKER_INSTANCE
looker_explore_reference.lookml_model = LOOKER_MODEL
looker_explore_reference.explore = LOOKER_EXPLORE

datasource_references = geminidataanalytics.DatasourceReferences()
datasource_references.looker.explore_references = [looker_explore_reference]
```

**Looker authentication** — pick one and read secrets from environment variables / Secret Manager, never hardcode:
- **Access token** (short-lived, obtained via the caller's Looker session): `credentials.oauth.token.access_token = os.getenv("LOOKER_ACCESS_TOKEN")`.
- **OAuth client credentials** (service-to-service): `credentials.oauth.secret.client_id` / `credentials.oauth.secret.client_secret`.
- **API key** (Looker client ID/secret pair, not an access token): simplest for prototypes and what the official `ca-api-quickstarts` sample uses; prefer OAuth for production service-to-service auth.

If the Looker instance requires encryption-at-rest guarantees beyond Google-managed defaults, note that Looker data sources support **customer-managed encryption keys (CMEK)** — flag this during requirements gathering if the org has a CMEK policy.

Golden queries for Looker use `looker_golden_queries` (natural-language question + the corresponding Looker query) instead of `example_queries`.

### 2.3 Context and system instructions

```python
context = geminidataanalytics.Context()
context.system_instruction = (
    "You are a data analyst for <company>. Always filter to the most recent "
    "complete quarter unless the user specifies otherwise. Define 'top performer' as ..."
)
context.datasource_references = datasource_references
context.example_queries = [example_query]  # BigQuery only
```

For a **persistent** agent, wrap this in `data_agent.data_analytics_agent.published_context` and create it once via `DataAgentServiceClient.create_data_agent()`; subsequent chat calls reference it by `data_agent_context` (agent name) instead of re-sending the full context.

**Sharing a persistent agent:** a `DataAgent` is a project/location-scoped resource, so grant other users or service accounts access with `DataAgentServiceClient.set_iam_policy()` (and inspect with `get_iam_policy()`) rather than sharing project-wide roles.

### 2.4 Chat calls are streamed

`DataChatServiceClient.chat()` returns a stream of `Message` objects, not a single response. Each message carries a type such as `THOUGHT`, `PROGRESS`, or `FINAL_RESPONSE`, and may include structured data or a chart/visualization spec:

```python
messages = [geminidataanalytics.Message()]
messages[0].user_message.text = user_text

request = geminidataanalytics.ChatRequest(
    parent=f"projects/{project_id}/locations/{location}",
    messages=messages,
    data_agent_context=data_agent_context,  # or inline `context`
)

for response in data_chat_client.chat(request=request, timeout=300):
    forward_to_frontend(response)  # relay incrementally, e.g. via SSE/WebSocket
```

Because a single turn can take tens of seconds and arrives incrementally, the backend **must** relay the stream to the frontend as it arrives (Server-Sent Events or WebSocket) rather than buffering the whole response — see §4.

### 2.5 Conversation state: stateful vs. stateless

Orthogonal to persistent vs. inline **context** (§1) is how **turn history** is managed:

- **Stateful:** create a `Conversation` resource once (`DataChatServiceClient.create_conversation()`), then pass its name in `ChatRequest.conversation_reference.conversation` on every turn. Google Cloud stores and replays prior turns server-side — simplest for a backend that just needs multi-turn follow-ups ("now break that down by region") without managing history itself. List/get/delete conversations via the same client to let users resume or clear past sessions.
- **Stateless:** the client resends the full turn history (as a list of `Message` objects) with every `chat()` call via `conversation_reference.data_chat_context`. Gives the backend full control (e.g. to prune, redact, or persist history in its own store) at the cost of managing it manually.

Default to stateful unless there's a specific reason to own history client-side (e.g. custom persistence, redaction before storage, or a stateless/serverless backend that shouldn't hold session affinity).

### 2.6 Non-visualization data sources: the `QueryData` method (beta)

AlloyDB, Spanner (GoogleSQL), Cloud SQL, and Cloud SQL for PostgreSQL are **not** wired through `DataChatServiceClient.chat()` the way BigQuery/Looker/Looker Studio are. They use the separate, beta **`QueryData`** method instead, and it has real limitations to set expectations on up front:
- No chart/visualization generation — responses are text and structured data only.
- Treat it as a fit for direct NL-to-SQL query answers, not for the richer conversational-agent UX (`THOUGHT`/`PROGRESS` streaming, visualizations) described in §2.4.

If the user's primary source is one of these databases, confirm during requirements gathering (§0) that the reduced feature set is acceptable before scaffolding a full chat UI around it.

## 3. Backend Development & Deployment (Cloud Run)

- Listen on the port from the `PORT` environment variable (default 8080).
- Include a `Dockerfile` that containerizes the backend.
- Propagate the Conversational Analytics stream to the client incrementally (SSE endpoint or WebSocket) instead of collecting it into one JSON response — Cloud Run supports long-lived HTTP connections but has a request timeout (default 300s, configurable up to 60 minutes); set `--timeout` accordingly for long-running chats.
- Deploy with `gcloud`:
  ```bash
  gcloud run deploy <service-name> \
    --source . \
    --region <region> \
    --timeout 300 \
    --allow-unauthenticated   # omit / replace with --no-allow-unauthenticated + IAM/IAP if auth is required
  ```
- **Secrets & config:** store API keys, Looker credentials, and other secrets in Google Cloud Secret Manager, mount them as env vars or volumes, and grant the Cloud Run service account `roles/secretmanager.secretAccessor` plus whatever IAM roles the data source requires (e.g. `roles/bigquery.dataViewer`, `roles/bigquery.jobUser`). Never commit secrets or `.env` files to git.
- **Least privilege:** grant the Cloud Run service account only the roles needed for the specific datasets/explores in scope — avoid project-wide `roles/bigquery.admin` or similar broad grants.
- **Cost controls:** for BigQuery-backed agents, set spending limits (custom quotas or `maximum_bytes_billed`) at the project, user, and/or per-query level — a conversational agent can generate exploratory queries a human wouldn't, and an unbounded scan on a large table is easy to trigger by accident.

## 4. Frontend Development

- Configure the frontend to call the Cloud Run backend's streaming endpoint and render messages incrementally as they arrive (e.g. show `THOUGHT`/`PROGRESS` as a "thinking..." indicator, then replace with `FINAL_RESPONSE` content, tables, and charts).
- Implement robust error handling and loading states — AI processing and analytics queries can take several seconds to over a minute, and the connection can drop mid-stream.
- Preserve a `conversation_id`/session reference across turns so multi-turn context (e.g. "now break that down by region") is maintained, if the backend uses stateful conversations.
- **CORS:** ensure the backend explicitly allows the frontend's origin.

## 5. Testing & Local Development

- Run the backend locally with Application Default Credentials (`gcloud auth application-default login`) before deploying, and verify against a low-cost/sandboxed dataset.
- Add a smoke-test script or `curl`/`httpie` example that sends one chat turn and confirms a `FINAL_RESPONSE` is received, so regressions in datasource config or auth are caught before deployment.
- If a persistent `DataAgent` is used, note its resource name/ID somewhere in the repo (e.g. `README` or `.env.example`) so it doesn't need to be recreated by hand each time.

## 6. Troubleshooting

- **Cloud Run logs:**
  ```bash
  gcloud run services logs tail <service-name> --region <region>
  ```
- **Auth errors:** confirm Application Default Credentials (local) or the Cloud Run service account (deployed) has the IAM roles needed for both the Conversational Analytics API and the underlying data source (BigQuery/Looker).
- **Looker auth failures:** verify the access token or OAuth client credentials haven't expired and that `LOOKER_ACCESS_TOKEN` (or equivalent secret) is actually injected into the running container, not just set locally.
- **Timeouts / truncated responses:** check the Cloud Run `--timeout` setting and any frontend/proxy timeout — long analytical queries can exceed default limits.
- **Quota errors:** the Conversational Analytics API and underlying BigQuery jobs are subject to project quotas; check Cloud Console quota pages if requests are being rejected under load.
- **Output correctness:** this is early-stage technology — generated SQL/analysis can be wrong even when the response looks confident. Surface generated SQL to users (don't hide it) and encourage spot-checking results against a trusted source before they're used for a decision; don't present agent output as ground truth.
