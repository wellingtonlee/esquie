# Esquie

MCP server providing computation, encoding, and note-taking tools for AI-assisted reverse engineering. Designed to complement disassembler-specific MCP servers (IDA Pro, Ghidra, Binary Ninja) by handling the ad-hoc computation side of RE work: struct unpacking, address math, crypto checks, encoding/decoding, and arbitrary Python scripting.

> Renamed from `re-helper-tools` in 0.3.0. Existing users should remove the old image/container: `docker rmi re-helper-sandbox:latest && docker rm -f re-helper-sandbox`.

## Prerequisites

- **Node.js** 20 or later
- **npm** (included with Node.js)
- **Docker Desktop** or **Docker Engine** — must be running before using `python_eval`

Verify your environment:

```bash
node --version   # v20.x or later
docker info      # should print server info without errors
```

## Quick Start

```bash
# Clone and enter the project
git clone <repo-url> && cd esquie

# Install dependencies and compile TypeScript
npm install
npm run build

# Build the Python sandbox Docker image (~1-2 min on first run)
docker build -t esquie-sandbox:latest .
```

> The Docker image is also built automatically on the first `python_eval` call if it doesn't exist, but pre-building avoids a delay during your first session.

## MCP Configuration

### Claude Code

Add to your project's `.mcp.json` or `~/.claude.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "esquie": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/esquie"
    }
  }
}
```

`cwd` must point to the project root so the server can locate the `Dockerfile` for auto-building the sandbox image.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "esquie": {
      "command": "node",
      "args": ["/absolute/path/to/esquie/dist/index.js"],
      "cwd": "/absolute/path/to/esquie"
    }
  }
}
```

## Tools Reference

### python_eval

Execute arbitrary Python in a sandboxed Docker container. Session state (variables, imports, function definitions) persists across calls within the same server session.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | yes | Python code to execute |
| `timeout` | number | no | Timeout in ms (default: 30000) |

**Pre-installed packages:** pwntools, capstone, keystone-engine, unicorn, lief, yara-python, pycryptodome, dill

**Examples:**

```python
# Expression — result is returned automatically
0x401000 + 0x1a4
# → 4198564

# State persists across calls
from capstone import *
md = Cs(CS_ARCH_X86, CS_MODE_64)

# Subsequent call can use `md`
for insn in md.disasm(b"\x55\x48\x89\xe5", 0x1000):
    print(f"0x{insn.address:x}: {insn.mnemonic} {insn.op_str}")
# → 0x1000: push rbp
# → 0x1001: mov rbp, rsp
```

### Hex/Binary Utilities

Native TypeScript tools — no Docker overhead, instant response.

| Tool | Parameters | Description | Example |
|------|-----------|-------------|---------|
| `hex_to_dec` | `hex` | Hex to decimal (BigInt-safe) | `"deadbeef"` → `"3735928559"` |
| `dec_to_hex` | `dec` | Decimal to hex (BigInt-safe) | `"3735928559"` → `"deadbeef"` |
| `hex_to_ascii` | `hex` | Hex bytes to UTF-8 text | `"48656c6c6f"` → `"Hello"` |
| `ascii_to_hex` | `text` | UTF-8 text to hex bytes | `"Hello"` → `"48656c6c6f"` |
| `xor_buffers` | `hex_a`, `hex_b` | XOR two buffers (shorter repeats) | `"4141"`, `"0f0f"` → `"4e4e"` |
| `hash` | `data`, `algorithm`, `encoding?` | MD5/SHA1/SHA256 digest | `"test"`, `"sha256"` → `"9f86d08..."` |
| `byte_pattern_search` | `hex_data`, `pattern` | Find byte pattern offsets (`??` = wildcard) | `"4d5a900003"`, `"4d5a??90"` → `{"offsets":[0],"count":1}` |
| `base64_encode` | `data`, `encoding?` | Base64 encode (utf8 or hex input) | `"Hello"` → `"SGVsbG8="` |
| `base64_decode` | `data`, `output_encoding?` | Base64 decode (utf8 or hex output) | `"SGVsbG8="` → `"Hello"` |

All hex parameters accept optional `0x` prefix and ignore whitespace.

### Sandbox Management

