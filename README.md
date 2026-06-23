# vibebase-mcp

**Never think about your backend again.** Tell your AI assistant (Claude, Cursor, Windsurf) to *"set up a backend"* and [Vibebase](https://vibebase.io) provisions a hosted Postgres database — with auth, file storage, and vector search — and wires it straight into your app. One command. One flat price. No dashboards, no SQL.

## What you get

- **Postgres database** — hosted, scales to zero when idle
- **Auth** — email/password + Google & GitHub social login
- **File storage** — store and serve uploads
- **Vector search** — pgvector, for RAG / AI features

…all written into your project as `.env.local` + a ready-to-use client file.

## Setup

1. Grab your API key from your [Vibebase dashboard](https://vibebase.io/dashboard).
2. Add this to your MCP config (Cursor: `~/.cursor/mcp.json` · Claude Code: `.mcp.json`):

```json
{
  "mcpServers": {
    "vibebase": {
      "command": "npx",
      "args": ["-y", "vibebase-mcp"],
      "env": {
        "VIBEBASE_URL": "https://vibebase.io",
        "VIBEBASE_KEY": "bp_your_api_key"
      }
    }
  }
}
```

3. Tell your assistant: **"set up a backend for this app."**

It calls the `provision_backend` tool, creates a real backend, and writes `.env.local` + a client into your project. Your app can immediately store data and log users in.

## Why Vibebase

Other backends hand you a dashboard, SQL, and a pager. Vibebase hands you nothing to manage. If you can describe your app, you can run it — for one flat, predictable price.

[vibebase.io](https://vibebase.io) · MIT
