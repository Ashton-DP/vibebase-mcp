# vibebase-mcp

Let your AI assistant (Claude, Cursor, Windsurf) provision a [Vibebase](https://vibebase.io) backend — a hosted Postgres database + auth — in one command.

## Setup

1. Get your API key from your [Vibebase dashboard](https://vibebase.io/dashboard).
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

3. Then just tell your assistant: **"set up a backend for this app."**

It calls the `provision_backend` tool, creates a real backend, and writes `.env.local` + a client file into your project. Your app can immediately store data and log users in.

## License

MIT
