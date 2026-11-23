# UCBH Claude Agent Workspace

Next.js application for running Claude against uploaded CSV/JSON files and QuickBooks Online data in an isolated temporary workspace.

## Run locally

```bash
npm install
npm run dev
```

Claude uses Claude Platform OAuth: the user clicks **Connect Claude CoWork**, signs in on `auth.claude.com`, approves the app, and returns to the workspace. Tokens are exchanged and stored by the backend per browser session; users never enter an API key. `/api/claude/status` reports the per-session connection and gates MCP access. OAuth and model env files are read at runtime, so `.env*` changes apply without a process restart. Set `CLAUDE_MODEL` to override the default model; if unavailable, the runner tries `CLAUDE_FALLBACK_MODELS` (comma-separated, defaults to `claude-haiku-4-5-20251001`).

## Execution boundary

`POST /api/execute` accepts up to 40 CSV/JSON files (20 MB total, 2 MB per file) and a task. The browser uploader accepts CSV; generated QuickBooks report and update files are JSON. The server creates a mode-restricted temporary directory and gives Claude file tools scoped to that directory only:

- `list_files`
- `read_file`
- `write_file` (overwrite or append)

Uploaded files are written once and cannot be overwritten. Claude reads the inputs, performs the requested analysis, writes output files, and returns a summary. The route streams `status`, `message`, `activity`, `file_change`, `collecting`, and `complete` events over SSE. The workspace is deleted after the run. Token usage from the Claude API is returned when present; provider charges and pre-run costs are not invented.

Generated files can be downloaded during review. They are intentionally not applied to the website's source tree.

## QuickBooks connection

The workspace can also connect to QuickBooks Online using OAuth2. In the Prepare your task flow this connection is used by the MCP server only; the Upload Files tab accepts only files you upload manually. Configure:

```bash
QB_CLIENT_ID=...
QB_CLIENT_SECRET=...
QB_REDIRECT_URI=http://localhost:3000/api/quickbooks/callback
QB_ENVIRONMENT=sandbox
```

The callback URL is derived from the origin the browser is using, so localhost and tunnel previews (ngrok, Cloudflare Tunnel) both work. If `QB_REDIRECT_URI` matches the current origin it is used as-is; otherwise the app builds `<current-origin>/api/quickbooks/callback`.

Register **every** redirect URI you use in the Intuit developer dashboard, exactly matching scheme, host, port, and path. Development/sandbox keys allow `http://localhost`; production and tunnel URLs require HTTPS. A random free ngrok URL changes on restart, so use a static tunnel domain if you need a stable callback.

The OAuth scope is `com.intuit.quickbooks.accounting`. The `/api/quickbooks/data` endpoint can fetch customers (`quickbooks-customers.csv`), vendors (`quickbooks-vendors.csv`), employees (`quickbooks-employees.csv`), invoices (`quickbooks-invoices.csv`), bills (`quickbooks-bills.csv`) and sales orders (`quickbooks-sales-orders.csv`, when the connected company exposes that entity). No other entities, company info or reports are imported. Per-entity failures are reported without discarding the rest of the import.

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

The Prepare your task screen has two tabs:

- **MCP Connections** — a guided checklist: sign in to your own Claude account, connect the QuickBooks MCP server, then approve what the agent may do in QuickBooks Online. Visual guides are served from `/api/guide-images/<name>` using the PNG files in the project-root `image/` folder, so replacing a file there is reflected on refresh.
- **Upload Files** — upload CSV data on the left with preparation instructions and the guide image on the right.

After Claude, the MCP connection and permissions are ready, **Continue to the prompt** reveals the prompt textarea. The remaining flow is unchanged (environment selection, estimate, and agent run).

### Setup

Claude login uses Claude Platform OAuth (Linked billing). It requires an eligible Claude organization with Admin or Billing access; personal `claude.ai` accounts and subscription-only organizations cannot be linked. The organization that owns the OAuth app cannot link that app to itself, so approval must come from a separate eligible Claude Console organization. For testing, link a second organization that pays Anthropic directly, not the organization that owns the OAuth app.

In Claude Console:
1. Create an OAuth app with redirect URI `<origin>/api/claude/callback` and enable **Bill and link to organizations**. Copy its client ID.
2. Create an active user profile (`uprof_...`) that represents this app/customer.
3. Configure Client authentication with your identity provider issuer, subject pattern, and audience. Register this app's JWKS URL `<origin>/api/claude/jwks`.
4. Create a service account, configure Workload Identity Federation, and select the service account as the app's operator service account. Set a workspace for connection tokens. Enable Offline access only if you also add `offline_access` to `CLAUDE_OAUTH_SCOPES`.
5. Generate an RSA key for the JWKS and set the matching key id.

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out claude-oauth.pem
```

Add to `.env.local`:

```bash
CLAUDE_CLIENT_ID=<client id copied from Claude Console>
CLAUDE_USER_PROFILE_ID=<uprof_... copied from Claude Console>
CLAUDE_OAUTH_REDIRECT_URI=http://localhost:3000/api/claude/callback
CLAUDE_CLIENT_ASSERTION_ISSUER=<registered issuer>
CLAUDE_CLIENT_ASSERTION_AUDIENCE=<registered audience>
CLAUDE_CLIENT_ASSERTION_SUBJECT=<registered subject>
CLAUDE_CLIENT_ASSERTION_KID=<registered kid>
CLAUDE_CLIENT_ASSERTION_PRIVATE_KEY=<PEM contents with escaped \n>
CLAUDE_OAUTH_SCOPES=billing:attribution
TOKEN_ENCRYPTION_KEY=<base64 output of: openssl rand -base64 32>
MCP_SIGNING_SECRET=<random string of at least 32 characters>
```

`CLAUDE_OAUTH_SCOPES` must match the scopes allowed by the Claude OAuth app. If Claude returns `The requested scope is not one this client may be issued`, remove any scope the app has not enabled.

`/api/claude/auth` creates PKCE state and a pushed authorization request, then redirects the browser to `auth.claude.com/oauth/authorize`. `/api/claude/callback` exchanges the code and encrypts the connection access/refresh tokens into the browser session. `/api/claude/jwks` serves the public key used by the client assertion. Claude env values are read from `.env*` on each request, so edits apply without restarting the process.

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

This repository has no user authentication, durable database, billing integration, or private execution infrastructure. Runs therefore do not have authenticated ownership or durable history. Claude keys are encrypted per browser session, but the JSON-file MCP store is intended for a single-process deployment; add durable storage and per-user authorization before charging for runs.

## Checks

```bash
npm run typecheck
npm run build
```
