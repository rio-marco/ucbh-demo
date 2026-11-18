# UCBH Claude Agent Workspace

Next.js application for running Claude against uploaded CSV/JSON files and QuickBooks Online data in an isolated temporary workspace.

## Run locally

```bash
npm install
# Add your Claude key and optional model override to .env.local
# CLAUDE_API_KEY=sk-ant-...
# CLAUDE_MODEL=claude-sonnet-4-5-20250929
npm run dev
```

The server calls the Claude Messages API with `CLAUDE_API_KEY`. Website users do not provide an API key; it stays on the server and is never sent to the browser. `CLAUDE_AUTH_TOKEN` is also supported for bearer-token gateways. Set `CLAUDE_MODEL` to override the default model. If the primary model is unavailable or rate-limited for the key, the runner tries `CLAUDE_FALLBACK_MODELS` (comma-separated, defaults to `claude-haiku-4-5-20251001`).

## Execution boundary

`POST /api/execute` accepts up to 40 CSV/JSON files (20 MB total, 2 MB per file) and a task. The browser uploader accepts CSV; generated QuickBooks report and update files are JSON. The server creates a mode-restricted temporary directory and gives Claude file tools scoped to that directory only:

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

The OAuth scope is `com.intuit.quickbooks.accounting`. **Import** fetches only four record types — customers (`quickbooks-customers.csv`), vendors (`quickbooks-vendors.csv`), employees (`quickbooks-employees.csv`) and invoices (`quickbooks-invoices.csv`). No other entities, company info or reports are imported. Per-entity failures are reported without discarding the rest of the import.

### QuickBooks write-back

If the task prompt asks to update existing records and QuickBooks inputs are present, the agent writes `quickbooks-updates.json`:

```json
{
  "operations": [
    {
      "entity": "Customer",
      "id": "123",
      "syncToken": "0",
      "fields": { "DisplayName": "Updated name" }
    }
  ]
}
```

The review screen shows every proposed operation. Pushing sends `POST /api/quickbooks/push` with `x-qb-confirm: push`; the route accepts 1–25 updates to existing, updatable records only. Each update is a sparse QuickBooks update and requires the record's current `SyncToken`, so re-import fresh data before retrying stale operations. Writes are allowed only in the sandbox by default; set `QB_ALLOW_PRODUCTION_WRITES=true` to permit production writes. Attempts and results are appended to `.data/quickbooks-push-log.jsonl` (ignored by git). Re-import QuickBooks data after a successful push to refresh the local snapshot.

## MCP Connector

The Prepare your task screen also offers **MCP Connector**: connect QuickBooks inline, confirm the MCP connection, then continue the normal task flow (environment selection, estimate, and agent run). Claude reads the connected QuickBooks company through a shared HTTP MCP server. It works without registration or login.

### Setup

Copy `.env.example` and add:

```bash
TOKEN_ENCRYPTION_KEY=<base64 output of: openssl rand -base64 32>
MCP_SIGNING_SECRET=<random string of at least 32 characters>
```

No second Intuit app registration is needed. MCP Connector reuses the existing QuickBooks login and the already-configured `QB_REDIRECT_URI` / `/api/quickbooks/callback` route. If QuickBooks is not connected yet, clicking the connector starts that same login flow and returns to the connector with the company connection ready.

No database service is required. Connector state is kept in a local JSON file at `.data/mcp-store.json`. The file is created on first use with owner-only permissions; expired sessions, states, nonces and confirmations are pruned automatically. This file-store backend is intended for single-process deployments.

### Flow and isolation

1. A new browser receives an anonymous `ucbh_sid` cookie: 32 cryptographically random bytes, HttpOnly, Secure, SameSite=Lax, 30-day rolling expiry. Only a SHA-256 hash is stored on the server.
2. `/api/mcp/connector/status` first checks the existing QuickBooks login. If needed, `/api/mcp/connector/auth` starts the existing `/api/quickbooks/auth` flow so Intuit redirects to the already-registered `/api/quickbooks/callback`. After login, the credentials are copied into this browser session's MCP store as AES-256-GCM encrypted tokens bound to the session hash and realm ID.
3. `/api/mcp/chat` creates a five-minute HMAC-signed, single-use MCP credential and passes the prompt to Claude with tools discovered from the remote MCP server. The browser never sees session IDs, tokens, or secrets.
4. `/api/mcp` is a stateless MCP Streamable HTTP server shared by all visitors. Every request verifies the signed credential and resolves the QuickBooks connection from the server-side session. It refreshes expiring access tokens under a file-backed lock and rotates persisted refresh tokens.
5. Read-only tools query Customer, Vendor, Employee and Invoice records. Update proposals are not applied until the visitor confirms them in the UI; `/api/mcp/confirm` then invokes the MCP apply tool with a secret that was never sent to Claude. Set `MCP_ALLOW_WRITES=true` to enable confirmed writes (`QB_ALLOW_PRODUCTION_WRITES=true` is additionally required for production companies).

All tool calls, OAuth events and confirmations are written to the local audit log without credentials. QuickBooks/Claude failures surface as plain-language messages in the chat panel.

## Current deployment gaps

This repository has no user authentication, durable database, billing integration, or private execution infrastructure. Runs therefore do not have authenticated ownership or durable history. The server-side Claude key is shared by executions on that deployment; for a multi-user service, add per-user authorization and durable result storage before charging for runs.

## Checks

```bash
npm run typecheck
npm run build
```
