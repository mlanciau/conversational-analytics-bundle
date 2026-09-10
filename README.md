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
- **`conversational-analytics-app`**: Instructs the agent on the architecture, development guidelines, and `gcloud` deployment steps for conversational analytics apps. 

*(More skills and agents will be added here as the bundle grows.)*

## Usage

To use this bundle with your AI agent, you can configure it as a local plugin. For example, if you are using Jetski, you can make these skills available globally by symlinking this repository into your configuration folder:

```bash
mkdir -p ~/.gemini/config/plugins
ln -s $(pwd) ~/.gemini/config/plugins/conversational-analytics-bundle
```

*(Alternatively, you can create a `plugin.json` to properly declare it as a plugin module according to the customization system guidelines).*

## Contributing

To add new capabilities to this bundle:
- **Skills:** Add a new directory under `skills/` containing a `SKILL.md` file with your workflow instructions.
- **Agents:** Add custom subagents under an `agents/` directory (e.g., a specialized `frontend-designer` agent).
- **Rules:** Add contextual guidelines in a `rules/` directory to enforce specific coding styles and security standards.
