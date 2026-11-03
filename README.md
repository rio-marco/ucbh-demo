# UCBH Codex Agent Workspace

Next.js application for running the official OpenAI Codex SDK against uploaded CSV files in an isolated temporary workspace.

## Run locally

```bash
npm install
codex login
npm run dev
```

The server uses the Codex CLI's existing ChatGPT login stored under `CODEX_HOME` (by default `~/.codex`). Website users do not need to provide an API key. The login must be available to the server process and is never sent to the browser. An `OPENAI_API_KEY` can optionally be configured server-side instead.

## Execution boundary

`POST /api/execute` accepts one to ten CSV files and a task. The server creates a mode-restricted temporary directory, starts Codex with workspace-write sandboxing, disables network and web search, streams response/file events, then deletes the workspace. SDK token usage is returned when present; the SDK does not provide provider charges or a reliable pre-run cost estimate, so the application does not invent either.

Generated files can be downloaded during review. They are intentionally not applied to the website's source tree.

## Current deployment gaps

This repository has no user authentication, durable database, billing integration, or private execution infrastructure. Runs therefore do not have authenticated ownership or durable history. The server-side Codex login is shared by executions on that deployment; for a multi-user service, use a supported per-user ChatGPT authorization flow rather than sharing one account. Deploy behind an authenticated identity provider and add durable per-user result storage and billing data before using it for multiple users or charging for runs.

## Checks

```bash
npm run typecheck
npm run build
```
