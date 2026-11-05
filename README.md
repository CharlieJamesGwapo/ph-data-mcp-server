# 🇵🇭 ph-data-mcp-server

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants (Claude, Cursor, VS Code Copilot, and others) **Philippine data**: scholarships, holidays, regions, universities, peso exchange rates and weather.

Ask your assistant things like:

> "Incoming college ako, BS Engineering. Anong scholarship pwede?"
> "Which regular holidays fall on a Monday in 2027?"
> "List state universities in Region X and the scholarships open to their students."

**No API key needed.**

## Tools

| Tool | What it does | Data |
|---|---|---|
| `ph_search_scholarships` | Find scholarships that match a question (English or Taglish), optionally by level | Bundled, offline |
| `ph_get_scholarship` | Full eligibility, benefits, period, how to apply, official link | Bundled, offline |
| `ph_list_scholarships` | Browse with filters: level, provider type, region | Bundled, offline |
| `ph_list_holidays` | Regular and special holidays (2026–2027) | Live |
| `ph_list_regions` | All 17 regions with codes and centers | Live |
| `ph_list_schools` | Universities and colleges by region and type | Live |
| `ph_convert_currency` | Convert to or from PHP at daily rates | Live |
| `ph_get_weather` | Current weather in major cities | Live |

Every tool is read-only and supports `response_format: "json"` for structured output.

**About the scholarship data:** 35 programs (DOST-SEI, CHED, TESDA, OWWA, DSWD, GSIS, DepEd, Quezon City, Davao, Cagayan de Oro, SM, Megaworld, Gokongwei, Security Bank, Aboitiz, DLSU, Ateneo, UST), each checked against the provider's own page. Details the official page doesn't state are `null`, never guessed. It's the same dataset as [Iskolar AI](https://ph-scholarship-ai.vercel.app). Programs change every school year, so always confirm on the official page.

The live tools use the free [Philippines Public Data API](https://github.com/CharlieJamesGwapo/ph-public-api).

## Install

Requires Node.js 20.3 or later.

**Claude Code**

```bash
claude mcp add ph-data -- npx -y ph-data-mcp-server
```

**Claude Desktop** (`claude_desktop_config.json`), **Cursor** (`.cursor/mcp.json`) and most other clients:

```json
{
  "mcpServers": {
    "ph-data": {
      "command": "npx",
      "args": ["-y", "ph-data-mcp-server"]
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "ph-data": { "type": "stdio", "command": "npx", "args": ["-y", "ph-data-mcp-server"] }
  }
}
```

**Docker**

```bash
docker build -t ph-data-mcp-server .
docker run -i --rm ph-data-mcp-server
```

## Develop

```bash
git clone https://github.com/CharlieJamesGwapo/ph-data-mcp-server.git
cd ph-data-mcp-server
npm install
npm run build
npm run smoke                                        # calls every tool through a real MCP client
npx @modelcontextprotocol/inspector node dist/index.js   # interactive testing
```

`PH_API_BASE_URL` points the live tools at another deployment of the API.

### Releasing

1. Bump `version` in `package.json`, `server.json` (both places) and `src/index.ts`.
2. `npm publish` (the `prepublishOnly` script builds first).
3. `mcp-publisher login github` then `mcp-publisher publish` to update the [MCP Registry](https://registry.modelcontextprotocol.io) entry.

## Contributing

Scholarship fixes and additions are welcome. Edit `data/scholarships.json`, cite the provider's **own** page (not a blog or aggregator), and set `last_checked` to today.

## Support

If this is useful, ⭐ star the repo or [sponsor the maintainer](https://github.com/sponsors/CharlieJamesGwapo).

MIT License. Not affiliated with any agency, foundation or school listed.
