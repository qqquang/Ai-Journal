# Playwright MCP Tool

A local Model Context Protocol (MCP) server that wraps Playwright so MCP-aware clients can drive a browser for smoke checks, debugging, or research sessions alongside the journaling apps.

## Prerequisites
- Run `npm install` at the repo root so the workspace dependencies are installed.
- Install the Playwright browser binaries with `npx playwright install` (one-time per machine).

## Start the MCP Server
```bash
npm run mcp:playwright
```
This runs the published `playwright-mcp` CLI and exposes the default MCP tools over stdio.

## Sample Local Run
A scripted workflow lives at `tools/playwright-mcp/scripts/run-sample.mjs`. It boots the Next.js dev server on port 3100 (with Supabase calls stubbed), connects to the MCP server, navigates the browser to the local app, and executes a snippet that reports the page title and `<h1>` text.

Run it from the repo root:
```bash
npm run mcp:playwright:sample
```
Set `PLAYWRIGHT_MCP_TARGET` to point somewhere else (e.g. `http://127.0.0.1:3000`) if you want to test against a different environment. The script tears everything down once the checks finish.

## Example MCP Client Entry
Add an entry similar to the following in your MCP client configuration (adjust the path as needed):
```json
{
  "name": "playwright",
  "command": "npm",
  "args": ["run", "mcp:playwright"],
  "cwd": "/Users/quangnguyen/Desktop/Ai Journalling"
}
```

## Notes
- The server only runs locally and does not ship with the production apps.
- Keep MCP sessions out of CI unless scripted; it is intended for interactive use.
- Document any bespoke MCP flows (playbooks, prompt macros) under `packages/core/prompts` if they become repeatable.