| Tool | Parameters | Description |
|------|-----------|-------------|
| `reset_sandbox` | *(none)* | Destroy the container and clear all session state. Next `python_eval` starts fresh. |
| `upload_to_sandbox` | `filename`, `content_base64` | Upload a file (base64-encoded) into `/tmp/<filename>` inside the container. 10MB limit. |
| `list_sandbox_files` | *(none)* | `ls -la /tmp` inside the container. |
| `download_from_sandbox` | `filename` | Read `/tmp/<filename>` and return `{filename, size, content_base64}`. 10MB limit. |

### Scratchpad

Key-value store for persisting analysis notes, renamed symbols, struct definitions, and other context. By default in-memory only (cleared on server restart). Set `ESQUIE_NOTES_FILE` to an absolute file path to persist notes to disk.

| Tool | Parameters | Description |
|------|-----------|-------------|
| `set_note` | `key`, `value` | Store or overwrite a note |
| `get_note` | `key` | Retrieve a note by key |
| `list_notes` | *(none)* | List all notes as JSON |
| `delete_note` | `key` | Remove a note |

Notes are also exposed as **MCP resources** under `note://{key}` URIs, so MCP clients that support resources can browse and reference them directly.

## Sandbox Security Model

The `python_eval` container runs with multiple layers of isolation:

| Constraint | Effect |
|-----------|--------|
| `NetworkMode: "none"` | No network access — cannot exfiltrate data or download payloads |
| `Memory: 512MB` | Hard memory limit prevents runaway allocations |
| `NanoCpus: 1e9` | Capped at 1 CPU core |
| `PidsLimit: 64` | Prevents fork bombs |
| `CapDrop: ALL` | All Linux capabilities dropped — zero effective/permitted/inheritable caps |
| `ShmSize: 1MB` | Shared memory restricted from default 64MB |
| `ReadonlyRootfs: true` | Filesystem is immutable — only `/tmp` is writable |
| `Tmpfs /tmp (100MB)` | Ephemeral writable scratch space, capped at 100MB |
| `User: sandbox` | Non-root user (uid 1000) inside the container |
| `no-new-privileges` | Prevents privilege escalation via setuid/setgid binaries |
| Per-call timeout | Default 30s, configurable — kills exec on expiry |
| Output truncation | stdout/stderr capped at 100KB to prevent context flooding |
| Idle auto-expiry | Container destroyed after 30min of inactivity (configurable) |
| Upload/download size cap | 10MB per call to bound exfil-via-roundtrip risk |
| Read-only host mount | When `ESQUIE_SANDBOX_MOUNT` is set, the host directory is mounted at `/mnt/host` with the Docker `:ro` flag — kernel-level read-only. Path is fixed at server start; the LLM cannot select what gets mounted. |

## Architecture

```
Claude Code / Claude Desktop
        │
        │ stdio (JSON-RPC)
        ▼
┌─────────────────────────┐
│  MCP Server (Node.js)   │
│                         │
│  ┌───────────────────┐  │
│  │ hex-utils.ts      │──┼── hex_to_dec, xor_buffers, hash, ...
│  │ (native TS)       │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ scratchpad.ts     │──┼── set_note, get_note, list_notes, ...
│  │ (Map + opt. JSON) │──┼── MCP resources: note://{key}
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ python-eval.ts    │──┼── python_eval, reset_sandbox,
│  │ (5 MCP tools)     │  │   upload/list/download_from_sandbox
│  └─────────┬─────────┘  │
│            │ calls      │
│            ▼            │
│  ┌─────────┴─────────┐  │       ┌───────────────────────────────┐
│  │ sandbox.ts        │──┼──────►│  Docker Container             │
│  │ (Docker lifecycle)│  │       │  (esquie-sandbox:latest)      │
│  └───────────────────┘  │       │                               │
│                         │       │  python3 /opt/runner.py       │
│                         │       │  ├─ loads session from pkl    │
│                         │       │  ├─ exec(code) in namespace   │
│                         │       │  └─ saves session to pkl      │
└─────────────────────────┘       └───────────────────────────────┘
```

- **Lazy init:** Container is created on the first `python_eval` call and kept alive for the session.
- **Session persistence:** Python variables survive across calls via `dill` serialization to `/tmp/session.pkl` inside the container.
- **Auto-expiry:** Container is automatically destroyed after 30 minutes of idle time (configurable via `ESQUIE_SANDBOX_IDLE_TIMEOUT`).
- **Cleanup:** Container is stopped and removed on server shutdown (SIGINT/SIGTERM).

