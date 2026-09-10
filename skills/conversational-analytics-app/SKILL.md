---
name: conversational-analytics-app
description: >-
  Use this skill when the user requests to create, deploy, or manage a conversational analytics application featuring a backend on Google Cloud Run and a web frontend.
type: Agent Skill
title: Conversational Analytics App Guide
resource: file:///Users/mlanciau/Git/conversational-analytics-bundle/skills/conversational-analytics-app
tags: [cloud-run, conversational-ai, jetski, python, frontend]
timestamp: 2026-09-10T16:47:00Z
---

# Conversational Analytics Application Guide

This skill provides instructions and best practices for building a conversational analytics application with a backend deployed on Google Cloud Run and a frontend.

## 1. Architecture Overview
- **Backend:** A containerized service (e.g., Python with FastAPI or Flask, or Node.js with Express) exposing a REST or gRPC API. It handles the conversational AI logic (e.g., using Gemini API or Vertex AI) and processes analytics data (e.g., querying BigQuery).
- **Frontend:** A web application (e.g., React, Next.js, or Streamlit) that provides the user chat interface and renders analytics dashboards or charts.
- **Deployment:** The backend is deployed to Google Cloud Run for auto-scaling and serverless execution.

## 2. Backend Development & Deployment (Cloud Run)
- Ensure the backend listens on the port defined by the `PORT` environment variable (default 8080).
- Include a `Dockerfile` to containerize the backend service.
- Deploy the backend to Cloud Run using the `gcloud` CLI:
  ```bash
  gcloud run deploy <service-name> \
    --source . \
    --region <region> \
    --allow-unauthenticated
  ```
- **Security & Config:** Manage sensitive API keys using Google Cloud Secret Manager and grant the Cloud Run service account the necessary IAM roles.

## 3. Frontend Development
- Configure the frontend to communicate with the Cloud Run backend URL.
- Implement robust error handling and loading states in the chat UI, as AI processing and analytics queries can take several seconds.
- **CORS:** Ensure the backend explicitly configures Cross-Origin Resource Sharing (CORS) to accept requests from the frontend's domain.

## 4. Troubleshooting
- To debug backend issues, check Cloud Run logs using:
  ```bash
  gcloud run services logs tail <service-name> --region <region>
  ```
- Ensure the Application Default Credentials (ADC) or service account keys are correctly configured for local testing.
