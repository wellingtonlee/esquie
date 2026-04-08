# re-helper-tools

MCP server providing computation, encoding, and note-taking tools for AI-assisted reverse engineering. Designed to complement disassembler-specific MCP servers (IDA Pro, Ghidra, Binary Ninja) by handling the ad-hoc computation side of RE work: struct unpacking, address math, crypto checks, encoding/decoding, and arbitrary Python scripting.

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
git clone <repo-url> && cd re-helper-tools

# Install dependencies and compile TypeScript
npm install
npm run build

# Build the Python sandbox Docker image (~1-2 min on first run)
docker build -t re-helper-sandbox:latest .
```

> The Docker image is also built automatically on the first `python_eval` call if it doesn't exist, but pre-building avoids a delay during your first session.

## MCP Configuration

### Claude Code

Add to your project's `.mcp.json` or `~/.claude.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "re-helper-tools": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/re-helper-tools"
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
    "re-helper-tools": {
      "command": "node",
      "args": ["/absolute/path/to/re-helper-tools/dist/index.js"],
      "cwd": "/absolute/path/to/re-helper-tools"
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

### Scratchpad

In-memory key-value store for persisting analysis notes, renamed symbols, struct definitions, and other context across a session.

| Tool | Parameters | Description |
|------|-----------|-------------|
| `set_note` | `key`, `value` | Store or overwrite a note |
| `get_note` | `key` | Retrieve a note by key |
| `list_notes` | *(none)* | List all notes as JSON |
| `delete_note` | `key` | Remove a note |

Notes are stored in server memory and cleared when the MCP server restarts.

## Sandbox Security Model

The `python_eval` container runs with multiple layers of isolation:

| Constraint | Effect |
|-----------|--------|
| `NetworkMode: "none"` | No network access — cannot exfiltrate data or download payloads |
| `Memory: 512MB` | Hard memory limit prevents runaway allocations |
| `NanoCpus: 1e9` | Capped at 1 CPU core |
| `ReadonlyRootfs: true` | Filesystem is immutable — only `/tmp` is writable |
| `Tmpfs /tmp (100MB)` | Ephemeral writable scratch space, capped at 100MB |
| `User: sandbox` | Non-root user inside the container |
| `no-new-privileges` | Prevents privilege escalation via setuid/setgid binaries |
| Per-call timeout | Default 30s, configurable — kills exec on expiry |
| Output truncation | stdout/stderr capped at 100KB to prevent context flooding |

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
│  │ (in-memory Map)   │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │       ┌─────────────────────────────┐
│  │ python-eval.ts    │──┼──────►│  Docker Container            │
│  │                   │  │ exec  │  (re-helper-sandbox:latest)  │
│  └───────────────────┘  │       │                               │
│  ┌───────────────────┐  │       │  python3 /opt/runner.py       │
│  │ sandbox.ts        │──┼──────►│  ├─ loads session from pkl    │
│  │ (Docker lifecycle)│  │       │  ├─ exec(code) in namespace   │
│  └───────────────────┘  │       │  └─ saves session to pkl      │
└─────────────────────────┘       └─────────────────────────────┘
```

- **Lazy init:** Container is created on the first `python_eval` call and kept alive for the session.
- **Session persistence:** Python variables survive across calls via `dill` serialization to `/tmp/session.pkl` inside the container.
- **Cleanup:** Container is stopped and removed on server shutdown (SIGINT/SIGTERM).

## Development

```bash
# Run in development mode (auto-compiles via tsx)
npm run dev

# Compile TypeScript to dist/
npm run build

# Rebuild the Docker image (required after changing runner.py or Dockerfile)
docker build -t re-helper-sandbox:latest .

# Force-recreate the sandbox container (e.g. after image rebuild)
docker rm -f re-helper-sandbox
```

### Project Structure

```
re-helper-tools/
├── package.json
├── tsconfig.json
├── Dockerfile                 # Python sandbox image definition
├── src/
│   ├── index.ts               # Entry point: server setup, tool registration, shutdown
│   ├── docker/
│   │   ├── sandbox.ts         # DockerSandbox class: container lifecycle + exec
│   │   └── runner.py          # Python runner baked into Docker image
│   └── tools/
│       ├── python-eval.ts     # python_eval tool
│       ├── hex-utils.ts       # Native hex/binary/encoding tools
│       └── scratchpad.ts      # In-memory key-value notepad
└── dist/                      # Compiled output (git-ignored)
```

## Troubleshooting

**`python_eval` fails with "Cannot connect to the Docker daemon"**
Docker Desktop or Docker Engine is not running. Start it and try again.

**`python_eval` hangs on first call**
The sandbox Docker image is being built automatically. This takes 1-2 minutes on first run. Pre-build with `docker build -t re-helper-sandbox:latest .` to avoid this.

**"Conflict. The container name /re-helper-sandbox is already in use"**
A leftover container from a previous session. Remove it:
```bash
docker rm -f re-helper-sandbox
```

**Session state is lost**
The container was destroyed (server restart, Docker restart, manual removal). State lives in `/tmp` inside the container and does not survive container removal. This is by design.

**"Execution timed out"**
The default timeout is 30 seconds. Pass a higher `timeout` value (in ms) for long-running computations. Maximum practical limit depends on the MCP client.

**Docker image is stale after editing `runner.py`**
Rebuild the image and remove the old container:
```bash
docker build -t re-helper-sandbox:latest .
docker rm -f re-helper-sandbox
```
