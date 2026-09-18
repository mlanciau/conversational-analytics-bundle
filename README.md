---
type: Overview
title: Conversational Analytics Bundle
description: Jetski skills, agents, and configurations to build conversational analytics applications on Google Cloud Run.
tags: [jetski, google-cloud, cloud-run, conversational-ai, analytics]
timestamp: 2026-09-18T00:00:00Z
---

# Conversational Analytics Bundle

This repository hosts skills, agents, and configurations to help AI coding assistants build and manage conversational analytics applications hosted on Google Cloud Run.

## Overview

Building a conversational analytics application typically involves:
- A containerized backend service to process analytics and interact with conversational AI models (e.g., Gemini API, Vertex AI).
- A frontend web interface (e.g., React, Next.js, or Streamlit) providing the conversational UI and rendering data visualizations.
- Deployment and orchestration via Google Cloud Run for serverless scaling and ease of management.

This bundle equips your agent with specialized knowledge, step-by-step runbooks, and best practices to quickly scaffold, deploy, and troubleshoot these applications.

## Included Customizations

### Skills
- **`conversational-analytics-app`**: Instructs the agent on the architecture, development guidelines, and `gcloud` deployment steps for conversational analytics apps. The skill itself is a short overview (`SKILL.md`) that points to:
  - `reference/`: detailed docs (data agent context, deployment, frontend UX, troubleshooting, API quirks) loaded on demand.
  - `templates/`: starting-point code (Dockerfile, SSE backend relay, React chat component, smoke test) to adapt rather than generate from scratch.

*(More skills will be added here as the bundle grows.)*

## Usage

To use this bundle with your AI agent, you can configure it as a local plugin. For example, if you are using Jetski, you can make these skills available globally by symlinking this repository into your configuration folder:

```bash
mkdir -p ~/.gemini/config/plugins
ln -s $(pwd) ~/.gemini/config/plugins/conversational-analytics-bundle
```

*(No `plugin.json` exists yet — add one if your harness needs a formal plugin manifest instead of the symlink above.)*

## Contributing

To add new capabilities to this bundle:
- **Skills:** Add a new directory under `skills/` containing a `SKILL.md` file with your workflow instructions. For anything beyond a short skill, follow the pattern used by `conversational-analytics-app`: keep `SKILL.md` itself short (overview + pointers), put detailed docs in a `reference/` subdirectory loaded on demand, and put reusable starter code in a `templates/` subdirectory.
- **Agents:** none exist yet. If you add custom subagents (e.g., a specialized `frontend-designer` agent), create an `agents/` directory to hold them.
- **Rules:** none exist yet. If you add contextual guidelines to enforce specific coding styles or security standards, create a `rules/` directory to hold them.

## References
- [Conversational Analytics API Quickstarts](https://github.com/looker-open-source/ca-api-quickstarts)
- [Conversational Analytics API Overview](https://docs.cloud.google.com/gemini/data-agents/conversational-analytics-api/overview)
