# RE Helper Tools

MCP server for AI-assisted reverse engineering. TypeScript + Docker.

## Architecture

- `src/index.ts` — Entry point, wires MCP server + stdio transport + shutdown hooks
- `src/tools/hex-utils.ts` — Native TS hex/binary/encoding tools (9 tools)
- `src/tools/scratchpad.ts` — In-memory key-value notepad (4 tools)
- `src/tools/python-eval.ts` — Sandboxed Python eval via Docker (1 tool)
- `src/docker/sandbox.ts` — DockerSandbox class: container lifecycle, exec, cleanup
- `src/docker/runner.py` — Python runner baked into Docker image, session persistence via dill
- `Dockerfile` — Python 3.12-slim with RE packages (pwntools, capstone, keystone, unicorn, lief, yara, pycryptodome)

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
- State persists across calls via `/tmp/session.pkl` (dill serialization)
- Destroyed on SIGINT/SIGTERM
