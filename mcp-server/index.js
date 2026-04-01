#!/usr/bin/env node

/**
 * Sythio MCP Server
 *
 * Exposes your Sythio voice notes to Claude Desktop, ChatGPT, Cursor, etc.
 * via the Model Context Protocol.
 *
 * Setup:
 *   1. Generate an API key in Sythio (Profile → API Key)
 *   2. Set SYTHIO_API_KEY environment variable
 *   3. Add to claude_desktop_config.json:
 *      {
 *        "mcpServers": {
 *          "sythio": {
 *            "command": "node",
 *            "args": ["/path/to/sythio-mcp/index.js"],
 *            "env": { "SYTHIO_API_KEY": "sk_..." }
 *          }
 *        }
 *      }
 *
 * Cost: $0 — uses your existing Sythio API key.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.SYTHIO_API_KEY;
const API_BASE = process.env.SYTHIO_API_URL || "https://oewjbeqwihhzuvbsfctf.supabase.co/functions/v1/public-api";

if (!API_KEY) {
  console.error("SYTHIO_API_KEY environment variable is required");
  process.exit(1);
}

async function apiCall(action, params = {}) {
  const url = new URL(API_BASE);
  url.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

// ── Server setup ──

const server = new Server(
  { name: "sythio", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

// ── Tools ──

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_notes",
      description: "List all your Sythio voice notes. Returns titles, dates, durations, and IDs.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max notes to return (default 20, max 100)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "get_note",
      description: "Get a specific Sythio note with all its AI-generated results (summary, tasks, action plan, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Note ID (UUID)" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_transcript",
      description: "Get the full transcript of a note, including speaker segments if it's a conversation.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Note ID (UUID)" },
        },
        required: ["id"],
      },
    },
    {
      name: "search_notes",
      description: "Search through your notes by keyword. Searches titles, summaries, and transcripts.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_notes": {
        const data = await apiCall("list_notes", { limit: args?.limit, offset: args?.offset });
        const notes = data.notes || [];
        const text = notes.length === 0
          ? "No notes found."
          : notes.map((n, i) =>
              `${i + 1}. **${n.title}** (${n.id})\n   ${new Date(n.created_at).toLocaleDateString()} · ${Math.ceil(n.audio_duration / 60)} min${n.is_conversation ? ` · ${n.speakers_detected} speakers` : ""}${n.template ? ` · ${n.template}` : ""}`
            ).join("\n\n");
        return { content: [{ type: "text", text: `${data.total} total notes\n\n${text}` }] };
      }

      case "get_note": {
        const data = await apiCall("get_note", { id: args.id });
        const note = data.note;
        const results = data.mode_results || [];

        let text = `# ${note.title}\n`;
        text += `Date: ${new Date(note.created_at).toLocaleDateString()} · Duration: ${Math.ceil(note.audio_duration / 60)} min\n`;
        if (note.is_conversation) text += `Speakers: ${note.speakers_detected}\n`;
        text += `\n## Summary\n${note.summary || "N/A"}\n`;

        if (note.key_points?.length) {
          text += `\n## Key Points\n${note.key_points.map(p => `- ${p}`).join("\n")}\n`;
        }

        for (const r of results) {
          text += `\n## Mode: ${r.mode}\n${JSON.stringify(r.result, null, 2)}\n`;
        }

        return { content: [{ type: "text", text }] };
      }

      case "get_transcript": {
        const data = await apiCall("get_transcript", { id: args.id });
        let text = `# Transcript: ${data.title}\n\n`;

        if (data.is_conversation && data.segments?.length) {
          const speakers = data.speakers || [];
          for (const seg of data.segments) {
            const sp = speakers.find(s => s.id === seg.speaker);
            const name = sp?.custom_name || sp?.default_name || seg.speaker;
            const time = `${Math.floor(seg.start / 60)}:${String(Math.floor(seg.start % 60)).padStart(2, "0")}`;
            text += `[${time}] **${name}**: ${seg.text}\n\n`;
          }
        } else {
          text += data.transcript || "No transcript available.";
        }

        return { content: [{ type: "text", text }] };
      }

      case "search_notes": {
        const data = await apiCall("list_notes", { limit: 50 });
        const notes = (data.notes || []).filter(n => {
          const hay = [n.title, n.primary_mode, n.template || ""].join(" ").toLowerCase();
          return args.query.toLowerCase().split(/\s+/).every(w => hay.includes(w));
        });

        if (notes.length === 0) {
          return { content: [{ type: "text", text: `No notes found matching "${args.query}"` }] };
        }

        const text = notes.map((n, i) =>
          `${i + 1}. **${n.title}** (${n.id}) — ${new Date(n.created_at).toLocaleDateString()}`
        ).join("\n");

        return { content: [{ type: "text", text: `Found ${notes.length} notes:\n\n${text}` }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

// ── Resources (notes as browsable resources) ──

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const data = await apiCall("list_notes", { limit: 20 });
    return {
      resources: (data.notes || []).map(n => ({
        uri: `sythio://note/${n.id}`,
        name: n.title,
        description: `${new Date(n.created_at).toLocaleDateString()} · ${Math.ceil(n.audio_duration / 60)} min`,
        mimeType: "text/plain",
      })),
    };
  } catch {
    return { resources: [] };
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const match = uri.match(/^sythio:\/\/note\/(.+)$/);
  if (!match) throw new Error(`Invalid URI: ${uri}`);

  const data = await apiCall("get_note", { id: match[1] });
  const note = data.note;

  let text = `${note.title}\n${"=".repeat(note.title.length)}\n\n`;
  text += `Date: ${new Date(note.created_at).toLocaleDateString()}\n`;
  text += `Duration: ${Math.ceil(note.audio_duration / 60)} min\n\n`;
  text += `Summary:\n${note.summary || "N/A"}\n\n`;
  text += `Transcript:\n${note.transcript || "N/A"}`;

  return {
    contents: [{
      uri,
      mimeType: "text/plain",
      text,
    }],
  };
});

// ── Start ──

const transport = new StdioServerTransport();
await server.connect(transport);
