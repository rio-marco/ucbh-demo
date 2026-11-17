# UCBH Claude Agent Workspace

Next.js application for running Claude against uploaded CSV files in an isolated temporary workspace.

## Run locally

```bash
npm install
# Add your Claude key and optional model override to .env.local
# CLAUDE_API_KEY=sk-ant-...
# CLAUDE_MODEL=claude-sonnet-4-5-20250929
npm run dev
```

The server calls the Claude Messages API with `CLAUDE_API_KEY`. Website users do not provide an API key; it stays on the server and is never sent to the browser. `CLAUDE_AUTH_TOKEN` is also supported for bearer-token gateways. Set `CLAUDE_MODEL` (or `CLAUDE_MODEL`) to override the default model. If the primary model is unavailable or rate-limited for the key, the runner tries `CLAUDE_FALLBACK_MODELS` (comma-separated, defaults to `claude-haiku-4-5-20251001`).

## Execution boundary

`POST /api/execute` accepts one to ten CSV files and a task. The server creates a mode-restricted temporary directory and gives Claude file tools scoped to that directory only:

- `list_files`
- `read_file`
- `write_file` (overwrite or append)

Uploaded files are written once and cannot be overwritten. Claude reads the inputs, performs the requested analysis, writes output files, and returns a summary. The route streams `status`, `message`, `activity`, `file_change`, `collecting`, and `complete` events over SSE. The workspace is deleted after the run. Token usage from the Claude API is returned when present; provider charges and pre-run costs are not invented.

Generated files can be downloaded during review. They are intentionally not applied to the website's source tree.

## QuickBooks connection

The workspace can also import data from QuickBooks Online using OAuth2. Configure:

```bash
QB_CLIENT_ID=...
QB_CLIENT_SECRET=...
QB_REDIRECT_URI=http://localhost:3000/api/quickbooks/callback
QB_ENVIRONMENT=sandbox
```

The callback URL is derived from the origin the browser is using, so localhost and tunnel previews (ngrok, Cloudflare Tunnel) both work. If `QB_REDIRECT_URI` matches the current origin it is used as-is; otherwise the app builds `<current-origin>/api/quickbooks/callback`.

Register **every** redirect URI you use in the Intuit developer dashboard, exactly matching scheme, host, port, and path. Development/sandbox keys allow `http://localhost`; production and tunnel URLs require HTTPS. A random free ngrok URL changes on restart, so use a static tunnel domain if you need a stable callback.

## Current deployment gaps

This repository has no user authentication, durable database, billing integration, or private execution infrastructure. Runs therefore do not have authenticated ownership or durable history. The server-side Claude key is shared by executions on that deployment; for a multi-user service, add per-user authorization and durable result storage before charging for runs.

## Checks

```bash
npm run typecheck
npm run build
```