## Configuration

Resource limits and timeouts are configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ESQUIE_SANDBOX_MEMORY` | `512` | Memory limit in MB (64–8192) |
| `ESQUIE_SANDBOX_CPUS` | `1` | CPU core count (1–16) |
| `ESQUIE_SANDBOX_TIMEOUT` | `30000` | Default exec timeout in ms (1000–600000) |
| `ESQUIE_SANDBOX_PIDS` | `64` | PID limit (8–1024) |
| `ESQUIE_SANDBOX_IDLE_TIMEOUT` | `1800000` | Auto-expiry idle timeout in ms (60000–86400000, default 30 min) |
| `ESQUIE_NOTES_FILE` | *(unset)* | Absolute path to a JSON file. When set, scratchpad notes persist across server restarts. |
| `ESQUIE_SANDBOX_MOUNT` | *(unset)* | Absolute path to a host directory. When set, the directory is bind-mounted **read-only** at `/mnt/host` inside the sandbox container so `python_eval` can analyze its contents without uploading each file. Invalid paths (non-absolute, non-existent, or not a directory) are logged and skipped. |

Out-of-range values are clamped to the nearest bound and a warning is logged to stderr.

Set them in your MCP config's `env` block or export before starting the server:

```json
{
  "mcpServers": {
    "esquie": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/esquie",
      "env": {
        "ESQUIE_SANDBOX_MEMORY": "1024",
        "ESQUIE_SANDBOX_TIMEOUT": "60000",
        "ESQUIE_NOTES_FILE": "/Users/me/.esquie/notes.json",
        "ESQUIE_SANDBOX_MOUNT": "/Users/me/samples"
      }
    }
  }
}
```

## Development

```bash
# Run in development mode (auto-compiles via tsx)
npm run dev

# Compile TypeScript to dist/
npm run build

# Rebuild the Docker image (required after changing runner.py or Dockerfile)
docker build -t esquie-sandbox:latest .

# Force-recreate the sandbox container (e.g. after image rebuild)
docker rm -f esquie-sandbox
```

CI runs `npm ci && npm run build` on every push and PR to `main` (`.github/workflows/build.yml`).

### Project Structure

```
esquie/
├── package.json
├── tsconfig.json
├── Dockerfile                 # Python sandbox image definition
├── .github/workflows/
│   └── build.yml              # CI build check
├── src/
│   ├── index.ts               # Entry point: server setup, tool/resource registration, shutdown
│   ├── docker/
│   │   ├── config.ts          # Env var config parsing
│   │   ├── sandbox.ts         # DockerSandbox class: container lifecycle + exec + file I/O
│   │   └── runner.py          # Python runner baked into Docker image
│   └── tools/
│       ├── python-eval.ts     # python_eval, reset_sandbox, upload/list/download
│       ├── hex-utils.ts       # Native hex/binary/encoding tools
│       └── scratchpad.ts      # Key-value notepad (in-memory + optional JSON persistence)
└── dist/                      # Compiled output (git-ignored)
```

## Troubleshooting

**`python_eval` fails with "Cannot connect to the Docker daemon"**
Docker Desktop or Docker Engine is not running. Start it and try again.

**`python_eval` hangs on first call**
The sandbox Docker image is being built automatically. This takes 1-2 minutes on first run. Pre-build with `docker build -t esquie-sandbox:latest .` to avoid this.

**"Conflict. The container name /esquie-sandbox is already in use"**
A leftover container from a previous session. Remove it:
```bash
docker rm -f esquie-sandbox
```

**Session state is lost**
The container was destroyed (server restart, Docker restart, manual removal). State lives in `/tmp` inside the container and does not survive container removal. This is by design.

**"Execution timed out"**
The default timeout is 30 seconds. Pass a higher `timeout` value (in ms) for long-running computations. Maximum practical limit depends on the MCP client.

**Docker image is stale after editing `runner.py`**
Rebuild the image and remove the old container:
```bash
docker build -t esquie-sandbox:latest .
docker rm -f esquie-sandbox
```

**Upgrading from `re-helper-tools`**
Remove the old image and container after upgrading:
```bash
docker rmi re-helper-sandbox:latest
docker rm -f re-helper-sandbox
```
Update any `RE_SANDBOX_*` env vars in your MCP config to `ESQUIE_SANDBOX_*`.
