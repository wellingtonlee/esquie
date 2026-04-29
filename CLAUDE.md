# Esquie

MCP server for AI-assisted reverse engineering. TypeScript + Docker. (Renamed from `re-helper-tools`.)

## Architecture

- `src/index.ts` — Entry point, wires MCP server + stdio transport + scratchpad MCP resources + shutdown hooks
- `src/docker/config.ts` — Env var parsing for sandbox resource limits (SandboxConfig type)
- `src/docker/sandbox.ts` — DockerSandbox class: container lifecycle, exec, file upload/download/list, idle auto-expiry
- `src/docker/runner.py` — Python runner baked into Docker image, session persistence via dill
- `src/tools/hex-utils.ts` — Native TS hex/binary/encoding tools (9 tools)
- `src/tools/scratchpad.ts` — Key-value notepad (4 tools), optional disk persistence via `ESQUIE_NOTES_FILE`
- `src/tools/python-eval.ts` — python_eval + reset_sandbox + upload_to_sandbox + list_sandbox_files + download_from_sandbox (5 tools)
- `Dockerfile` — Python 3.12-slim with RE packages
- `.github/workflows/build.yml` — CI: build check on push/PR

## Build

```bash
npm run build        # TypeScript -> dist/
docker build -t esquie-sandbox:latest .  # Sandbox image (auto-built on first python_eval if missing)
```

## MCP SDK

Uses `@modelcontextprotocol/sdk` — register tools via `server.registerTool()` and resources via `server.registerResource()` (not deprecated `server.tool()` / `server.resource()`).

Scratchpad notes are exposed as MCP resources under `note://{key}`. The scratchpad module calls `server.sendResourceListChanged()` via an `onScratchpadChange` callback wired in `index.ts` whenever notes are added/removed.

## Docker Sandbox

- Session-persistent container (`sleep infinity`), lazy-initialized on first `python_eval`
- Network disabled, 512MB memory, 1 CPU, read-only rootfs, tmpfs /tmp
- PidsLimit 64, CapDrop ALL, ShmSize 1MB
- State persists across calls via `/tmp/session.pkl` (dill serialization)
- Auto-expires after idle timeout (default 30min, configurable via `ESQUIE_SANDBOX_IDLE_TIMEOUT`)
- Destroyed on SIGINT/SIGTERM
- Image tag: `esquie-sandbox:latest`, container name: `esquie-sandbox`

## Configuration

Resource limits configurable via env vars: `ESQUIE_SANDBOX_MEMORY`, `ESQUIE_SANDBOX_CPUS`, `ESQUIE_SANDBOX_TIMEOUT`, `ESQUIE_SANDBOX_PIDS`, `ESQUIE_SANDBOX_IDLE_TIMEOUT`. Defaults in `src/docker/config.ts`.

Optional persistence: `ESQUIE_NOTES_FILE=/path/to/notes.json` makes the scratchpad write through to disk so notes survive server restarts. Atomic write via `<file>.tmp` rename. Errors fall back to in-memory.

## Renaming history

`0.3.0` renamed the project from `re-helper-tools` → `esquie`. Image tag, container name, npm package name, server name, and `RE_SANDBOX_*` env vars (now `ESQUIE_SANDBOX_*`) all changed in lockstep. The old image (`re-helper-sandbox:latest`) and container (`re-helper-sandbox`) can be removed manually with `docker rmi re-helper-sandbox:latest && docker rm -f re-helper-sandbox` after upgrading.
