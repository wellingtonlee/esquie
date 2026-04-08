# RE Helper Tools

MCP server for AI-assisted reverse engineering. TypeScript + Docker.

## Architecture

- `src/index.ts` — Entry point, wires MCP server + stdio transport + shutdown hooks
- `src/docker/config.ts` — Env var parsing for sandbox resource limits (SandboxConfig type)
- `src/docker/sandbox.ts` — DockerSandbox class: container lifecycle, exec, file upload, idle auto-expiry
- `src/docker/runner.py` — Python runner baked into Docker image, session persistence via dill
- `src/tools/hex-utils.ts` — Native TS hex/binary/encoding tools (9 tools)
- `src/tools/scratchpad.ts` — In-memory key-value notepad (4 tools)
- `src/tools/python-eval.ts` — python_eval + reset_sandbox + upload_to_sandbox (3 tools)
- `Dockerfile` — Python 3.12-slim with RE packages

## Build

```bash
npm run build        # TypeScript -> dist/
docker build -t re-helper-sandbox:latest .  # Sandbox image (auto-built on first python_eval if missing)
```

## MCP SDK

Uses `@modelcontextprotocol/sdk` — register tools via `server.registerTool()` (not deprecated `server.tool()`).

## Docker Sandbox

- Session-persistent container (`sleep infinity`), lazy-initialized on first `python_eval`
- Network disabled, 512MB memory, 1 CPU, read-only rootfs, tmpfs /tmp
- PidsLimit 64, CapDrop ALL, ShmSize 1MB
- State persists across calls via `/tmp/session.pkl` (dill serialization)
- Auto-expires after idle timeout (default 30min, configurable via RE_SANDBOX_IDLE_TIMEOUT)
- Destroyed on SIGINT/SIGTERM

## Configuration

Resource limits configurable via env vars: RE_SANDBOX_MEMORY, RE_SANDBOX_CPUS, RE_SANDBOX_TIMEOUT, RE_SANDBOX_PIDS, RE_SANDBOX_IDLE_TIMEOUT. Defaults in `src/docker/config.ts`.
