---
name: conversational-analytics-app
description: >-
  Use this skill when the user requests to create, deploy, or manage a conversational analytics application featuring a backend on Google Cloud Run and a web frontend.
type: Agent Skill
title: Conversational Analytics App Guide
tags: [cloud-run, conversational-ai, jetski, python, frontend]
timestamp: 2026-09-15T00:00:00Z
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

### 4.1. Core chat components (input and thread)

- **Input area**: a (usually multiline) text field for the user's natural-language question.
- **Send button**: triggers the call to the API's `chat` method.
- **Message thread**: a scrollable history — user messages typically right-aligned, agent messages left-aligned, rendering plain or formatted text.
- **Session management (sidebar)**: if using stateful conversations, a list of past conversations plus a "New conversation" button to reset context.

### 4.2. Analytics-specific components (crucial for this API)

The API returns structured data and charts, not just text — the UI must interpret them:

- **Markdown renderer**: the agent's text explanations often include Markdown (lists, bold) and must be formatted properly.
- **Data table**: query results come back as tabular data; use a grid component with pagination or scrolling.
- **Vega-Lite renderer** (most important): the API generates visualizations as Vega-Lite JSON. Embed a library (`vega-embed` or a framework-specific wrapper) to turn that JSON into an interactive chart.
- **Transparency/debug drawer** (optional but recommended): a "view query" toggle for technical users to inspect the generated SQL or Python.

### 4.3. Status indicators and UX

Since the API can run heavy queries, handling wait states well matters:

- **"Thinking" indicator**: shows the agent is generating SQL, processing data, or running code.
- **Stop-generation button**: lets the user cancel a long-running request.
- **Streaming updates**: render the message incrementally (typewriter effect) as the stream arrives, rather than waiting for the full response.
- **Error banner**: surface parsing errors, timeouts, or data-access refusals cleanly.

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

## 7. Gotchas & Important API Quirks

When developing with the `geminidataanalytics.googleapis.com` API, keep the following quirks in mind:

- **Looker Credentials & Stateful Conversations Bug:** Passing Looker `credentials` on `ChatRequest` (e.g., `chat_req.credentials = credentials`) works perfectly for stateless conversations. However, if you are using a stateful conversation (`chat_req.conversation_reference.conversation = conv_name`), the backend fails to merge the credentials with the stored agent context and throws `400 request.context.datasource_references.references: invalid value: REFERENCES_NOT_SET`. Until this is fixed, **use stateless conversations** (passing `messages` history from the client) when authenticating Looker with inline credentials.
- **Protobuf Enum Serialization:** When converting responses to JSON via `response.__class__.to_json(response)`, enums are often serialized as integers, not strings. For example, `text_type` will yield `1` (for `FINAL_RESPONSE`) or `2` (for `THOUGHT`). The frontend parsing logic must account for both string and integer values (e.g., `if text_type in ("FINAL_RESPONSE", 1):`).
- **DataAgentContext Types:** The `ChatRequest.data_agent_context` field expects an instance of the `DataAgentContext` class, not a string. Example: `data_agent_context=geminidataanalytics.DataAgentContext(data_agent="projects/...")`.
- **Long-Running Operations (LROs):** `DataAgentServiceClient.create_data_agent()` returns an `Operation` object. You must explicitly wait for it to complete using `response = operation.result()` before you can retrieve the newly created agent's `.name`.

## 8. Stream Event Types and UI Capabilities

When streaming `geminidataanalytics.Message` objects in the `/chat` response, the `system_message` field uses a `oneof` wrapper that dictates what kind of data the agent is returning. You can inspect these fields to build rich, interactive UI components in the frontend:

- **Text (`text`)**: Contains a `text_type` (`1` = `FINAL_RESPONSE`, `2` = `THOUGHT`, `3` = `PROGRESS`) and `parts` containing the actual strings. Render `THOUGHT`s as collapsible logs or italicized "Thinking..." states, and `FINAL_RESPONSE` as the main markdown text.
- **Data (`data`)**: Contains a `DataMessage` with multiple useful properties:
  - `generated_sql`: The exact SQL string generated by the agent. Great for rendering inside a code block (`st.code(sql, language="sql")`) for transparency.
  - `query.looker`: The specific `LookerQuery` (explore, filters, sorts, limit) generated for Looker data sources.
  - `result.data` / `result.formatted_data`: The retrieved rows. You can convert these into a pandas DataFrame and render them as a table (`st.dataframe()`).
  - `big_query_job`: For BQ sources, it contains the `job_id` and `project_id`.
- **Chart (`chart`)**: Contains a `ChartMessage`. Look specifically for `result.vega_config`. This is a fully compliant JSON representation of a Vega-Lite chart. In Streamlit, you can render this natively using `st.vega_lite_chart(vega_config)`.
- **Schema (`schema`)**: Contains a `SchemaMessage`. Useful for showing the user what semantic models or tables the agent decided to look into before querying.
