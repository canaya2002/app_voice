# sythio-mcp

Connect your Sythio voice notes to Claude Desktop, ChatGPT, Cursor, and other AI tools via Model Context Protocol.

## Setup

1. Get your API key from [sythio.com](https://sythio.com) → Profile → Integrations → API Key
2. Install: `npm install -g sythio-mcp`
3. Add to your AI tool config:

### Claude Desktop

File → Settings → Developer → Edit Config:

```json
{
  "mcpServers": {
    "sythio": {
      "command": "sythio-mcp",
      "env": {
        "SYTHIO_API_KEY": "sk_your_key_here"
      }
    }
  }
}
```

### Cursor

Settings → MCP → Add Server → command: `sythio-mcp`, env: `SYTHIO_API_KEY=sk_...`

## Available Tools

- **list_notes** — List all your voice notes
- **get_note** — Get a note with all AI-generated results
- **get_transcript** — Get full transcript with speaker segments
- **search_notes** — Search notes by keyword

## Example Prompts

- "Search my Sythio notes about the Q4 budget meeting"
- "Get the transcript from my last note"
- "What action items came out of my client call?"
